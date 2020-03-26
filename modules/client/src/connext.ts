import { SupportedApplication, AppActionBigNumber, AppStateBigNumber } from "@connext/apps";
import { MessagingService } from "@connext/messaging";
import {
  AppInstanceProposal,
  chan_getUserWithdrawal,
  chan_restoreState,
  chan_setStateChannel,
  chan_setUserWithdrawal,
  ConditionalTransferParameters,
  ConditionalTransferResponse,
  FAST_SIGNED_TRANSFER,
  HASHLOCK_TRANSFER,
  IChannelProvider,
  IClientStore,
  ILoggerService,
  LINKED_TRANSFER,
  TransactionResponse,
  WithdrawParameters,
  WithdrawResponse,
  GetHashLockTransferResponse,
  LinkedTransferResponse,
  GetLinkedTransferResponse,
  SIGNED_TRANSFER,
  GetSignedTransferResponse,
  createRandom32ByteHexString,
} from "@connext/types";
import { decryptWithPrivateKey } from "@connext/crypto";
import "core-js/stable";
import { Contract, providers } from "ethers";
import { AddressZero } from "ethers/constants";
import { BigNumber, bigNumberify, Network, Transaction } from "ethers/utils";
import tokenAbi from "human-standard-token-abi";
import "regenerator-runtime/runtime";

import { createCFChannelProvider } from "./channelProvider";
import { LinkedTransferController } from "./controllers/LinkedTransferController";
import { DepositController } from "./controllers/DepositController";
import { RequestDepositRightsController } from "./controllers/RequestDepositRightsController";
import { SwapController } from "./controllers/SwapController";
import { WithdrawalController } from "./controllers/WithdrawalController";
import { stringify, withdrawalKey, xpubToAddress } from "./lib";
import { ConnextListener } from "./listener";
import {
  Address,
  AppInstanceJson,
  AppRegistry,
  CFCoreChannel,
  CFCoreTypes,
  ChannelProviderConfig,
  ChannelState,
  CheckDepositRightsParameters,
  CheckDepositRightsResponse,
  ConnextClientStorePrefix,
  ConnextEvent,
  CreateChannelResponse,
  DefaultApp,
  DepositParameters,
  GetChannelResponse,
  GetConfigResponse,
  IConnextClient,
  INodeApiClient,
  InternalClientOptions,
  KeyGen,
  makeChecksum,
  RebalanceProfile,
  ProtocolTypes,
  RequestCollateralResponse,
  RequestDepositRightsParameters,
  RescindDepositRightsParameters,
  ResolveConditionParameters,
  ResolveConditionResponse,
  ResolveLinkedTransferResponse,
  SwapParameters,
  Transfer,
  TransferParameters,
} from "./types";
import { invalidAddress } from "./validation/addresses";
import { falsy, notLessThanOrEqualTo, notPositive } from "./validation/bn";
import { ResolveLinkedTransferController } from "./controllers/ResolveLinkedTransferController";
import { FastSignedTransferController } from "./controllers/FastSignedTransferController";
import { ResolveFastSignedTransferController } from "./controllers/ResolveFastSignedTransferController";
import { HashLockTransferController } from "./controllers/HashLockTransferController";
import { ResolveHashLockTransferController } from "./controllers/ResolveHashLockTransferController";
import { SignedTransferController } from "./controllers/SignedTransferController";
import { ResolveSignedTransferController } from "./controllers/ResolveSignedTransferController";

export class ConnextClient implements IConnextClient {
  public appRegistry: AppRegistry;
  public channelProvider: IChannelProvider;
  public config: GetConfigResponse;
  public ethProvider: providers.JsonRpcProvider;
  public freeBalanceAddress: string;
  public listener: ConnextListener;
  public log: ILoggerService;
  public messaging: MessagingService;
  public multisigAddress: Address;
  public network: Network;
  public node: INodeApiClient;
  public nodePublicIdentifier: string;
  public publicIdentifier: string;
  public signerAddress: Address;
  public store: IClientStore;
  public token: Contract;

  private opts: InternalClientOptions;
  private keyGen: KeyGen;

  private depositController: DepositController;
  private swapController: SwapController;
  private withdrawalController: WithdrawalController;
  private linkedTransferController: LinkedTransferController;
  private resolveLinkedTransferController: ResolveLinkedTransferController;
  private requestDepositRightsController: RequestDepositRightsController;
  private fastSignedTransferController: FastSignedTransferController;
  private resolveFastSignedTransferController: ResolveFastSignedTransferController;
  private hashlockTransferController: HashLockTransferController;
  private resolveHashLockTransferController: ResolveHashLockTransferController;
  private signedTransferController: SignedTransferController;
  private resolveSignedTransferController: ResolveSignedTransferController;

