import { stringify } from "@connext/types";
import { Zero } from "ethers/constants";
import { BigNumber, bigNumberify, getAddress } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS, HARD_CODED_ASSUMPTIONS } from "../constants";
import { AppInterface, OutcomeType } from "../types";
import { xkeyKthAddress, xkeysToSortedKthAddresses } from "../xkeys";

import { AppInstance } from "./app-instance";
import { merge } from "./utils";

export function getFreeBalanceAppInterface(addr: string): AppInterface {
  return {
    actionEncoding: undefined, // because no actions exist for FreeBalanceApp
    addr,
    stateEncoding: `tuple(address[] tokenAddresses, tuple(address to, uint256 amount)[][] balances, bytes32[] activeApps)`,
  };
}

/*
Keep in sync with the solidity struct LibOutcome::CoinTransfer
*/
export type CoinTransfer = {
  to: string;
  amount: BigNumber;
};

/*
Equivalent to the above type but with serialized BigNumbers
*/
type CoinTransferJSON = {
  to: string;
  amount: {
    _hex: string;
  };
};

type FreeBalanceState = {
  activeAppsMap: ActiveAppsMap;
  balancesIndexedByToken: { [tokenAddress: string]: CoinTransfer[] };
};

type FreeBalanceStateJSON = {
  tokenAddresses: string[];
  balances: CoinTransferJSON[][]; // why is this serialized?
  activeApps: string[];
};

/*
CoinTransferMap is isomorphic to the solidity type `CoinTransfer[]`, with the
restriction that values of the solidity type be arrays such that no two
elements are CoinTransfers with the same `to` field. We prefer CoinTransferMap
in client-side code for easier access, but we cannot use it in solidity due to
nonexistent support for non-storage mappings.
*/
export type CoinTransferMap = {
  [to: string]: BigNumber;
};

/*
A doubly-nested map of BigNumbers indexed first (outermost) by the tokenAddress
and secondly (innermost) by the beneficiary address
*/
export type TokenIndexedCoinTransferMap = {
  [tokenAddress: string]: CoinTransferMap;
};

// todo(xuanji): replace with Set
export type ActiveAppsMap = { [appInstanceIdentityHash: string]: true };

export class FreeBalanceClass {
  private constructor(
    private readonly activeAppsMap: ActiveAppsMap,
    private readonly balancesIndexedByToken: {
      // todo: change this type to TokenIndexedCoinTransferMap
      [tokenAddress: string]: CoinTransfer[];
    },
  ) {}

  public toFreeBalanceState(): FreeBalanceState {
    return {
      activeAppsMap: this.activeAppsMap,
      balancesIndexedByToken: this.balancesIndexedByToken,
    };
  }

  public toTokenIndexedCoinTransferMap() {
    const ret = {};
    for (const tokenAddress of Object.keys(this.balancesIndexedByToken)) {
      ret[tokenAddress] = convertCoinTransfersToCoinTransfersMap(
        this.balancesIndexedByToken[tokenAddress],
      );
    }
    return ret;
  }

  public toAppInstance(oldAppInstance: AppInstance) {
    return oldAppInstance.setState(serializeFreeBalanceState(this.toFreeBalanceState()));
  }

  public static createWithFundedTokenAmounts(
    addresses: string[],
    amount: BigNumber,
    tokenAddresses: string[],
  ): FreeBalanceClass {
    return new FreeBalanceClass(
      {},
      tokenAddresses.reduce(
        (balancesIndexedByToken, tokenAddress) => ({
          ...balancesIndexedByToken,
          [tokenAddress]: addresses.map(to => ({ to, amount })),
        }),
        {} as { [tokenAddress: string]: CoinTransfer[] },
      ),
    );
  }

  public static fromAppInstance(appInstance: AppInstance): FreeBalanceClass {
    const freeBalanceState = deserializeFreeBalanceState(appInstance.state as FreeBalanceStateJSON);
    return new FreeBalanceClass(
      freeBalanceState.activeAppsMap,
      freeBalanceState.balancesIndexedByToken,
    );
  }

  public getBalance(tokenAddress: string, beneficiary: string) {
    try {
      return convertCoinTransfersToCoinTransfersMap(this.balancesIndexedByToken[tokenAddress])[
        beneficiary
      ];
    } catch {
      return Zero;
    }
  }

  public withTokenAddress(tokenAddress: string): CoinTransferMap {
    let balances: CoinTransferMap = {};
    balances = convertCoinTransfersToCoinTransfersMap(this.balancesIndexedByToken[tokenAddress]);
    if (Object.keys(balances).length === 0) {
      const addresses = Object.keys(
        convertCoinTransfersToCoinTransfersMap(
          this.balancesIndexedByToken[CONVENTION_FOR_ETH_TOKEN_ADDRESS],
        ),
      );
      for (const address of addresses) {
        balances[address] = Zero;
      }
    }
    return balances;
  }

