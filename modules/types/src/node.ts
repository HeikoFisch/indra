import { AppRegistry } from "./app";
import { BigNumber, Network, Transaction } from "./basic";
import { NetworkContext } from "./contracts";
import { CFCoreChannel, ChannelAppSequences, RebalanceProfile } from "./channel";
import { IChannelProvider } from "./channelProvider";
import { ILoggerService } from "./logger";
import { IMessagingService } from "./messaging";
import { ProtocolTypes } from "./protocol";
import {
  ResolveLinkedTransferResponse,
  ResolveFastSignedTransferResponse,
  ResolveHashLockTransferResponse,
  GetHashLockTransferResponse,
  ResolveSignedTransferResponse,
  GetSignedTransferResponse,
  LinkedTransferStatus,
} from "./apps";

////////////////////////////////////
///////// NODE RESPONSE TYPES

export type ContractAddresses = NetworkContext & {
  Token: string;
  [SupportedApplication: string]: string;
};

export interface NodeConfig {
  nodePublicIdentifier: string; // x-pub of node
  chainId: string; // network that your channel is on
  nodeUrl: string;
}

// TODO: is this the type that is actually returned?
// i think you get status, etc.
export type Transfer<T = string> = {
  paymentId: string;
  amount: T;
  assetId: string;
  senderPublicIdentifier: string;
  receiverPublicIdentifier: string;
  meta: any;
};
export type TransferBigNumber = Transfer<BigNumber>;

// nats stuff
type successResponse = {
  status: "success";
};

type errorResponse = {
  status: "error";
  message: string;
};

export type NatsResponse = {
  data: string;
} & (errorResponse | successResponse);

export type GetConfigResponse = {
  ethNetwork: Network;
  contractAddresses: ContractAddresses;
  nodePublicIdentifier: string;
  messagingUrl: string[];
  supportedTokenAddresses: string[];
};

export type GetChannelResponse = CFCoreChannel;

// returns the transaction hash of the multisig deployment
// TODO: this will likely change
export type CreateChannelResponse = {
  transactionHash: string;
};

// TODO: why was this changed?
export type RequestCollateralResponse = ProtocolTypes.DepositResult | undefined;

export type FetchedLinkedTransfer<T = any> = {
  paymentId: string;
  createdAt: Date;
  amount: string;
  assetId: string;
  senderPublicIdentifier: string;
  receiverPublicIdentifier?: string;
  status: LinkedTransferStatus;
  meta: T;
  encryptedPreImage?: string;
};
export type GetLinkedTransferResponse<T = any> = FetchedLinkedTransfer<T>;
export type GetPendingAsyncTransfersResponse = FetchedLinkedTransfer[];

////////////////////////////////////
///////// NODE API CLIENT

export interface VerifyNonceDtoType {
  sig: string;
  userPublicIdentifier: string;
}

export interface NodeInitializationParameters {
  nodeUrl: string;
  messaging: IMessagingService;
  logger?: ILoggerService;
  userPublicIdentifier?: string;
  nodePublicIdentifier?: string;
  channelProvider?: IChannelProvider;
}

export interface INodeApiClient {
  channelProvider: IChannelProvider | undefined;
  userPublicIdentifier: string | undefined;
  nodePublicIdentifier: string | undefined;

  acquireLock(lockName: string, timeout?: number): Promise<string>;
  releaseLock(lockName: string, lockValue: string): Promise<void>;
  appRegistry(
    appDetails?:
      | {
          name: string;
          chainId: number;
        }
      | { appDefinitionAddress: string },
  ): Promise<AppRegistry>;
  config(): Promise<GetConfigResponse>;
  createChannel(): Promise<CreateChannelResponse>;
  clientCheckIn(): Promise<void>;
  getChannel(): Promise<GetChannelResponse>;
  getLatestSwapRate(from: string, to: string): Promise<string>;
  getRebalanceProfile(assetId?: string): Promise<RebalanceProfile>;
  getHashLockTransfer(lockHash: string): Promise<GetHashLockTransferResponse>;
  getPendingAsyncTransfers(): Promise<GetPendingAsyncTransfersResponse>;
  getTransferHistory(publicIdentifier?: string): Promise<Transfer[]>;
  getLatestWithdrawal(): Promise<Transaction>;
  requestCollateral(assetId: string): Promise<RequestCollateralResponse | void>;
  fetchLinkedTransfer(paymentId: string): Promise<GetLinkedTransferResponse>;
  fetchSignedTransfer(paymentId: string): Promise<GetSignedTransferResponse>;
  resolveLinkedTransfer(paymentId: string): Promise<ResolveLinkedTransferResponse>;
  resolveFastSignedTransfer(paymentId: string): Promise<ResolveFastSignedTransferResponse>;
  resolveHashLockTransfer(lockHash: string): Promise<ResolveHashLockTransferResponse>;
  resolveSignedTransfer(paymentId: string): Promise<ResolveSignedTransferResponse>;
  recipientOnline(recipientPublicIdentifier: string): Promise<boolean>;
  restoreState(publicIdentifier: string): Promise<any>;
  subscribeToSwapRates(from: string, to: string, callback: any): Promise<void>;
  unsubscribeFromSwapRates(from: string, to: string): Promise<void>;
  // TODO: fix types
  verifyAppSequenceNumber(appSequenceNumber: number): Promise<ChannelAppSequences>;
}
