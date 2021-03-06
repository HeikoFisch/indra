import { signDigest } from "@connext/crypto";
import {
  AppInstanceProposal,
  CommitmentTypes,
  delay,
  EventNames,
  ILoggerService,
  MethodName,
  MinimalTransaction,
  nullLogger,
  PersistAppType,
} from "@connext/types";
import { JsonRpcProvider } from "ethers/providers";
import { SigningKey } from "ethers/utils";
import EventEmitter from "eventemitter3";
import { Memoize } from "typescript-memoize";

import { createRpcRouter } from "./methods";
import AutoNonceWallet from "./auto-nonce-wallet";
import { IO_SEND_AND_WAIT_TIMEOUT } from "./constants";
import { Deferred } from "./deferred";
import {
  ConditionalTransactionCommitment,
  MultisigCommitment,
  SetStateCommitment,
} from "./ethereum";
import { ProtocolRunner } from "./machine";
import { getFreeBalanceAddress, StateChannel, AppInstance } from "./models";
import { getPrivateKeysGeneratorAndXPubOrThrow, PrivateKeysGetter } from "./private-keys-generator";
import ProcessQueue from "./process-queue";
import { RequestHandler } from "./request-handler";
import RpcRouter from "./rpc-router";
import { Store } from "./store";
import {
  ILockService,
  IMessagingService,
  IPrivateKeyGenerator,
  IStoreService,
  MethodRequest,
  MethodResponse,
  NetworkContext,
  NodeMessage,
  NodeMessageWrappedProtocolMessage,
  Opcode,
  ProtocolMessage,
} from "./types";

export interface NodeConfig {
  // The prefix for any keys used in the store by this Node depends on the
  // execution environment.
  STORE_KEY_PREFIX: string;
}

const REASONABLE_NUM_BLOCKS_TO_WAIT = 1;

export class Node {
  private readonly incoming: EventEmitter;
  private readonly outgoing: EventEmitter;

  private readonly protocolRunner: ProtocolRunner;

  private readonly ioSendDeferrals = new Map<string, Deferred<NodeMessageWrappedProtocolMessage>>();

  /**
   * These properties don't have initializers in the constructor, since they must be initialized
   * asynchronously. This is done via the `asynchronouslySetupUsingRemoteServices` function.
   * Since we have a private constructor and only allow instances of the Node to be created
   * via `create` which immediately calls `asynchronouslySetupUsingRemoteServices`, these are
   * always non-null when the Node is being used.
   */
  private signer!: SigningKey;
  protected requestHandler!: RequestHandler;
  public rpcRouter!: RpcRouter;
  private store!: Store;

  static async create(
    messagingService: IMessagingService,
    storeService: IStoreService,
    networkContext: NetworkContext,
    nodeConfig: NodeConfig,
    provider: JsonRpcProvider,
    lockService?: ILockService,
    publicExtendedKey?: string,
    privateKeyGenerator?: IPrivateKeyGenerator,
    blocksNeededForConfirmation?: number,
    logger?: ILoggerService,
  ): Promise<Node> {
    const [privateKeysGenerator, extendedPubKey] = await getPrivateKeysGeneratorAndXPubOrThrow(
      storeService,
      privateKeyGenerator,
      publicExtendedKey,
    );

    const node = new Node(
      extendedPubKey,
      privateKeysGenerator,
      messagingService,
      storeService,
      nodeConfig,
      provider,
      networkContext,
      blocksNeededForConfirmation,
      logger,
      lockService,
    );

    return await node.asynchronouslySetupUsingRemoteServices();
  }

