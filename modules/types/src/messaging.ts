import { EventNames, EventPayloads } from "./events";
import { DecString } from "./basic";
import { ILoggerService } from "./logger";
import {
  MethodName,
  MethodResult,
  MethodResults,
  MethodParam,
  MethodParams,
} from "./methods";
import { ProtocolName, ProtocolParam } from "./protocol";

export type MethodMessage = {
  type: MethodName;
  requestId: string;
};

export type MethodRequest = MethodMessage & {
  params: MethodParam;
};

export type MethodResponse = MethodMessage & {
  result: MethodResult;
};

////////////////////////////////////////
// Message Metadata & Wrappers

export type ProtocolMessage = {
  processID: string;
  protocol: ProtocolName;
  params?: ProtocolParam;
  toXpub: string;
  seq: number;
  // customData: Additional data which depends on the protocol (or even the specific message
  // number in a protocol) lives here. Includes signatures
  customData: { [key: string]: any };
};

export enum ErrorType {
  ERROR = "error",
}

export type Error = {
  type: ErrorType;
  requestId?: string;
  data: {
    errorName: string;
    message?: string;
    appInstanceId?: string;
    extra?: { [k: string]: string | number | boolean | object };
  };
};

export type Message = MethodRequest | MethodResponse | Event | Error;

// The message type for Nodes to communicate with each other.

export const CF_CORE_MESSAGING_PREFIX = "INDRA";

export const getMessagingPrefix = (chainId: number) => `${CF_CORE_MESSAGING_PREFIX}.${chainId}`;

export type NodeMessage = {
  from: string;
  type: EventNames;
};

type JsonRpcProtocolV2 = {
  jsonrpc: "2.0";
};

type RpcParameters =
  | {
      [key: string]: any;
    }
  | any[];

export type JsonRpcNotification = JsonRpcProtocolV2 & {
  result: any;
};

export type JsonRpcResponse = JsonRpcNotification & {
  id: number;
};

export type Rpc = {
  methodName: string;
  parameters: RpcParameters;
  id?: number;
};

export interface IRpcNodeProvider {
  onMessage(callback: (message: JsonRpcResponse | JsonRpcNotification) => void): any;
  sendMessage(message: Rpc): any;
}

export interface MessagingConfig {
  clusterId?: string;
  logger?: ILoggerService;
  messagingUrl: string | string[];
  options?: any;
  privateKey?: string;
  publicKey?: string;
  token?: string;
}

export interface CFMessagingService {
  send(to: string, msg: NodeMessage): Promise<void>;
  onReceive(address: string, callback: (msg: NodeMessage) => void): any;
}

export interface IMessagingService extends CFMessagingService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  flush(): Promise<void>;
  onReceive(subject: string, callback: (msg: NodeMessage) => void): Promise<void>;
  publish(subject: string, data: any): Promise<void>;
  request(
    subject: string,
    timeout: number,
    data: object,
    callback?: (response: any) => any,
  ): Promise<any>;
  send(to: string, msg: NodeMessage): Promise<void>;
  subscribe(subject: string, callback: (msg: NodeMessage) => void): Promise<void>;
  unsubscribe(subject: string): Promise<void>;
}

////////////////////////////////////////
// Message Contents

export interface NodeMessageWrappedProtocolMessage extends NodeMessage {
  data: ProtocolMessage;
}

export interface CreateChannelMessage extends NodeMessage {
  data: MethodResults.CreateChannel;
}

export interface DepositConfirmationMessage extends NodeMessage {
  data: MethodParams.Deposit;
}

export interface DepositFailedMessage extends NodeMessage {
  data: {
    params: MethodParams.Deposit;
    errors: string[];
  };
}

export interface DepositStartedMessage extends NodeMessage {
  data: {
    value: DecString;
    txHash: string;
  };
}

export interface InstallMessage extends NodeMessage {
  data: {
    params: MethodParams.Install;
  };
}

export interface ProposeMessage extends NodeMessage {
  data: {
    params: MethodParams.ProposeInstall;
    appInstanceId: string;
  };
}

export interface RejectProposalMessage extends NodeMessage {
  data: {
    appInstanceId: string;
  };
}

export interface UninstallMessage extends NodeMessage {
  data: EventPayloads.Uninstall;
}

export interface UpdateStateMessage extends NodeMessage {
  data: EventPayloads.UpdateState;
}

export type EventEmittedMessage =
  | RejectProposalMessage
  | UninstallMessage
  | UpdateStateMessage
  | InstallMessage
  | ProposeMessage
  | DepositConfirmationMessage
  | DepositStartedMessage
  | DepositFailedMessage
  | CreateChannelMessage
  | NodeMessageWrappedProtocolMessage;
