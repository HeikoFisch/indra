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
import { LinkedTransferModule } from "../linkedTransfer/linkedTransfer.module";
import { FastSignedTransferModule } from "../fastSignedTransfer/fastSignedTransfer.module";

import { transferProviderFactory } from "./transfer.provider";
import { TransferService } from "./transfer.service";

@Module({
  controllers: [],
  exports: [TransferService],
  imports: [
    AuthModule,
    CFCoreModule,
    ChannelModule,
    ConfigModule,
    FastSignedTransferModule,
    LoggerModule,
    LinkedTransferModule,
    MessagingModule,
    TypeOrmModule.forFeature([ChannelRepository, AppRegistryRepository]),
  ],
  providers: [TransferService, transferProviderFactory],
})
export class TransferModule {}
