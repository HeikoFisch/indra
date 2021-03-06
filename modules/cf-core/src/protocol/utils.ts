import { delay, recoverAddressWithEthers, ILoggerService } from "@connext/types";
import { JsonRpcProvider } from "ethers/providers";
import { BigNumber, defaultAbiCoder, getAddress } from "ethers/utils";

import {
  AppInstance,
  CoinTransfer,
  convertCoinTransfersToCoinTransfersMap,
  TokenIndexedCoinTransferMap,
} from "../models";
import {
  CoinBalanceRefundAppState,
  multiAssetMultiPartyCoinTransferEncoding,
  MultiAssetMultiPartyCoinTransferInterpreterParams,
  OutcomeType,
  SingleAssetTwoPartyCoinTransferInterpreterParams,
  TwoPartyFixedOutcome,
  TwoPartyFixedOutcomeInterpreterParams,
} from "../types";
import { logTime } from "../utils";

export async function assertIsValidSignature(
  expectedSigner: string,
  commitmentHash?: string,
  signature?: string,
): Promise<void> {
  if (typeof commitmentHash === "undefined") {
    throw new Error("assertIsValidSignature received an undefined commitment");
  }
  if (typeof signature === "undefined") {
    throw new Error("assertIsValidSignature received an undefined signature");
  }
  // recoverAddress: 83 ms, hashToSign: 7 ms
  const signer = await recoverAddressWithEthers(commitmentHash, signature);
  if (getAddress(expectedSigner).toLowerCase() !== signer.toLowerCase()) {
    throw new Error(
      `Validating a signature with expected signer ${expectedSigner} but recovered ${signer} for commitment hash ${commitmentHash}.`,
    );
  }
}

/**
 * Get the outcome of the app instance given, decode it according
 * to the outcome type stored in the app instance model, and return
 * a value uniformly across outcome type and whether the app is virtual
 * or direct. This return value must not contain the intermediary.
 */
export async function computeTokenIndexedFreeBalanceIncrements(
  appInstance: AppInstance,
  provider: JsonRpcProvider,
  encodedOutcomeOverride: string = "",
  blockNumberToUseIfNecessary?: number,
  log?: ILoggerService,
): Promise<TokenIndexedCoinTransferMap> {
  const { outcomeType } = appInstance;

  let checkpoint = Date.now();
  const encodedOutcome =
    encodedOutcomeOverride || (await appInstance.computeOutcomeWithCurrentState(provider));

  if(log)
    logTime(log, checkpoint, `Computed outcome with current state`)

  // FIXME: This is a very sketchy way of handling this edge-case
  if (appInstance.state["threshold"] !== undefined) {
    return handleRefundAppOutcomeSpecialCase(
      encodedOutcome,
      appInstance,
      provider,
      blockNumberToUseIfNecessary,
    );
  }

  switch (outcomeType) {
    case OutcomeType.TWO_PARTY_FIXED_OUTCOME: {
      return handleTwoPartyFixedOutcome(
        encodedOutcome,
        appInstance.twoPartyOutcomeInterpreterParams,
      );
    }
    case OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER: {
      return handleSingleAssetTwoPartyCoinTransfer(
        encodedOutcome,
        appInstance.singleAssetTwoPartyCoinTransferInterpreterParams,
        log
      );
    }
    case OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER: {
      return handleMultiAssetMultiPartyCoinTransfer(
        encodedOutcome,
        appInstance.multiAssetMultiPartyCoinTransferInterpreterParams,
      );
    }
    default: {
      throw new Error(
        `computeTokenIndexedFreeBalanceIncrements received an AppInstance with unknown OutcomeType: ${outcomeType}`,
      );
    }
  }
}

/**
 * This is in a special situation because it is
 * a `view` function. Since we do not have any encapsulation of a
 * getter for blockchain-based data, we naively re-query our only
 * hook to the chain (i.e., the `provider` variable) several times
 * until, at least one time out of 10, the values we see on chain
 * indicate a nonzero free balance increment.
 */
