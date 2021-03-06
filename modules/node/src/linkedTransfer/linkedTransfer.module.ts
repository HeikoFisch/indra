import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AppRegistryRepository } from "../appRegistry/appRegistry.repository";
import { AuthModule } from "../auth/auth.module";
import { CFCoreModule } from "../cfCore/cfCore.module";
import { ChannelModule } from "../channel/channel.module";
import { ChannelRepository } from "../channel/channel.repository";
import { ConfigModule } from "../config/config.module";
import { LoggerModule } from "../logger/logger.module";
import { MessagingModule } from "../messaging/messaging.module";
import { AppInstanceRepository } from "../appInstance/appInstance.repository";

import { LinkedTransferService } from "./linkedTransfer.service";
import { linkedTransferProviderFactory } from "./linkedTransfer.provider";

@Module({
  controllers: [],
  exports: [LinkedTransferService],
  imports: [
    AuthModule,
    CFCoreModule,
    ChannelModule,
    ConfigModule,
    LoggerModule,
    MessagingModule,
    TypeOrmModule.forFeature([ChannelRepository, AppRegistryRepository, AppInstanceRepository]),
  ],
  providers: [LinkedTransferService, linkedTransferProviderFactory],
})
export class LinkedTransferModule {}
