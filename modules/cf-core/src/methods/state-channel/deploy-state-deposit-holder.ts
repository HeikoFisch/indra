import { delay, MethodNames, MethodParams, MethodResults, stringify } from "@connext/types";
import { ILoggerService } from "@connext/types";
import { Contract, Signer } from "ethers";
import { HashZero } from "ethers/constants";
import { JsonRpcProvider, TransactionResponse } from "ethers/providers";
import { Interface } from "ethers/utils";
import { jsonRpcMethod } from "rpc-server";

import {
  CHANNEL_CREATION_FAILED,
  NO_TRANSACTION_HASH_FOR_MULTISIG_DEPLOYMENT,
  INCORRECT_MULTISIG_ADDRESS,
  INVALID_FACTORY_ADDRESS,
  INVALID_MASTERCOPY_ADDRESS,
} from "../../errors";
import { MinimumViableMultisig, ProxyFactory } from "../../contracts";
import { StateChannel } from "../../models";
import { RequestHandler } from "../../request-handler";
import { NetworkContext } from "../../types";
import { getCreate2MultisigAddress } from "../../utils";
import { sortAddresses, xkeysToSortedKthAddresses } from "../../xkeys";

import { NodeController } from "../controller";

// Estimate based on rinkeby transaction:
// 0xaac429aac389b6fccc7702c8ad5415248a5add8e8e01a09a42c4ed9733086bec
const CREATE_PROXY_AND_SETUP_GAS = 500_000;

export class DeployStateDepositController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_deployStateDepositHolder)
  public executeMethod = super.executeMethod;

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: MethodParams.DeployStateDepositHolder,
  ): Promise<void> {
    const { store, provider } = requestHandler;
    const { multisigAddress } = params;

    const channel = await store.getStateChannel(multisigAddress);

    if (!channel.addresses.proxyFactory) {
      throw new Error(INVALID_FACTORY_ADDRESS(channel.addresses.proxyFactory));
    }

    if (!channel.addresses.multisigMastercopy) {
      throw new Error(INVALID_MASTERCOPY_ADDRESS(channel.addresses.multisigMastercopy));
    }

    const expectedMultisigAddress = await getCreate2MultisigAddress(
      channel.userNeuteredExtendedKeys,
      channel.addresses,
      provider,
    );

    if (expectedMultisigAddress !== channel.multisigAddress) {
      throw new Error(INCORRECT_MULTISIG_ADDRESS);
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.DeployStateDepositHolder,
  ): Promise<MethodResults.DeployStateDepositHolder> {
    const { multisigAddress, retryCount } = params;
    const { log, networkContext, store, provider, wallet } = requestHandler;

    // By default, if the contract has been deployed and
    // DB has records of it, controller will return HashZero
    let tx = { hash: HashZero } as TransactionResponse;

    const channel = await store.getStateChannel(multisigAddress);

    // make sure it is deployed to the right address
    const expectedMultisigAddress = await getCreate2MultisigAddress(
      channel.userNeuteredExtendedKeys,
      channel.addresses,
      provider,
    );

    if (expectedMultisigAddress !== channel.multisigAddress) {
      throw new Error(INCORRECT_MULTISIG_ADDRESS);
    }

    // Check if the contract has already been deployed on-chain
    if ((await provider.getCode(multisigAddress)) === `0x`) {
      tx = await sendMultisigDeployTx(wallet, channel, networkContext, retryCount, log);
    }

    return { transactionHash: tx.hash! };
  }
}

async function sendMultisigDeployTx(
  signer: Signer,
  stateChannel: StateChannel,
  networkContext: NetworkContext,
  retryCount: number = 1,
  log: ILoggerService,
): Promise<TransactionResponse> {
  // make sure that the proxy factory used to deploy is the same as the one
  // used when the channel was created
  const proxyFactory = new Contract(stateChannel.addresses.proxyFactory, ProxyFactory.abi, signer);

  const owners = stateChannel.userNeuteredExtendedKeys;

  const provider = signer.provider as JsonRpcProvider;

  if (!provider) {
    throw new Error(`wallet must have a provider`);
  }

  const signerAddress = await signer.getAddress();
  const nonce = await provider.getTransactionCount(signerAddress);

  let error;
  for (let tryCount = 1; tryCount < retryCount + 1; tryCount += 1) {
    try {
      const tx: TransactionResponse = await proxyFactory.functions.createProxyWithNonce(
        networkContext.MinimumViableMultisig,
        new Interface(MinimumViableMultisig.abi).functions.setup.encode([
          xkeysToSortedKthAddresses(owners, 0),
        ]),
        0, // TODO: Increment nonce as needed
        {
          gasLimit: CREATE_PROXY_AND_SETUP_GAS,
          gasPrice: provider.getGasPrice(),
          nonce,
        },
      );

      if (!tx.hash) {
        throw new Error(`${NO_TRANSACTION_HASH_FOR_MULTISIG_DEPLOYMENT}: ${stringify(tx)}`);
      }

      const ownersAreCorrectlySet = await checkForCorrectOwners(
        tx!,
        provider,
        owners,
        stateChannel.multisigAddress,
      );

      if (!ownersAreCorrectlySet) {
        log.error(
          `${CHANNEL_CREATION_FAILED}: Could not confirm, on the ${tryCount} try, that the deployed multisig contract has the expected owners`,
        );
        // wait on a linear backoff interval before retrying
        await delay(1000 * tryCount);
        continue;
      }

      if (tryCount > 0) {
        log.debug(`Deploying multisig failed on first try, but succeeded on try #${tryCount}`);
      }
      return tx;
    } catch (e) {
      error = e;
      log.error(`Channel creation attempt ${tryCount} failed: ${e}.\n
                    Retrying ${retryCount - tryCount} more times`);
    }
  }

  throw new Error(`${CHANNEL_CREATION_FAILED}: ${stringify(error)}`);
}

async function checkForCorrectOwners(
  tx: TransactionResponse,
  provider: JsonRpcProvider,
  xpubs: string[],
  multisigAddress: string,
): Promise<boolean> {
  await tx.wait();

  const contract = new Contract(multisigAddress, MinimumViableMultisig.abi, provider);

  const expectedOwners = xkeysToSortedKthAddresses(xpubs, 0);

  const actualOwners = sortAddresses(await contract.functions.getOwners());

  return expectedOwners[0] === actualOwners[0] && expectedOwners[1] === actualOwners[1];
}
