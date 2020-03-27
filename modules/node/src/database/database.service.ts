/* eslint-disable max-len */
import { Injectable } from "@nestjs/common";
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from "@nestjs/typeorm";

import { AppRegistry } from "../appRegistry/appRegistry.entity";
import { CFCoreRecord } from "../cfCore/cfCore.entity";
import { Channel } from "../channel/channel.entity";
import { ConfigService } from "../config/config.service";
import {
  OnchainTransaction,
  AnonymizedOnchainTransaction,
} from "../onchainTransactions/onchainTransaction.entity";
import { RebalanceProfile } from "../rebalanceProfile/rebalanceProfile.entity";
import { SetStateCommitment } from "../setStateCommitment/setStateCommitment.entity";
import { ConditionalTransactionCommitment } from "../conditionalCommitment/conditionalCommitment.entity";
import { AppInstance } from "../appInstance/appInstance.entity";
import { SetupCommitment } from "../setupCommitment/setupCommitment.entity";
import { Withdraw } from "../withdraw/withdraw.entity";
import { WithdrawCommitment } from "../withdrawCommitment/withdrawCommitment.entity";
import { FreeBalanceAppInstance } from "../freeBalanceAppInstance/freeBalanceAppInstance.entity";

// Import Migrations
import { InitNodeRecords1567158660577 } from "../../migrations/1567158660577-init-node-records";
import { InitHubTables1567158805166 } from "../../migrations/1567158805166-init-hub-tables";
import { AddCollateralizationInFlight1567601573372 } from "../../migrations/1567601573372-add-collateralization-in-flight";
import { AddReclaimedLinks1568746114079 } from "../../migrations/1568746114079-add-reclaimed-links";
import { AddOnchainTransactions1569489199954 } from "../../migrations/1569489199954-add-onchain-transaction";
import { AddRecipientToLinks1569862328684 } from "../../migrations/1569862328684-add-recipient-to-links";
import { AddTransferView1571072372000 } from "../../migrations/1571072372000-add-transfer-view";
import { AddTransferMetas1574449936874 } from "../../migrations/1574449936874-add-transfer-metas";
import { AddCfcoreTimestamps1574451273832 } from "../../migrations/1574451273832-add-cfcore-timestamps";
import { EditViewTable1578621554000 } from "../../migrations/1578621554000-edit-view-table";
import { NetworkToChainId1579686361011 } from "../../migrations/1579686361011-network-to-chain-id";
import { AddAnonymizedViewTables1581090243171 } from "../../migrations/1581090243171-add-anonymized-view-tables";
import { RebalancingProfile1581796200880 } from "../../migrations/1581796200880-rebalancing-profile";
import { fastSignedTransfer1583682931763 } from "../../migrations/1583682931763-fast-signed-transfer";
import { typeormSync1584364675207 } from "../../migrations/1584364675207-typeorm-sync";
import { typeormSync21584369931723 } from "../../migrations/1584369931723-typeorm-sync-2";
import { initWithdrawApp1584466373728 } from "../../migrations/1584466373728-init-withdraw-app";
import { cfCoreStoreUpdate1584633495374 } from "../../migrations/1584633495374-cf-core-store-update";
import { createdUpdated1584722683650 } from "../../migrations/1584722683650-created-updated";
import { meta1584732939683 } from "../../migrations/1584732939683-meta";
import { dbOptimizations1584959857727 } from "../../migrations/1584959857727-db-optimizations";

export const entities = [
  AppInstance,
  AnonymizedOnchainTransaction,
  AppRegistry,
  Channel,
  CFCoreRecord,
  FreeBalanceAppInstance,
  RebalanceProfile,
  OnchainTransaction,
  ConditionalTransactionCommitment,
  SetStateCommitment,
  SetupCommitment,
  Withdraw,
  WithdrawCommitment,
];

export const migrations = [
  InitNodeRecords1567158660577,
  InitHubTables1567158805166,
  AddCollateralizationInFlight1567601573372,
  AddReclaimedLinks1568746114079,
  AddOnchainTransactions1569489199954,
  AddRecipientToLinks1569862328684,
  AddTransferView1571072372000,
  AddCfcoreTimestamps1574451273832,
  AddTransferMetas1574449936874,
  EditViewTable1578621554000,
  NetworkToChainId1579686361011,
  AddAnonymizedViewTables1581090243171,
  RebalancingProfile1581796200880,
  fastSignedTransfer1583682931763,
  typeormSync1584364675207,
  typeormSync21584369931723,
  initWithdrawApp1584466373728,
  cfCoreStoreUpdate1584633495374,
  createdUpdated1584722683650,
  meta1584732939683,
  dbOptimizations1584959857727,
];

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly config: ConfigService) {}
  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      ...this.config.getPostgresConfig(),
      entities,
      logging: ["error"],
      migrations,
      migrationsRun: true,
      synchronize: false,
      type: "postgres",
    };
  }
}