  private constructor(
    private readonly publicExtendedKey: string,
    private readonly privateKeyGetter: PrivateKeysGetter,
    private readonly messagingService: IMessagingService,
    private readonly storeService: IStoreService,
    private readonly nodeConfig: NodeConfig,
    private readonly provider: JsonRpcProvider,
    public readonly networkContext: NetworkContext,
    public readonly blocksNeededForConfirmation: number = REASONABLE_NUM_BLOCKS_TO_WAIT,
    public readonly log: ILoggerService = nullLogger,
    private readonly lockService?: ILockService,
  ) {
    this.log = log.newContext("CF-Node");
    this.networkContext.provider = this.provider;
    this.incoming = new EventEmitter();
    this.outgoing = new EventEmitter();
    this.store = new Store(this.storeService, this.log);
    this.protocolRunner = this.buildProtocolRunner();
  }

  private async asynchronouslySetupUsingRemoteServices(): Promise<Node> {
    this.signer = new SigningKey(await this.privateKeyGetter.getPrivateKey("0"));
    this.log.info(`Node signer address: ${this.signer.address}`);
    this.log.info(`Node public identifier: ${this.publicIdentifier}`);
    this.requestHandler = new RequestHandler(
      this.publicIdentifier,
      this.incoming,
      this.outgoing,
      this.store,
      this.messagingService,
      this.protocolRunner,
      this.networkContext,
      this.provider,
      new AutoNonceWallet(
        this.signer.privateKey,
        // Creating copy of the provider fixes a mysterious big, details:
        // https://github.com/ethers-io/ethers.js/issues/761
        new JsonRpcProvider(this.provider.connection.url),
      ),
      this.blocksNeededForConfirmation!,
      new ProcessQueue(this.lockService),
      this.log,
    );
    this.registerMessagingConnection();
    this.rpcRouter = createRpcRouter(this.requestHandler);
    this.requestHandler.injectRouter(this.rpcRouter);
    return this;
  }

  @Memoize()
  get publicIdentifier(): string {
    return this.publicExtendedKey;
  }

  @Memoize()
  async signerAddress(): Promise<string> {
    return await this.requestHandler.getSignerAddress();
  }

  @Memoize()
  get freeBalanceAddress(): string {
    return getFreeBalanceAddress(this.publicIdentifier);
  }

