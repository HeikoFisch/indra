import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
} from "typeorm";
import { IsEthAddress, IsKeccak256Hash, IsXpub } from "../util";
import { OutcomeType } from "@connext/types";
import { AppStateBigNumber } from "@connext/apps";
import { BigNumber } from "ethers/utils";

import { Channel } from "../channel/channel.entity";

export enum AppType {
  PROPOSAL = "PROPOSAL",
  INSTANCE = "INSTANCE",
  FREE_BALANCE = "FREE_BALANCE",
  REJECTED = "REJECTED", // removed proposal
  UNINSTALLED = "UNINSTALLED", // removed app
}

@Entity()
export class AppInstance<T extends AppStateBigNumber = any> {
  @PrimaryColumn("text", { unique: true })
  @IsKeccak256Hash()
  identityHash!: string;

  @Column({ type: "enum", enum: AppType })
  type!: AppType;

  @Column("text")
  @IsEthAddress()
  appDefinition!: string;

  @Column("text")
  stateEncoding!: string;

  @Column("text", { nullable: true })
  actionEncoding!: string;

  @Column("integer")
  appSeqNo!: number;

  @Column("json")
  initialState!: T;

  @Column("json")
  latestState!: T;

  @Column("integer")
  latestTimeout!: number;

  @Column("integer")
  latestVersionNumber!: number;

  @Column("text", {
    transformer: {
      from: (value: string): BigNumber => new BigNumber(value),
      to: (value: BigNumber): string => value.toString(),
    },
  })
  initiatorDeposit!: BigNumber | string;

  @Column("text")
  @IsEthAddress()
  initiatorDepositTokenAddress!: string;

  @Column({ type: "enum", enum: OutcomeType })
  outcomeType!: OutcomeType;

  @Column("text")
  @IsXpub()
  proposedByIdentifier!: string;

  @Column("text")
  @IsXpub()
  proposedToIdentifier!: string;

  @Column("text", {
    transformer: {
      from: (value: string): BigNumber => new BigNumber(value),
      to: (value: BigNumber): string => value.toString(),
    },
  })
  responderDeposit!: BigNumber | string;

  @Column("text")
  @IsEthAddress()
  responderDepositTokenAddress!: string;

  @Column("integer")
  timeout!: number;

  // assigned a value on installation not proposal
  @Column("text", { nullable: true })
  @IsEthAddress()
  userParticipantAddress?: string;

  // assigned a value on installation not proposal
  @Column("text", { nullable: true })
  @IsEthAddress()
  nodeParticipantAddress?: string;

  @Column("json", { nullable: true })
  meta?: object;

  // Interpreter-related Fields
  @Column("json", { nullable: true })
  outcomeInterpreterParameters?: any;

  @ManyToOne(
    (type: any) => Channel,
    (channel: Channel) => channel.appInstances,
  )
  channel!: Channel;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
