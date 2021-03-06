import { MessagingService } from "@connext/messaging";
import {
  bigNumberifyJson,
  GetLinkedTransferResponse,
  GetPendingAsyncTransfersResponse,
  LinkedTransferStatus,
  ResolveLinkedTransferResponse,
  SimpleLinkedTransferAppState,
  stringify,
} from "@connext/types";
import { FactoryProvider } from "@nestjs/common/interfaces";
import { RpcException } from "@nestjs/microservices";

import { AuthService } from "../auth/auth.service";
import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId, LinkedTransferProviderId } from "../constants";
import { AbstractMessagingProvider } from "../util";

import { LinkedTransferService } from "./linkedTransfer.service";

export class LinkedTransferMessaging extends AbstractMessagingProvider {
  constructor(
    private readonly authService: AuthService,
    log: LoggerService,
    messaging: MessagingService,
    private readonly linkedTransferService: LinkedTransferService,
  ) {
    super(log, messaging);
    log.setContext("LinkedTransferMessaging");
  }

  async getLinkedTransferByPaymentId(
    pubId: string,
    data: { paymentId: string },
  ): Promise<GetLinkedTransferResponse | undefined> {
    const { paymentId } = data;
    if (!paymentId) {
      throw new RpcException(`Incorrect data received. Data: ${JSON.stringify(data)}`);
    }
    this.log.info(`Got fetch link request for: ${paymentId}`);

    // determine status
    // node receives transfer in sender app
    const {
      senderApp,
      status,
    } = await this.linkedTransferService.findSenderAndReceiverAppsWithStatus(paymentId);
    if (!senderApp) {
      return undefined;
    }

    const latestState = bigNumberifyJson(senderApp.latestState) as SimpleLinkedTransferAppState;
    const { encryptedPreImage, recipient, ...meta } = senderApp.meta || ({} as any);
    return {
      amount: latestState.amount,
      meta: meta || {},
      assetId: latestState.assetId,
      createdAt: senderApp.createdAt,
      paymentId: latestState.paymentId,
      senderPublicIdentifier: senderApp.channel.userPublicIdentifier,
      status,
      encryptedPreImage: encryptedPreImage,
      receiverPublicIdentifier: recipient,
    };
  }

  async resolveLinkedTransfer(
    pubId: string,
    { paymentId }: { paymentId: string },
  ): Promise<ResolveLinkedTransferResponse> {
    this.log.debug(
      `Got resolve link request with data: ${stringify(paymentId)}`,
    );
    if (!paymentId) {
      throw new RpcException(`Incorrect data received. Data: ${JSON.stringify(paymentId)}`);
    }
    const response = await this.linkedTransferService.resolveLinkedTransfer(pubId, paymentId);
    return {
      ...response,
      amount: response.amount,
    };
  }

  async getPendingTransfers(
    userPublicIdentifier: string,
  ): Promise<GetPendingAsyncTransfersResponse> {
    const transfers = await this.linkedTransferService.getLinkedTransfersForRedeem(
      userPublicIdentifier,
    );
    return transfers.map(transfer => {
      const state = bigNumberifyJson(transfer.latestState) as SimpleLinkedTransferAppState;
      return {
        paymentId: state.paymentId,
        createdAt: transfer.createdAt,
        amount: state.amount,
        assetId: state.assetId,
        senderPublicIdentifier: transfer.channel.userPublicIdentifier,
        receiverPublicIdentifier: transfer.meta["recipient"],
        status: LinkedTransferStatus.PENDING,
        meta: transfer.meta,
        encryptedPreImage: transfer.meta["encryptedPreImage"],
      };
    });
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      "*.transfer.fetch-linked",
      this.authService.parseXpub(this.getLinkedTransferByPaymentId.bind(this)),
    );
    await super.connectRequestReponse(
      "*.transfer.resolve-linked",
      this.authService.parseXpub(this.resolveLinkedTransfer.bind(this)),
    );
    await super.connectRequestReponse(
      "*.transfer.get-pending",
      this.authService.parseXpub(this.getPendingTransfers.bind(this)),
    );
  }
}

export const linkedTransferProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [AuthService, LoggerService, MessagingProviderId, LinkedTransferService],
  provide: LinkedTransferProviderId,
  useFactory: async (
    authService: AuthService,
    logging: LoggerService,
    messaging: MessagingService,
    linkedTransferService: LinkedTransferService,
  ): Promise<void> => {
    const transfer = new LinkedTransferMessaging(
      authService,
      logging,
      messaging,
      linkedTransferService,
    );
    await transfer.setupSubscriptions();
  },
};