  /**
   * Instantiates a new _ProtocolRunner_ object and attaches middleware
   * for the OP_SIGN, IO_SEND, and IO_SEND_AND_WAIT opcodes.
   */
  private buildProtocolRunner(): ProtocolRunner {
    const protocolRunner = new ProtocolRunner(
      this.networkContext,
      this.provider,
      this.store,
      this.log.newContext("CF-ProtocolRunner"),
    );

    protocolRunner.register(Opcode.OP_SIGN, async (args: any[]) => {
      if (args.length !== 1 && args.length !== 2) {
        throw new Error("OP_SIGN middleware received wrong number of arguments.");
      }

      const [commitmentHash, overrideKeyIndex] = args;
      const keyIndex = overrideKeyIndex || 0;

      const privateKey = await this.privateKeyGetter.getPrivateKey(keyIndex);

      return signDigest(privateKey, commitmentHash);
    });

    protocolRunner.register(Opcode.IO_SEND, async (args: [ProtocolMessage]) => {
      const [data] = args;
      const fromXpub = this.publicIdentifier;
      const to = data.toXpub;

      await this.messagingService.send(to, {
        data,
        from: fromXpub,
        type: EventNames.PROTOCOL_MESSAGE_EVENT,
      } as NodeMessageWrappedProtocolMessage);
    });

    protocolRunner.register(Opcode.IO_SEND_AND_WAIT, async (args: [ProtocolMessage]) => {
      const [data] = args;
      const to = data.toXpub;

      const deferral = new Deferred<NodeMessageWrappedProtocolMessage>();

      this.ioSendDeferrals.set(data.processID, deferral);

      const counterpartyResponse = deferral.promise;

      await this.messagingService.send(to, {
        data,
        from: this.publicIdentifier,
        type: EventNames.PROTOCOL_MESSAGE_EVENT,
      } as NodeMessageWrappedProtocolMessage);

      // 90 seconds is the default lock acquiring time time
      const msg = await Promise.race([counterpartyResponse, delay(IO_SEND_AND_WAIT_TIMEOUT)]);

      if (!msg || !("data" in (msg as NodeMessageWrappedProtocolMessage))) {
        throw new Error(
          `IO_SEND_AND_WAIT timed out after 90s waiting for counterparty reply in ${data.protocol}`,
        );
      }

      // Removes the deferral from the list of pending defferals after
      // its promise has been resolved and the necessary callback (above)
      // has been called. Note that, as is, only one defferal can be open
      // per counterparty at the moment.
      this.ioSendDeferrals.delete(data.processID);

      return (msg as NodeMessageWrappedProtocolMessage).data;
    });

    protocolRunner.register(Opcode.PERSIST_STATE_CHANNEL, async (args: [StateChannel[]]) => {
      const { store } = this.requestHandler;
      const [stateChannels] = args;

      for (const stateChannel of stateChannels) {
        await store.saveStateChannel(stateChannel);
      }
    });

    protocolRunner.register(
      Opcode.PERSIST_COMMITMENT,
      async (
        args: [
          CommitmentTypes,
          MultisigCommitment | SetStateCommitment | MinimalTransaction,
          string,
        ],
      ) => {
        const { store } = this.requestHandler;

        const [commitmentType, commitment, ...res] = args;

        switch (commitmentType) {

          case CommitmentTypes.Conditional:
            const [appId] = res;
            await store.saveConditionalTransactionCommitment(
              appId,
              commitment as ConditionalTransactionCommitment,
            );
            break;

          case CommitmentTypes.SetState:
            const [appIdentityHash] = res;
            await store.saveLatestSetStateCommitment(
              appIdentityHash,
              commitment as SetStateCommitment,
            );
            break;

          case CommitmentTypes.Setup:
            const [multisigAddress] = res;
            await store.saveSetupCommitment(
              multisigAddress,
              commitment as MinimalTransaction,
            );
            break;

          case CommitmentTypes.Withdraw:
            const [multisig] = res;
            await store.saveWithdrawalCommitment(
              multisig,
              commitment as MinimalTransaction,
            );
            break;

          default:
            throw new Error(`Unrecognized commitment type: ${commitmentType}`);
        }
        return;
      },
    );

    protocolRunner.register(
      Opcode.PERSIST_APP_INSTANCE,
      async (args: [PersistAppType, StateChannel, AppInstance | AppInstanceProposal]) => {
        const { store } = this.requestHandler;
        const [type, postProtocolChannel, app] = args;

        // always persist the free balance
        // this will error if channel does not exist
        // 25ms
        try {
          await store.saveFreeBalance(postProtocolChannel);
        } catch(e) {
          throw new Error(`Setup protocol has not been run`);
        }

        switch (type) {
          case PersistAppType.Proposal: {
            // 48ms
            await store.saveAppProposal(postProtocolChannel, app as AppInstanceProposal);
          }
            break;
          case PersistAppType.Reject:
            await store.removeAppProposal(postProtocolChannel, app as AppInstanceProposal);
            break;

          case PersistAppType.Instance:
            if (app.identityHash === postProtocolChannel.freeBalance.identityHash) {
              break;
            }
            // 24ms
            await store.saveAppInstance(postProtocolChannel, app as AppInstance);
            break;

          case PersistAppType.Uninstall:
            // 17ms
            await store.removeAppInstance(postProtocolChannel, app as AppInstance);
            break;

          default:
            throw new Error(`Unrecognized app persistence call: ${type}`);
        }
      },
    );

    return protocolRunner;
  }

  /**
   * This is the entrypoint to listening for messages from other Nodes.
   * Delegates setting up a listener to the Node's outgoing EventEmitter.
   * @param event
   * @param callback
   */
  on(event: EventNames | MethodName, callback: (res: any) => void) {
    this.rpcRouter.subscribe(event, async (res: any) => callback(res));
  }