  constructor(opts: InternalClientOptions) {
    this.opts = opts;
    this.appRegistry = opts.appRegistry;
    this.channelProvider = opts.channelProvider;
    this.config = opts.config;
    this.ethProvider = opts.ethProvider;
    this.keyGen = opts.keyGen;
    this.log = opts.logger.newContext("ConnextClient");
    this.messaging = opts.messaging;
    this.network = opts.network;
    this.node = opts.node;
    this.store = opts.store;
    this.token = opts.token;

    this.freeBalanceAddress = this.channelProvider.config.freeBalanceAddress;
    this.signerAddress = this.channelProvider.config.signerAddress;
    this.publicIdentifier = this.channelProvider.config.userPublicIdentifier;
    this.multisigAddress = this.channelProvider.config.multisigAddress;
    this.nodePublicIdentifier = this.opts.config.nodePublicIdentifier;

    // establish listeners
    this.listener = new ConnextListener(opts.channelProvider, this);

    // instantiate controllers with log and cf
    this.depositController = new DepositController("DepositController", this);
    this.swapController = new SwapController("SwapController", this);
    this.withdrawalController = new WithdrawalController("WithdrawalController", this);
    this.linkedTransferController = new LinkedTransferController("LinkedTransferController", this);
    this.resolveLinkedTransferController = new ResolveLinkedTransferController(
      "ResolveLinkedTransferController",
      this,
    );
    this.requestDepositRightsController = new RequestDepositRightsController(
      "RequestDepositRightsController",
      this,
    );
    this.fastSignedTransferController = new FastSignedTransferController(
      "FastSignedTransferController",
      this,
    );
    this.resolveFastSignedTransferController = new ResolveFastSignedTransferController(
      "ResolveFastSignedTransferController",
      this,
    );
    this.hashlockTransferController = new HashLockTransferController(
      "HashLockTransferController",
      this,
    );
    this.resolveHashLockTransferController = new ResolveHashLockTransferController(
      "ResolveHashLockTransferController",
      this,
    );
    this.signedTransferController = new SignedTransferController("SignedTransferController", this);
    this.resolveSignedTransferController = new ResolveSignedTransferController(
      "ResolveSignedTransferController",
      this,
    );
  }

  /**
   * Creates a promise that returns when the channel is available,
   * ie. when the setup protocol or create channel call is completed
   */
  public isAvailable = async (): Promise<void> => {
    return new Promise(
      async (resolve: any, reject: any): Promise<any> => {
        // Wait for channel to be available
        const channelIsAvailable = async (): Promise<boolean> => {
          const chan = await this.node.getChannel();
          return chan && chan.available;
        };
        while (!(await channelIsAvailable())) {
          await new Promise((res: any): any => setTimeout((): void => res(), 100));
        }
        resolve();
      },
    );
  };

  /**
   * Checks if the coin balance refund app is installed.
   */
  public getBalanceRefundApp = async (
    assetId: string = AddressZero,
  ): Promise<AppInstanceJson | undefined> => {
    const apps = await this.getAppInstances();
    const filtered = apps.filter(
      (app: AppInstanceJson) =>
        app.appInterface.addr === this.config.contractAddresses.CoinBalanceRefundApp &&
        app.latestState["tokenAddress"] === assetId,
    );
    return filtered.length === 0 ? undefined : filtered[0];
  };

  // register subscriptions
  public registerSubscriptions = async (): Promise<void> => {
    await this.listener.register();
  };

  ///////////////////////////////////
  // Unsorted methods pulled from the old abstract wrapper class

  public restart = async (): Promise<void> => {
    if (!this.channelProvider.isSigner) {
      this.log.warn("Cannot restart with an injected provider.");
      return;
    }

    // ensure that node and user xpub are different
    if (this.nodePublicIdentifier === this.publicIdentifier) {
      throw new Error(
        "Client must be instantiated with a secret that is different from the node's secret",
      );
    }

    // Create a fresh channelProvider & start using that.
    // End goal is to use this to restart the cfNode after restoring state
    const channelProvider = await createCFChannelProvider({
      ethProvider: this.ethProvider,
      keyGen: this.keyGen,
      lockService: { 
        acquireLock: this.node.acquireLock.bind(this.node),
        releaseLock: this.node.releaseLock.bind(this.node),
      },
      messaging: this.messaging as any,
      networkContext: this.config.contractAddresses,
      nodeConfig: { STORE_KEY_PREFIX: ConnextClientStorePrefix },
      nodeUrl: this.channelProvider.config.nodeUrl,
      store: this.store,
      xpub: this.publicIdentifier,
      logger: this.log.newContext("CFChannelProvider"),
    });
    // TODO: this is very confusing to have to do, lets try to figure out a better way
    channelProvider.multisigAddress = this.multisigAddress;
    this.node.channelProvider = channelProvider;
    this.channelProvider = channelProvider;
    this.listener = new ConnextListener(channelProvider, this);
    await this.isAvailable();
  };