// FIXME:
// https://github.com/counterfactual/monorepo/issues/1371
async function handleRefundAppOutcomeSpecialCase(
  encodedOutcome: string,
  appInstance: AppInstance,
  provider: JsonRpcProvider,
  blockNumberToUseIfNecessary?: number,
): Promise<TokenIndexedCoinTransferMap> {
  let mutableOutcome = encodedOutcome;
  let attempts = 1;
  while (attempts <= 10) {
    const [{ to, amount }] = decodeRefundAppState(mutableOutcome);
    const currentBlockNumber = await provider.getBlockNumber();
    // if blockNumberToUseIfNecessary is specified and has elapsed, use the decoded state even
    // if amount is 0
    const blockNumberSpecifiedAndElapsed =
      blockNumberToUseIfNecessary && currentBlockNumber >= blockNumberToUseIfNecessary;
    // if blockNumberToUseIfNecessary is not specified, wait for nonzero balance refund or error
    if (amount.gt(0) || blockNumberSpecifiedAndElapsed) {
      return {
        [(appInstance.state as CoinBalanceRefundAppState).tokenAddress]: {
          [to]: amount,
        },
      };
    }

    attempts += 1;

    await delay(1000 * attempts);

    // Note this statement queries the blockchain each time and
    // is the main reason for this 10-iteration while block.
    mutableOutcome = await appInstance.computeOutcomeWithCurrentState(provider);
  }

  throw new Error("When attempting to check for a deposit, did not find any non-zero deposits.");
}

function handleTwoPartyFixedOutcome(
  encodedOutcome: string,
  interpreterParams: TwoPartyFixedOutcomeInterpreterParams,
): TokenIndexedCoinTransferMap {
  const { amount, playerAddrs, tokenAddress } = interpreterParams;

  switch (decodeTwoPartyFixedOutcome(encodedOutcome)) {
    case TwoPartyFixedOutcome.SEND_TO_ADDR_ONE:
      return {
        [tokenAddress]: {
          [playerAddrs[0]]: amount,
        },
      };
    case TwoPartyFixedOutcome.SEND_TO_ADDR_TWO:
      return {
        [tokenAddress]: {
          [playerAddrs[1]]: amount,
        },
      };
    case TwoPartyFixedOutcome.SPLIT_AND_SEND_TO_BOTH_ADDRS:
    default:
      return {
        [tokenAddress]: {
          [playerAddrs[0]]: amount.div(2),
          [playerAddrs[1]]: amount.sub(amount.div(2)),
        },
      };
  }
}

function handleMultiAssetMultiPartyCoinTransfer(
  encodedOutcome: string,
  interpreterParams: MultiAssetMultiPartyCoinTransferInterpreterParams,
): TokenIndexedCoinTransferMap {
  const decodedTransfers = decodeMultiAssetMultiPartyCoinTransfer(encodedOutcome);

  return interpreterParams.tokenAddresses.reduce(
    (acc, tokenAddress, index) => ({
      ...acc,
      [tokenAddress]: convertCoinTransfersToCoinTransfersMap(decodedTransfers[index]),
    }),
    {},
  );
}

function handleSingleAssetTwoPartyCoinTransfer(
  encodedOutcome: string,
  interpreterParams: SingleAssetTwoPartyCoinTransferInterpreterParams,
  log?: ILoggerService,
): TokenIndexedCoinTransferMap {
  const { tokenAddress } = interpreterParams;

  // 0ms
  const [
    { to: to1, amount: amount1 },
    { to: to2, amount: amount2 },
  ] = decodeSingleAssetTwoPartyCoinTransfer(encodedOutcome);

  return {
    [tokenAddress]: {
      [to1 as string]: amount1 as BigNumber,
      [to2 as string]: amount2 as BigNumber,
    },
  };
}

function decodeRefundAppState(encodedOutcome: string): [CoinTransfer] {
  const [[{ to, amount }]] = defaultAbiCoder.decode(
    ["tuple(address to, uint256 amount)[2]"],
    encodedOutcome,
  );

  return [{ to, amount }];
}

function decodeTwoPartyFixedOutcome(encodedOutcome: string): TwoPartyFixedOutcome {
  const [twoPartyFixedOutcome] = defaultAbiCoder.decode(["uint256"], encodedOutcome) as [BigNumber];

  return twoPartyFixedOutcome.toNumber();
}

function decodeSingleAssetTwoPartyCoinTransfer(
  encodedOutcome: string,
): [CoinTransfer, CoinTransfer] {
  const [[[to1, amount1], [to2, amount2]]] = defaultAbiCoder.decode(
    ["tuple(address to, uint256 amount)[2]"],
    encodedOutcome,
  );

  return [
    { to: to1, amount: amount1 },
    { to: to2, amount: amount2 },
  ];
}

function decodeMultiAssetMultiPartyCoinTransfer(encodedOutcome: string): CoinTransfer[][] {
  const [coinTransferListOfLists] = defaultAbiCoder.decode(
    [multiAssetMultiPartyCoinTransferEncoding],
    encodedOutcome,
  );

  return coinTransferListOfLists.map(coinTransferList =>
    coinTransferList.map(({ to, amount }) => ({ to, amount })),
  );
}