  /**
   * Stops listening for a given message from other Nodes. If no callback is passed,
   * all callbacks are removed.
   *
   * @param event
   * @param [callback]
   */
  off(event: EventNames | MethodName, callback?: (res: any) => void) {
    this.rpcRouter.unsubscribe(event, callback ? async (res: any) => callback(res) : undefined);
  }

  /**
   * This is the entrypoint to listening for messages from other Nodes.
   * Delegates setting up a listener to the Node's outgoing EventEmitter.
   * It'll run the callback *only* once.
   *
   * @param event
   * @param [callback]
   */
  once(event: EventNames | MethodName, callback: (res: any) => void) {
    this.rpcRouter.subscribeOnce(event, async (res: any) => callback(res));
  }

  /**
   * Delegates emitting events to the Node's incoming EventEmitter.
   * @param event
   * @param req
   */
  emit(event: EventNames | MethodName, req: MethodRequest) {
    this.rpcRouter.emit(event, req);
  }

  /**
   * Makes a direct call to the Node for a specific method.
   * @param method
   * @param req
   */
  async call(
    method: MethodName,
    req: MethodRequest,
  ): Promise<MethodResponse> {
    return this.requestHandler.callMethod(method, req);
  }

  /**
   * When a Node is first instantiated, it establishes a connection
   * with the messaging service. When it receives a message, it emits
   * the message to its registered subscribers, usually external
   * subscribed (i.e. consumers of the Node).
   */
  private registerMessagingConnection() {
    this.messagingService.onReceive(this.publicIdentifier, async (msg: NodeMessage) => {
      await this.handleReceivedMessage(msg);
      this.rpcRouter.emit(msg.type, msg, "outgoing");
    });
  }

  /**
   * Messages received by the Node fit into one of three categories:
   *
   * (a) A NodeMessage which is _not_ a NodeMessageWrappedProtocolMessage;
   *     this is a standard received message which is handled by a named
   *     controller in the _events_ folder.
   *
   * (b) A NodeMessage which is a NodeMessageWrappedProtocolMessage _and_
   *     has no registered _ioSendDeferral_ callback. In this case, it means
   *     it will be sent to the protocol message event controller to dispatch
   *     the received message to the instruction executor.
   *
   * (c) A NodeMessage which is a NodeMessageWrappedProtocolMessage _and_
   *     _does have_ an _ioSendDeferral_, in which case the message is dispatched
   *     solely to the deffered promise's resolve callback.
   */
  private async handleReceivedMessage(msg: NodeMessage) {
    if (!Object.values(EventNames).includes(msg.type)) {
      this.log.error(`Received message with unknown event type: ${msg.type}`);
    }

    const isProtocolMessage = (msg: NodeMessage) => msg.type === EventNames.PROTOCOL_MESSAGE_EVENT;

    const isExpectingResponse = (msg: NodeMessageWrappedProtocolMessage) =>
      this.ioSendDeferrals.has(msg.data.processID);
    if (isProtocolMessage(msg) && isExpectingResponse(msg as NodeMessageWrappedProtocolMessage)) {
      await this.handleIoSendDeferral(msg as NodeMessageWrappedProtocolMessage);
    } else if (this.requestHandler.isLegacyEvent(msg.type)) {
      await this.requestHandler.callEvent(msg.type, msg);
    } else {
      await this.rpcRouter.emit(msg.type, msg);
    }
  }

  private async handleIoSendDeferral(msg: NodeMessageWrappedProtocolMessage) {
    const key = msg.data.processID;

    if (!this.ioSendDeferrals.has(key)) {
      throw new Error("Node received message intended for machine but no handler was present");
    }

    const promise = this.ioSendDeferrals.get(key)!;

    try {
      promise.resolve(msg);
    } catch (error) {
      this.log.error(
        `Error while executing callback registered by IO_SEND_AND_WAIT middleware hook error ${
          JSON.stringify(error, null, 2)
        } msg ${
          JSON.stringify(msg, null, 2)
        }`,
      );
    }
  }
}