  public getChannel = async (): Promise<GetChannelResponse> => {
    return await this.node.getChannel();
  };

  public requestCollateral = async (
    tokenAddress: string,
  ): Promise<RequestCollateralResponse | void> => {
    const res = await this.node.requestCollateral(tokenAddress);
    return res;
  };

  public channelProviderConfig = async (): Promise<ChannelProviderConfig> => {
    return this.channelProvider.config;
  };

  public getLinkedTransfer = async (paymentId: string): Promise<GetLinkedTransferResponse> => {
    return await this.node.fetchLinkedTransfer(paymentId);
  };

  public getSignedTransfer = async (paymentId: string): Promise<GetSignedTransferResponse> => {
    return await this.node.fetchSignedTransfer(paymentId);
  };

  public getAppRegistry = async (
    appDetails?:
      | {
          name: SupportedApplication;
          chainId: number;
        }
      | { appDefinitionAddress: string },
  ): Promise<AppRegistry> => {
    return await this.node.appRegistry(appDetails);
  };

  public createChannel = async (): Promise<CreateChannelResponse> => {
    return this.node.createChannel();
  };

  public subscribeToSwapRates = async (from: string, to: string, callback: any): Promise<any> => {
    return await this.node.subscribeToSwapRates(from, to, callback);
  };

  public getLatestSwapRate = async (from: string, to: string): Promise<string> => {
    return await this.node.getLatestSwapRate(from, to);
  };

  public unsubscribeToSwapRates = async (from: string, to: string): Promise<void> => {
    return this.node.unsubscribeFromSwapRates(from, to);
  };

  public getRebalanceProfile = async (assetId?: string): Promise<RebalanceProfile | undefined> => {
    return await this.node.getRebalanceProfile(assetId);
  };

  public getTransferHistory = async (): Promise<Transfer[]> => {
    return await this.node.getTransferHistory();
  };

  ///////////////////////////////////
  // CORE CHANNEL METHODS

  public deposit = async (params: DepositParameters): Promise<ChannelState> => {
    return this.depositController.deposit(params);
  };

  public requestDepositRights = async (
    params: RequestDepositRightsParameters,
  ): Promise<CFCoreTypes.RequestDepositRightsResult> => {
    return await this.requestDepositRightsController.requestDepositRights(params);
  };

  public rescindDepositRights = async (
    params: RescindDepositRightsParameters,
  ): Promise<CFCoreTypes.DepositResult> => {
    return this.channelProvider.send(ProtocolTypes.chan_rescindDepositRights, {
      multisigAddress: this.multisigAddress,
      tokenAddress: params.assetId,
    } as CFCoreTypes.RescindDepositRightsParams);
  };

  public checkDepositRights = async (
    params: CheckDepositRightsParameters,
  ): Promise<CheckDepositRightsResponse> => {
    const refundApp = await this.getBalanceRefundApp(params.assetId);
    if (!refundApp) {
      throw new Error(`No balance refund app installed for ${params.assetId}`);
    }
    const multisigBalance =
      !refundApp.latestState["tokenAddress"] &&
      refundApp.latestState["tokenAddress"] !== AddressZero
        ? await this.ethProvider.getBalance(this.multisigAddress)
        : await new Contract(
            refundApp.latestState["tokenAddress"],
            tokenAbi,
            this.ethProvider,
          ).functions.balanceOf(this.multisigAddress);
    return refundApp
      ? {
          assetId: refundApp.latestState["tokenAddress"],
          multisigBalance: multisigBalance.toString(),
          recipient: refundApp.latestState["recipient"],
          threshold: refundApp.latestState["threshold"],
        }
      : undefined;
  };

  public swap = async (params: SwapParameters): Promise<CFCoreChannel> => {
    const res = await this.swapController.swap(params);
    return res;
  };

  /**
   * Transfer currently uses the conditionalTransfer LINKED_TRANSFER_TO_RECIPIENT so that
   * async payments are the default transfer.
   */
  public transfer = async (params: TransferParameters): Promise<LinkedTransferResponse> => {
    if (!params.paymentId) {
      params.paymentId = createRandom32ByteHexString();
    }
    return this.linkedTransferController.linkedTransfer({
      amount: params.amount,
      assetId: params.assetId,
      conditionType: LINKED_TRANSFER,
      meta: params.meta,
      paymentId: params.paymentId,
      preImage: createRandom32ByteHexString(),
      recipient: params.recipient,
    }) as Promise<LinkedTransferResponse>;
  };

