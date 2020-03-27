import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  OneToOne,
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
export class FreeBalanceAppInstance {
  @PrimaryColumn("text", { unique: true })
  @IsKeccak256Hash()
  identityHash!: string;

  @Column("text")
  @IsEthAddress()
  appDefinition!: string;

  @Column("text")
  stateEncoding!: string;

  @Column("integer")
  appSeqNo!: number;

  @Column("json")
  initialState!: any;

  @Column("json")
  latestState!: any;

  @Column("integer")
  latestTimeout!: number;

  @Column("integer")
  latestVersionNumber!: number;

  // TODO
  @Column("json")
  outcomeInterpreterParameters: any;

  @OneToOne(
    (type: any) => Channel,
    (channel: Channel) => channel.freeBalanceAppInstance,
  )
  channel!: Channel;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