  public removeActiveApp(activeApp: string) {
    delete this.activeAppsMap[activeApp];
    return this;
  }

  public addActiveApp(activeApp: string) {
    this.activeAppsMap[activeApp] = true;
    return this;
  }

  public prettyPrint() {
    const balances = this.balancesIndexedByToken;
    const ret = {} as any;
    for (const tokenAddress of Object.keys(balances)) {
      const ret2 = {} as any;
      for (const coinTransfer of balances[tokenAddress]) {
        ret2[coinTransfer.to] = coinTransfer.amount;
      }
      ret[tokenAddress] = ret2;
    }
  }

  public increment(increments: TokenIndexedCoinTransferMap) {
    for (const tokenAddress of Object.keys(increments)) {
      const t1 = convertCoinTransfersToCoinTransfersMap(this.balancesIndexedByToken[tokenAddress]);
      const t2 = merge(t1, increments[tokenAddress]);

      for (const val of Object.values(t2)) {
        if (val.lt(Zero)) {
          throw new Error(
            `FreeBalanceClass::increment ended up with a negative balance when
            merging ${stringify(t1)} and ${stringify(increments[tokenAddress])}`,
          );
        }
      }

      this.balancesIndexedByToken[tokenAddress] = convertCoinTransfersMapToCoinTransfers(t2);
    }
    return this;
  }
}

/**
 * Note that the state of the Free Balance is held as plain types
 * and only converted to more complex types (i.e. BigNumber) upon usage.
 */
export function createFreeBalance(
  userNeuteredExtendedKeys: string[],
  coinBucketAddress: string,
  freeBalanceTimeout: number,
  multisigAddress: string,
) {
  const sortedTopLevelKeys = xkeysToSortedKthAddresses(
    userNeuteredExtendedKeys,
    0, // NOTE: We re-use 0 which is also used as the keys for `multisigOwners`
  );

  const initialState: FreeBalanceState = {
    activeAppsMap: {},
    balancesIndexedByToken: {
      // NOTE: Extremely important to understand that the default
      // addresses of the recipients are the "top level keys" as defined
      // as the 0th derived children of the xpubs.
      [CONVENTION_FOR_ETH_TOKEN_ADDRESS]: [
        { to: sortedTopLevelKeys[0], amount: Zero },
        { to: sortedTopLevelKeys[1], amount: Zero },
      ],
    },
  };

  return new AppInstance(
    /* participants */ sortedTopLevelKeys,
    /* defaultTimeout */ freeBalanceTimeout,
    /* appInterface */ getFreeBalanceAppInterface(coinBucketAddress),
    /* appSeqNo */ HARD_CODED_ASSUMPTIONS.appSequenceNumberForFreeBalance,
    /* latestState */ serializeFreeBalanceState(initialState),
    /* latestVersionNumber */ 0,
    /* latestTimeout */ HARD_CODED_ASSUMPTIONS.freeBalanceInitialStateTimeout,
    /* outcomeType */ OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER,
    /* multisigAddr */ multisigAddress,
  );
}

function deserializeFreeBalanceState(freeBalanceStateJSON: FreeBalanceStateJSON): FreeBalanceState {
  const { activeApps, tokenAddresses, balances } = freeBalanceStateJSON;
  return {
    balancesIndexedByToken: (tokenAddresses || []).reduce(
      (acc, tokenAddress, idx) => ({
        ...acc,
        [getAddress(tokenAddress)]: balances[idx].map(({ to, amount }) => ({
          to,
          amount: bigNumberify(amount._hex),
        })),
      }),
      {},
    ),
    activeAppsMap: (activeApps || []).reduce(
      (acc, identityHash) => ({ ...acc, [identityHash]: true }),
      {},
    ),
  };
}

function serializeFreeBalanceState(freeBalanceState: FreeBalanceState): FreeBalanceStateJSON {
  return {
    activeApps: Object.keys(freeBalanceState.activeAppsMap),
    tokenAddresses: Object.keys(freeBalanceState.balancesIndexedByToken),
    balances: Object.values(freeBalanceState.balancesIndexedByToken).map(balances =>
      balances.map(({ to, amount }) => ({
        to,
        amount: {
          _hex: amount.toHexString(),
        },
      })),
    ),
  };
}

// The following conversion functions are only relevant in the context
// of reading/writing to a channel's Free Balance
export function convertCoinTransfersToCoinTransfersMap(
  coinTransfers: CoinTransfer[],
): CoinTransferMap {
  return (coinTransfers || []).reduce((acc, { to, amount }) => ({ ...acc, [to]: amount }), {});
}

function convertCoinTransfersMapToCoinTransfers(coinTransfersMap: CoinTransferMap): CoinTransfer[] {
  return Object.entries(coinTransfersMap).map(([to, amount]) => ({
    to,
    amount,
  }));
}

/**
 * Address used for a Node's free balance
 */
export function getFreeBalanceAddress(publicIdentifier: string) {
  return xkeyKthAddress(publicIdentifier, 0);
}