  public withdraw = async (params: WithdrawParameters): Promise<WithdrawResponse> => {
    return await this.withdrawalController.withdraw(params);
  };

  public respondToNodeWithdraw = async (appInstance: AppInstanceJson): Promise<void> => {
    return await this.withdrawalController.respondToNodeWithdraw(appInstance);
  };

  public saveWithdrawCommitmentToStore = async (
    params: WithdrawParameters<BigNumber>,
    signatures: string[],
  ): Promise<void> => {
    return await this.withdrawalController.saveWithdrawCommitmentToStore(params, signatures);
  };

  public resolveCondition = async (
    params: ResolveConditionParameters,
  ): Promise<ResolveConditionResponse> => {
    switch (params.conditionType) {
      case LINKED_TRANSFER: {
        return this.resolveLinkedTransferController.resolveLinkedTransfer(params);
      }
      case FAST_SIGNED_TRANSFER: {
        return this.resolveFastSignedTransferController.resolveFastSignedTransfer(params);
      }
      case HASHLOCK_TRANSFER: {
        return this.resolveHashLockTransferController.resolveHashLockTransfer(params);
      }
      case SIGNED_TRANSFER: {
        return this.resolveSignedTransferController.resolveSignedTransfer(params);
      }
      default:
        throw new Error(`Condition type ${(params as any).conditionType} invalid`);
    }
  };

  public conditionalTransfer = async (
    params: ConditionalTransferParameters,
  ): Promise<ConditionalTransferResponse> => {
    switch (params.conditionType) {
      case LINKED_TRANSFER: {
        return this.linkedTransferController.linkedTransfer(params);
      }
      case FAST_SIGNED_TRANSFER: {
        return this.fastSignedTransferController.fastSignedTransfer(params);
      }
      case HASHLOCK_TRANSFER: {
        return this.hashlockTransferController.hashLockTransfer(params);
      }
      case SIGNED_TRANSFER: {
        return this.signedTransferController.signedTransfer(params);
      }
      default:
        throw new Error(`Condition type ${(params as any).conditionType} invalid`);
    }
  };

  public getHashLockTransfer = async (lockHash: string): Promise<GetHashLockTransferResponse> => {
    return await this.node.getHashLockTransfer(lockHash);
  };

  public getLatestWithdrawal = async (): Promise<
    { retry: number; tx: CFCoreTypes.MinimalTransaction } | undefined
  > => {
    const value = await this.channelProvider.send(chan_getUserWithdrawal, {});

    if (!value || typeof value === "undefined") {
      return undefined;
    }

    const noRetry = typeof value.retry === "undefined" || value.retry === null;
    if (!value.tx || noRetry) {
      const msg = `Can not find tx or retry in store under key ${withdrawalKey(
        this.publicIdentifier,
      )}`;
      this.log.error(msg);
      throw new Error(msg);
    }
    return value;
  };

  public watchForUserWithdrawal = async (): Promise<TransactionResponse | undefined> => {
    // poll for withdrawal tx submitted to multisig matching tx data
    const maxBlocks = 15;
    const startingBlock = await this.ethProvider.getBlockNumber();
    let transaction: TransactionResponse;

    // TODO: poller should not be completely blocking, but safe to leave for now
    // because the channel should be blocked
    try {
      transaction = await new Promise((resolve: any, reject: any): any => {
        this.ethProvider.on(
          "block",
          async (blockNumber: number): Promise<void> => {
            const transaction = await this.checkForUserWithdrawal(blockNumber);
            if (transaction) {
              await this.channelProvider.send(chan_setUserWithdrawal, {
                withdrawalObject: undefined,
              });
              this.ethProvider.removeAllListeners("block");
              resolve(transaction);
            }
            if (blockNumber - startingBlock >= maxBlocks) {
              this.ethProvider.removeAllListeners("block");
              reject(`More than ${maxBlocks} have passed: ${blockNumber - startingBlock}`);
            }
          },
        );
      });
    } catch (e) {
      // if (e.includes(`More than ${maxBlocks} have passed`)) {
      //   this.log.debug("Retrying node submission");
      //   await this.retryNodeSubmittedWithdrawal();
      // }
      throw new Error(`Error watching for user withdrawal: ${e}`);
    }
    return transaction;
  };

  ////////////////////////////////////////
  // Restore State

  public restoreState = async (): Promise<void> => {
    try {
      await this.channelProvider.send(chan_restoreState, {});
      this.log.info(`Found state to restore from store's backup`);
    } catch (e) {
      const state = await this.node.restoreState(this.publicIdentifier);
      if (!state) {
        throw new Error(`No matching states found by node for ${this.publicIdentifier}`);
      }
      this.log.debug(`Found state to restore from node`);
      this.log.debug(`Restored state: ${stringify(state)}`);
      await this.channelProvider.send(chan_setStateChannel, {
        state,
      });
    }
    await this.restart();
  };

