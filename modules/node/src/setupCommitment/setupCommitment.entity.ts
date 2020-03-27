import { Entity, Column, OneToOne, JoinColumn, PrimaryColumn } from "typeorm";
import { BigNumber } from "ethers/utils";

import { Channel } from "../channel/channel.entity";
import { IsBytes32, IsEthAddress } from "../util";

@Entity()
export class SetupCommitment {
  @PrimaryColumn("text")
  @IsEthAddress()
  multisigAddress!: string;

  @Column("text", {
    transformer: {
      from: (value: string): BigNumber => new BigNumber(value),
      to: (value: BigNumber): string => value.toString(),
    },
  })
  value!: BigNumber;

  @Column("text")
  @IsEthAddress()
  to: string;

  @Column("text")
  @IsBytes32()
  data!: string;

  @OneToOne(
    (type: any) => Channel,
    (channel: Channel) => channel.setupCommitment,
  )
  @JoinColumn()
  channel!: Channel;
}
