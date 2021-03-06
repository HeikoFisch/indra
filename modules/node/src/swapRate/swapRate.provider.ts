import { MessagingService } from "@connext/messaging";
import { FactoryProvider } from "@nestjs/common/interfaces";
import { getAddress } from "ethers/utils";

import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId, SwapRateProviderId } from "../constants";
import { AbstractMessagingProvider } from "../util";

import { SwapRateService } from "./swapRate.service";

export class SwapRateMessaging extends AbstractMessagingProvider {
  constructor(
    log: LoggerService,
    messaging: MessagingService,
    private readonly swapRateService: SwapRateService,
  ) {
    super(log, messaging);
    this.log.setContext("SwapRateMessaging");
  }

  async getLatestSwapRate(subject: string): Promise<string> {
    const [, , from, to] = subject.split(".");
    return this.swapRateService.getOrFetchRate(getAddress(from), getAddress(to));
  }

  async setupSubscriptions(): Promise<void> {
    super.connectRequestReponse(`*.swap-rate.>`, this.getLatestSwapRate.bind(this));
  }
}

export const swapRateProviderFactory: FactoryProvider<Promise<MessagingService>> = {
  inject: [LoggerService, MessagingProviderId, SwapRateService],
  provide: SwapRateProviderId,
  useFactory: async (
    log: LoggerService,
    messaging: MessagingService,
    swapRateService: SwapRateService,
  ): Promise<MessagingService> => {
    const swapRate = new SwapRateMessaging(log, messaging, swapRateService);
    await swapRate.setupSubscriptions();
    return messaging;
  },
};