  ///////////////////////////////////
  // EVENT METHODS

  public on = (event: ConnextEvent, callback: (...args: any[]) => void): ConnextListener => {
    return this.listener.on(event, callback);
  };

  public once = (event: ConnextEvent, callback: (...args: any[]) => void): ConnextListener => {
    return this.listener.once(event, callback);
  };

  public emit = (event: ConnextEvent, data: any): boolean => {
    return this.listener.emit(event, data);
  };

  public removeListener = (
    event: ConnextEvent,
    callback: (...args: any[]) => void,
  ): ConnextListener => {
    return this.listener.removeListener(event, callback);
  };

  ///////////////////////////////////
  // PROVIDER/ROUTER METHODS

  public deployMultisig = async (): Promise<CFCoreTypes.DeployStateDepositHolderResult> => {
    return await this.channelProvider.send(ProtocolTypes.chan_deployStateDepositHolder, {
      multisigAddress: this.multisigAddress,
    });
  };

  public getStateChannel = async (): Promise<CFCoreTypes.GetStateChannelResult> => {
    return await this.channelProvider.send(ProtocolTypes.chan_getStateChannel, {
      multisigAddress: this.multisigAddress,
    });
  };

  public providerDeposit = async (
    amount: BigNumber,
    assetId: string,
    notifyCounterparty: boolean = false,
  ): Promise<CFCoreTypes.DepositResult> => {
    const depositAddr = xpubToAddress(this.publicIdentifier);
    let bal: BigNumber;

    if (assetId === AddressZero) {
      bal = await this.ethProvider.getBalance(depositAddr);
    } else {
      // get token balance
      const token = new Contract(assetId, tokenAbi, this.ethProvider);
      // TODO: correct? how can i use allowance?
      bal = await token.balanceOf(depositAddr);
    }

    const err = [
      notPositive(amount),
      invalidAddress(assetId),
      notLessThanOrEqualTo(amount, bal), // cant deposit more than default addr owns
    ].filter(falsy)[0];
    if (err) {
      this.log.error(err);
      throw new Error(err);
    }
    return await this.channelProvider.send(ProtocolTypes.chan_deposit, {
      amount,
      multisigAddress: this.multisigAddress,
      notifyCounterparty,
      tokenAddress: makeChecksum(assetId),
    } as CFCoreTypes.DepositParams);
  };

  public getAppInstances = async (): Promise<AppInstanceJson[]> => {
    const { appInstances } = await this.channelProvider.send(ProtocolTypes.chan_getAppInstances, {
      multisigAddress: this.multisigAddress,
    } as CFCoreTypes.GetAppInstancesParams);
    return appInstances;
  };

  public getFreeBalance = async (
    assetId: string = AddressZero,
  ): Promise<CFCoreTypes.GetFreeBalanceStateResult> => {
    if (typeof assetId !== "string") {
      throw new Error(`Asset id must be a string: ${stringify(assetId)}`);
    }
    const normalizedAssetId = makeChecksum(assetId);
    try {
      return await this.channelProvider.send(ProtocolTypes.chan_getFreeBalanceState, {
        multisigAddress: this.multisigAddress,
        tokenAddress: makeChecksum(assetId),
      } as CFCoreTypes.GetFreeBalanceStateParams);
    } catch (e) {
      const error = `No free balance exists for the specified token: ${normalizedAssetId}`;
      if (e.message.includes(error)) {
        // if there is no balance, return undefined
        // NOTE: can return free balance obj with 0s,
        // but need the nodes free balance
        // address in the multisig
        const obj = {};
        obj[xpubToAddress(this.nodePublicIdentifier)] = new BigNumber(0);
        obj[this.freeBalanceAddress] = new BigNumber(0);
        return obj;
      }
      throw e;
    }
  };

  public getProposedAppInstances = async (
    multisigAddress?: string,
  ): Promise<CFCoreTypes.GetProposedAppInstancesResult | undefined> => {
    return await this.channelProvider.send(ProtocolTypes.chan_getProposedAppInstances, {
      multisigAddress: multisigAddress || this.multisigAddress,
    } as CFCoreTypes.GetProposedAppInstancesParams);
  };

  public getProposedAppInstance = async (
    appInstanceId: string,
  ): Promise<CFCoreTypes.GetProposedAppInstanceResult | undefined> => {
    return await this.channelProvider.send(ProtocolTypes.chan_getProposedAppInstance, {
      appInstanceId,
    } as CFCoreTypes.GetProposedAppInstanceParams);
  };

