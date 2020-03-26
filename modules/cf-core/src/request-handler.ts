import { DEPOSIT_CONFIRMED_EVENT, PROTOCOL_MESSAGE_EVENT, ILoggerService } from "@connext/types";
import { Signer } from "ethers";
import { BaseProvider } from "ethers/providers";
import EventEmitter from "eventemitter3";

import { eventNameToImplementation, methodNameToImplementation } from "./methods";
import { ProtocolRunner } from "./machine";
import RpcRouter from "./rpc-router";
import { Store } from "./store";
import {
  CFCoreTypes,
  NetworkContext,
  NODE_EVENTS,
  NodeEvent,
  NodeMessageWrappedProtocolMessage,
} from "./types";
import { bigNumberifyJson, logTime } from "./utils";

/**
 * This class registers handlers for requests to get or set some information
 * about app instances and channels for this Node and any relevant peer Nodes.
 */
export class RequestHandler {
  private readonly methods = new Map();
  private readonly events = new Map();

  router!: RpcRouter;

  constructor(
    readonly publicIdentifier: string,
    readonly incoming: EventEmitter,
    readonly outgoing: EventEmitter,
    readonly store: Store,
    readonly messagingService: CFCoreTypes.IMessagingService,
    readonly protocolRunner: ProtocolRunner,
    readonly networkContext: NetworkContext,
    readonly provider: BaseProvider,
    readonly wallet: Signer,
    readonly blocksNeededForConfirmation: number,
    readonly lockService: CFCoreTypes.ILockService,
    public readonly log: ILoggerService,
  ) {
    this.log = this.log.newContext("CF-RequestHandler");
  }

  injectRouter(router: RpcRouter) {
    this.router = router;
    this.mapPublicApiMethods();
    this.mapEventHandlers();
  }

  /**
   * In some use cases, waiting for the response of a method call is easier
   * and cleaner than wrangling through callback hell.
   * @param method
   * @param req
   */
  public async callMethod(
    method: CFCoreTypes.MethodName,
    req: CFCoreTypes.MethodRequest,
  ): Promise<CFCoreTypes.MethodResponse> {
    const start = Date.now();
    const result: CFCoreTypes.MethodResponse = {
      type: req.type,
      requestId: req.requestId,
      result: await this.methods.get(method)(this, req.params),
    };
    logTime(this.log, start, `Method ${method} was executed`);
    return result;
  }

  /**
   * This registers all of the methods the Node is expected to have
   */
  private mapPublicApiMethods() {
    for (const methodName in methodNameToImplementation) {
      this.methods.set(methodName, methodNameToImplementation[methodName]);
      this.incoming.on(methodName, async (req: CFCoreTypes.MethodRequest) => {
        const res: CFCoreTypes.MethodResponse = {
          type: req.type,
          requestId: req.requestId,
          result: await this.methods.get(methodName)(this, bigNumberifyJson(req.params)),
        };
        this.router.emit((req as any).methodName, res, "outgoing");
      });
    }
  }

  /**
   * This maps the Node event names to their respective handlers.
   * These are the events being listened on to detect requests from peer Nodes.
   */
  private mapEventHandlers() {
    for (const eventName of Object.values(NODE_EVENTS)) {
      this.events.set(eventName, eventNameToImplementation[eventName]);
    }
  }

  /**
   * This is internally called when an event is received from a peer Node.
   * Node consumers can separately setup their own callbacks for incoming events.
   * @param event
   * @param msg
   */
  public async callEvent(event: NodeEvent, msg: CFCoreTypes.NodeMessage) {
    const start = Date.now();
    const controllerExecutionMethod = this.events.get(event);
    const controllerCount = this.router.eventListenerCount(event);

    if (!controllerExecutionMethod && controllerCount === 0) {
      if (event === DEPOSIT_CONFIRMED_EVENT) {
        this.log.info(
          `No event handler for counter depositing into channel: ${JSON.stringify(
            msg,
            undefined,
            4,
          )}`,
        );
      } else {
        throw new Error(`Recent ${event} event which has no event handler`);
      }
    }

    if (controllerExecutionMethod) {
      await controllerExecutionMethod(this, msg);
    }

    logTime(
      this.log,
      start,
      `Event ${
        event !== PROTOCOL_MESSAGE_EVENT
          ? event
          : `for ${(msg as NodeMessageWrappedProtocolMessage).data.protocol} protocol`
      } was processed`,
    );
    this.router.emit(event, msg);
  }

  public async isLegacyEvent(event: NodeEvent) {
    return this.events.has(event);
  }

  public async getSigner(): Promise<Signer> {
    return this.wallet;
  }

  public async getSignerAddress(): Promise<string> {
    const signer = await this.getSigner();
    return await signer.getAddress();
  }
}
