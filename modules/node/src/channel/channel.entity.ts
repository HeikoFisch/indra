import { CriticalStateChannelAddresses } from "@connext/types";
import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
} from "typeorm";

import { AppInstance } from "../appInstance/appInstance.entity";
import { OnchainTransaction } from "../onchainTransactions/onchainTransaction.entity";
import { RebalanceProfile } from "../rebalanceProfile/rebalanceProfile.entity";
import { IsEthAddress, IsXpub } from "../util";
import { WithdrawCommitment } from "../withdrawCommitment/withdrawCommitment.entity";
import { SetupCommitment } from "../setupCommitment/setupCommitment.entity";
import { FreeBalanceAppInstance } from "../freeBalanceAppInstance/freeBalanceAppInstance.entity";

@Entity()
export class Channel {
  @PrimaryColumn("text", { unique: true })
  @IsEthAddress()
  multisigAddress!: string;

  @Column("integer", { default: 0 })
  schemaVersion!: number;

  @Column("json", { nullable: true })
  addresses!: CriticalStateChannelAddresses;

  @Column("text")
  @IsXpub()
  userPublicIdentifier!: string;

  // might not need this
  @Column("text")
  @IsXpub()
  nodePublicIdentifier!: string;

  @Column("boolean", { default: false })
  available!: boolean;

  @Column("boolean", { default: false })
  collateralizationInFlight!: boolean;

  @OneToMany(
    (type: any) => AppInstance,
    (appInstance: AppInstance) => appInstance.channel,
    { cascade: true },
  )
  appInstances!: AppInstance[];

  @Column("integer", { nullable: true })
  monotonicNumProposedApps!: number;

  @OneToOne(
    (type: any) => FreeBalanceAppInstance,
    (fb: FreeBalanceAppInstance) => fb.channel,
    { cascade: true },
  )
  freeBalanceAppInstance!: FreeBalanceAppInstance;

  @OneToMany(
    (type: any) => WithdrawCommitment,
    (withdrawalCommitment: WithdrawCommitment) => withdrawalCommitment.channel,
    { cascade: true },
  )
  withdrawalCommitments!: WithdrawCommitment[];

  @OneToOne(
    (type: any) => SetupCommitment,
    (commitment: SetupCommitment) => commitment.channel,
    { cascade: true },
  )
  setupCommitment!: SetupCommitment;

  @ManyToMany(
    (type: any) => RebalanceProfile,
    (profile: RebalanceProfile) => profile.channels,
    { cascade: true },
  )
  @JoinTable()
  rebalanceProfiles!: RebalanceProfile[];

  @OneToMany(
    (type: any) => OnchainTransaction,
    (tx: OnchainTransaction) => tx.channel,
  )
  transactions!: OnchainTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