  public getAppInstanceDetails = async (
    appInstanceId: string,
  ): Promise<CFCoreTypes.GetAppInstanceDetailsResult | undefined> => {
    const err = await this.appNotInstalled(appInstanceId);
    if (err) {
      this.log.warn(err);
      return undefined;
    }
    return await this.channelProvider.send(ProtocolTypes.chan_getAppInstance, {
      appInstanceId,
    } as CFCoreTypes.GetAppInstanceDetailsParams);
  };

  public getAppState = async (
    appInstanceId: string,
  ): Promise<CFCoreTypes.GetStateResult | undefined> => {
    // check the app is actually installed, or returned undefined
    const err = await this.appNotInstalled(appInstanceId);
    if (err) {
      this.log.warn(err);
      return undefined;
    }
    return await this.channelProvider.send(ProtocolTypes.chan_getState, {
      appInstanceId,
    } as CFCoreTypes.GetStateParams);
  };

  public takeAction = async (
    appInstanceId: string,
    action: AppActionBigNumber,
  ): Promise<CFCoreTypes.TakeActionResult> => {
    // check the app is actually installed
    const err = await this.appNotInstalled(appInstanceId);
    if (err) {
      this.log.error(err);
      throw new Error(err);
    }
    // check state is not finalized
    const state: CFCoreTypes.GetStateResult = await this.getAppState(appInstanceId);
    // FIXME: casting?
    if ((state.state as any).finalized) {
      throw new Error("Cannot take action on an app with a finalized state.");
    }
    return await this.channelProvider.send(ProtocolTypes.chan_takeAction, {
      action,
      appInstanceId,
    } as CFCoreTypes.TakeActionParams);
  };

  public updateState = async (
    appInstanceId: string,
    newState: AppStateBigNumber | any, // cast to any bc no supported apps use
    // the update state method
  ): Promise<CFCoreTypes.UpdateStateResult> => {
    // check the app is actually installed
    const err = await this.appNotInstalled(appInstanceId);
    if (err) {
      this.log.error(err);
      throw new Error(err);
    }
    // check state is not finalized
    const state: CFCoreTypes.GetStateResult = await this.getAppState(appInstanceId);
    // FIXME: casting?
    if ((state.state as any).finalized) {
      throw new Error("Cannot take action on an app with a finalized state.");
    }
    return await this.channelProvider.send(ProtocolTypes.chan_updateState, {
      appInstanceId,
      newState,
    } as CFCoreTypes.UpdateStateParams);
  };

  public proposeInstallApp = async (
    params: CFCoreTypes.ProposeInstallParams,
  ): Promise<CFCoreTypes.ProposeInstallResult> => {
    return await this.channelProvider.send(
      ProtocolTypes.chan_proposeInstall,
      params as CFCoreTypes.ProposeInstallParams,
    );
  };

  public installApp = async (appInstanceId: string): Promise<CFCoreTypes.InstallResult> => {
    // check the app isnt actually installed
    const alreadyInstalled = await this.appInstalled(appInstanceId);
    if (alreadyInstalled) {
      throw new Error(alreadyInstalled);
    }
    return await this.channelProvider.send(ProtocolTypes.chan_install, {
      appInstanceId,
    } as CFCoreTypes.InstallParams);
  };

  public uninstallApp = async (appInstanceId: string): Promise<CFCoreTypes.UninstallResult> => {
    // check the app is actually installed
    const err = await this.appNotInstalled(appInstanceId);
    if (err) {
      this.log.error(err);
      throw new Error(err);
    }
    return await this.channelProvider.send(ProtocolTypes.chan_uninstall, {
      appInstanceId,
    } as CFCoreTypes.UninstallParams);
  };

  public rejectInstallApp = async (appInstanceId: string): Promise<CFCoreTypes.UninstallResult> => {
    return await this.channelProvider.send(ProtocolTypes.chan_rejectInstall, {
      appInstanceId,
    });
  };

  ///////////////////////////////////
  // NODE METHODS

  public clientCheckIn = async (): Promise<void> => {
    return await this.node.clientCheckIn();
  };

  public verifyAppSequenceNumber = async (): Promise<any> => {
    const { data: sc } = await this.channelProvider.send(
      ProtocolTypes.chan_getStateChannel as any,
      {
        multisigAddress: this.multisigAddress,
      },
    );
    let appSequenceNumber: number;
    try {
      appSequenceNumber = (await sc.mostRecentlyInstalledAppInstance()).appSeqNo;
    } catch (e) {
      if (e.message.includes("There are no installed AppInstances in this StateChannel")) {
        appSequenceNumber = 0;
      } else {
        throw e;
      }
    }
    return await this.node.verifyAppSequenceNumber(appSequenceNumber);
  };

