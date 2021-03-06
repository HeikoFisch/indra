import {
  stringify,
  ResolveFastSignedTransferResponse,
} from "@connext/types";
import { FactoryProvider } from "@nestjs/common/interfaces";
import { RpcException } from "@nestjs/microservices";
import { MessagingService } from "@connext/messaging";

import { AuthService } from "../auth/auth.service";
import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId, FastSignedTransferProviderId } from "../constants";
import { AbstractMessagingProvider } from "../util";

import { FastSignedTransferService } from "./fastSignedTransfer.service";

export class FastSignedTransferMessaging extends AbstractMessagingProvider {
  constructor(
    private readonly authService: AuthService,
    log: LoggerService,
    messaging: MessagingService,
    private readonly fastSignedTransferService: FastSignedTransferService,
  ) {
    super(log, messaging);
    log.setContext("FastSignedTransferMessaging");
  }

  async resolveFastSignedTransfer(
    pubId: string,
    { paymentId }: { paymentId: string },
  ): Promise<ResolveFastSignedTransferResponse> {
    this.log.debug(
      `Got resolve fast signed request with data: ${stringify(paymentId)}`,
    );
    if (!paymentId) {
      throw new RpcException(`Incorrect data received. Data: ${JSON.stringify(paymentId)}`);
    }
    const response = await this.fastSignedTransferService.resolveFastSignedTransfer(
      pubId,
      paymentId,
    );
    return {
      ...response,
      amount: response.amount,
    };
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      "*.transfer.resolve-fast-signed",
      this.authService.parseXpub(this.resolveFastSignedTransfer.bind(this)),
    );
  }
}

export const fastSignedTransferProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [AuthService, LoggerService, MessagingProviderId, FastSignedTransferService],
  provide: FastSignedTransferProviderId,
  useFactory: async (
    authService: AuthService,
    logging: LoggerService,
    messaging: MessagingService,
    fastSignedTransferService: FastSignedTransferService,
  ): Promise<void> => {
    const transfer = new FastSignedTransferMessaging(
      authService,
      logging,
      messaging,
      fastSignedTransferService,
    );
    await transfer.setupSubscriptions();
  },
};