  public reclaimPendingAsyncTransfers = async (): Promise<void> => {
    const pendingTransfers = await this.node.getPendingAsyncTransfers();
    for (const transfer of pendingTransfers) {
      const { encryptedPreImage, paymentId } = transfer;
      await this.reclaimPendingAsyncTransfer(paymentId, encryptedPreImage);
    }
  };

  public reclaimPendingAsyncTransfer = async (
    paymentId: string,
    encryptedPreImage: string,
  ): Promise<ResolveLinkedTransferResponse> => {
    this.log.info(`Reclaiming transfer ${paymentId}`);
    // decrypt secret and resolve
    let privateKey = await this.keyGen("0");
    const preImage = await decryptWithPrivateKey(privateKey, encryptedPreImage);
    this.log.debug(`Decrypted message and recovered preImage: ${preImage}`);
    const response = await this.resolveLinkedTransferController.resolveLinkedTransfer({
      conditionType: LINKED_TRANSFER,
      paymentId,
      preImage,
    });
    this.log.info(`Reclaimed transfer ${paymentId}`);
    return response;
  };

  ///////////////////////////////////
  // LOW LEVEL METHODS

  public getRegisteredAppDetails = (appName: SupportedApplication): DefaultApp => {
    const appInfo = this.appRegistry.filter((app: DefaultApp): boolean => {
      return app.name === appName && app.chainId === this.network.chainId;
    });

    if (!appInfo || appInfo.length === 0) {
      throw new Error(`Could not find ${appName} app details on chain ${this.network.chainId}`);
    }

    if (appInfo.length > 1) {
      throw new Error(`Found multiple ${appName} app details on chain ${this.network.chainId}`);
    }
    return appInfo[0];
  };

  public matchTx = (
    givenTransaction: Transaction | undefined,
    expected: CFCoreTypes.MinimalTransaction,
  ): boolean => {
    return (
      givenTransaction &&
      givenTransaction.to === expected.to &&
      bigNumberify(givenTransaction.value).eq(expected.value) &&
      givenTransaction.data === expected.data
    );
  };

  /**
   * NOTE: this function should *only* be called on `connect()`, and is
   * designed to cleanup channel state in the event of the client going
   * offline and not completing protocols.
   *
   * This function will *only* handle registered applications, or applications
   * who's desired functionality is well understood. The apps will be handled
   * as follows:
   * - proposed swaps: install will be rejected, removing them from the proposed
   *   app instances and preventing stale swaps from being installed.
   * - installed swaps: will be automatically uninstalled, thereby executing the
   *   swap as soon as the client is able.
   * - proposed linked transfer apps: reject install
   * - installed linked transfer: leave installed for the hub to uninstall
   */
  public cleanupRegistryApps = async (): Promise<void> => {
    const swapAppRegistryInfo = this.appRegistry.filter(
      (app: DefaultApp) => app.name === "SimpleTwoPartySwapApp",
    )[0];
    const linkedRegistryInfo = this.appRegistry.filter(
      (app: DefaultApp) => app.name === "SimpleLinkedTransferApp",
    )[0];
    const withdrawRegistryInfo = this.appRegistry.filter(
      (app: DefaultApp) => app.name === "WithdrawApp",
    )[0];

    await this.removeHangingProposalsByDefinition([
      swapAppRegistryInfo.appDefinitionAddress,
      linkedRegistryInfo.appDefinitionAddress,
      withdrawRegistryInfo.appDefinitionAddress,
    ]);

    // deal with any swap apps that are installed
    await this.uninstallAllAppsByDefintion([
      swapAppRegistryInfo.appDefinitionAddress,
      withdrawRegistryInfo.appDefinitionAddress,
    ]);
  };

  /**
   * Removes all proposals of a give app definition type
   */
  public removeHangingProposalsByDefinition = async (appDefinitions: string[]): Promise<void> => {
    // first get all proposed apps
    const { appInstances: proposed } = await this.getProposedAppInstances();

    // deal with any proposed swap or linked transfer apps
    const hangingProposals = proposed.filter((proposal: AppInstanceProposal) =>
      appDefinitions.includes(proposal.appDefinition),
    );
    // remove from `proposedAppInstances`
    for (const hanging of hangingProposals) {
      await this.rejectInstallApp(hanging.identityHash);
    }
  };

  /**
   * Removes all apps of a given app definition type
   */
  public uninstallAllAppsByDefintion = async (appDefinitions: string[]): Promise<void> => {
    const apps = (await this.getAppInstances()).filter((app: AppInstanceJson) =>
      appDefinitions.includes(app.appInterface.addr),
    );
    //TODO ARJUN there is an edgecase where this will cancel withdrawal
    for (const app of apps) {
      await this.uninstallApp(app.identityHash);
    }
  };

  public uninstallCoinBalanceIfNeeded = async (assetId: string = AddressZero): Promise<void> => {
    // check if there is a coin refund app installed
    const coinRefund = await this.getBalanceRefundApp(assetId);
    if (!coinRefund) {
      this.log.debug("No coin balance refund app found");
      return undefined;
    }

    const latestState = coinRefund.latestState;
    const threshold = bigNumberify(latestState["threshold"]);
    const isTokenDeposit =
      latestState["tokenAddress"] && latestState["tokenAddress"] !== AddressZero;
    const isClientDeposit = latestState["recipient"] === this.freeBalanceAddress;
    if (!isClientDeposit) {
      this.log.warn(`Counterparty's coinBalanceRefund app is installed, cannot uninstall`);
      return;
    }

    const multisigBalance = !isTokenDeposit
      ? await this.ethProvider.getBalance(this.multisigAddress)
      : await new Contract(
          latestState["tokenAddress"],
          tokenAbi,
          this.ethProvider,
        ).functions.balanceOf(this.multisigAddress);

    if (multisigBalance.lt(threshold)) {
      throw new Error(
        "Something is wrong! multisig balance is less than the threshold of the installed coin balance refund app.",
      );
    }

    // define helper fn to uninstall coin balance refund
    const uninstallRefund = async (): Promise<void> => {
      this.log.debug("Deposit has been executed, uninstalling refund app");
      // deposit has been executed, uninstall
      await this.rescindDepositRights({ assetId });
      this.log.debug("Successfully uninstalled");
    };

    // deposit still needs to be executed, wait to uninstall
    if (multisigBalance.eq(threshold)) {
      this.log.warn(
        `Coin balance refund app found installed, but no deposit successfully executed. Leaving app installed and waiting for deposit of ${
          latestState["tokenAddress"]
        } from ${isClientDeposit ? "client" : "node"}`,
      );
      // if the deposit is from the user, register a listener to wait for
      // for successful uninstalling since their queued uninstall request
      // would be lost. if the deposit is from the node, they will be waiting
      // to send an uninstall request to the client
      if (isTokenDeposit) {
        new Contract(assetId, tokenAbi, this.ethProvider).once(
          "Transfer",
          async (sender: string, recipient: string, amount: BigNumber) => {
            if (recipient === this.multisigAddress && amount.gt(0)) {
              this.log.info("Multisig transfer was for our channel, uninstalling refund app");
              await uninstallRefund();
            }
          },
        );
      } else {
        this.ethProvider.once(this.multisigAddress, async (balance: BigNumber) => {
          if (balance.gt(threshold)) {
            await uninstallRefund();
          }
        });
      }
    } else {
      // multisig bal > threshold so deposit has been executed, uninstall
      await uninstallRefund();
    }
  };

  private appNotInstalled = async (appInstanceId: string): Promise<string | undefined> => {
    const apps = await this.getAppInstances();
    const app = apps.filter((app: AppInstanceJson): boolean => app.identityHash === appInstanceId);
    if (!app || app.length === 0) {
      return (
        `Could not find installed app with id: ${appInstanceId}. ` +
        `Installed apps: ${stringify(apps)}.`
      );
    }
    if (app.length > 1) {
      return (
        "CRITICAL ERROR: found multiple apps with the same id. " +
        `Installed apps: ${stringify(apps)}.`
      );
    }
    return undefined;
  };

  private appInstalled = async (appInstanceId: string): Promise<string | undefined> => {
    const apps = await this.getAppInstances();
    const app = apps.filter((app: AppInstanceJson): boolean => app.identityHash === appInstanceId);
    if (app.length > 0) {
      return (
        `App with id ${appInstanceId} is already installed. ` +
        `Installed apps: ${stringify(apps)}.`
      );
    }
    return undefined;
  };

  private checkForUserWithdrawal = async (
    inBlock: number,
  ): Promise<TransactionResponse | undefined> => {
    const val = await this.getLatestWithdrawal();
    if (!val) {
      this.log.error("No transaction found in store.");
      return undefined;
    }

    const { tx } = val;
    // get the transaction hash that we should be looking for from
    // the contract method
    const txsTo = await this.ethProvider.getTransactionCount(tx.to, inBlock);
    if (txsTo === 0) {
      return undefined;
    }

    const block = await this.ethProvider.getBlock(inBlock);
    const { transactions } = block;
    if (transactions.length === 0) {
      return undefined;
    }

    for (const transactionHash of transactions) {
      const transaction = await this.ethProvider.getTransaction(transactionHash);
      if (this.matchTx(transaction, tx)) {
        return transaction;
      }
    }
    return undefined;
  };
}
