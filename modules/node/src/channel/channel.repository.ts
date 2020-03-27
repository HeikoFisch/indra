import {
  StateChannelJSON,
  AppInstanceProposal,
  AppInstanceJson,
  OutcomeType,
  convertCoinTransfers,
} from "@connext/types";
import { NotFoundException } from "@nestjs/common";
import { AddressZero } from "ethers/constants";
import { EntityManager, EntityRepository, Repository } from "typeorm";
import { xkeyKthAddress } from "@connext/cf-core";
import { bigNumberify } from "ethers/utils";

import {
  convertAppToInstanceJSON,
  convertAppToProposedInstanceJSON,
} from "../appInstance/appInstance.repository";
import { LoggerService } from "../logger/logger.service";
import { RebalanceProfile } from "../rebalanceProfile/rebalanceProfile.entity";
import { AppType, AppInstance } from "../appInstance/appInstance.entity";
import { FreeBalanceAppInstance } from "../freeBalanceAppInstance/freeBalanceAppInstance.entity";

import { Channel } from "./channel.entity";

const log = new LoggerService("ChannelRepository");

export const convertChannelToJSON = (channel: Channel): StateChannelJSON => {
  const json: StateChannelJSON = {
    addresses: channel.addresses,
    appInstances: channel.appInstances
      .filter(app => app.type === AppType.INSTANCE)
      .map(app => [app.identityHash, convertAppToInstanceJSON(app, channel)]),
    freeBalanceAppInstance: convertAppToInstanceJSON(
      channel.appInstances.find(app => app.type === AppType.FREE_BALANCE),
      channel,
    ),
    monotonicNumProposedApps: channel.monotonicNumProposedApps,
    multisigAddress: channel.multisigAddress,
    proposedAppInstances: channel.appInstances
      .filter(app => app.type === AppType.PROPOSAL)
      .map(app => [app.identityHash, convertAppToProposedInstanceJSON(app)]),
    schemaVersion: channel.schemaVersion,
    userNeuteredExtendedKeys: [channel.nodePublicIdentifier, channel.userPublicIdentifier],
  };
  return json;
};

@EntityRepository(Channel)
export class ChannelRepository extends Repository<Channel> {
  // CF-CORE STORE METHODS
  async getStateChannel(multisigAddress: string): Promise<StateChannelJSON | undefined> {
    const channel = await this.findByMultisigAddress(multisigAddress);
    console.log("channel: ", channel);
    if (!channel) {
      return undefined;
    }
    return convertChannelToJSON(channel);
  }

  async getStateChannelByOwners(owners: string[]): Promise<StateChannelJSON | undefined> {
    const [channel] = (
      await Promise.all(owners.map(owner => this.findByUserPublicIdentifier(owner)))
    ).filter(chan => !!chan);
    if (!channel) {
      return undefined;
    }
    return convertChannelToJSON(channel);
  }

  async getStateChannelByAppInstanceId(
    appInstanceId: string,
  ): Promise<StateChannelJSON | undefined> {
    const channel = await this.findByAppInstanceId(appInstanceId);
    if (!channel) {
      return undefined;
    }
    return convertChannelToJSON(channel);
  }

  async createStateChannel(
    stateChannel: StateChannelJSON,
    schemaVersion: number,
    nodePublicIdentifier: string,
  ): Promise<void> {
    const { multisigAddress, addresses, freeBalanceAppInstance } = stateChannel;
    const userPublicIdentifier = stateChannel.userNeuteredExtendedKeys.find(
      xpub => xpub === nodePublicIdentifier,
    );
    const channel = await this.createQueryBuilder()
      .insert()
      .into(Channel)
      .values({
        multisigAddress,
        schemaVersion,
        nodePublicIdentifier,
        userPublicIdentifier,
        addresses,
        monotonicNumProposedApps: 0,
      })
      .execute();
    console.log('channel: ', channel);
   const freeBalance = await this.createQueryBuilder()
      .insert()
      .into(FreeBalanceAppInstance)
      .values({
        appDefinition: freeBalanceAppInstance.appInterface.addr,
        appSeqNo: freeBalanceAppInstance.appSeqNo,
        identityHash: freeBalanceAppInstance.identityHash,
        initialState: freeBalanceAppInstance.latestState as any,
        latestState: freeBalanceAppInstance.latestState as any,
        latestTimeout: freeBalanceAppInstance.latestTimeout,
        latestVersionNumber: freeBalanceAppInstance.latestVersionNumber,
        outcomeInterpreterParameters:
          freeBalanceAppInstance.multiAssetMultiPartyCoinTransferInterpreterParams,
        stateEncoding: freeBalanceAppInstance.appInterface.stateEncoding,
      })
      .execute();
    console.log('freeBalance: ', freeBalance);
    const setup = await this.createQueryBuilder()
      .relation(Channel, "setupCommitment")
      .of(multisigAddress)
      .set(multisigAddress);
    console.log('setup: ', setup);
    const freeBalChan = await this.createQueryBuilder()
      .relation(Channel, "freeBalanceAppInstance")
      .of(multisigAddress)
      .set(stateChannel.freeBalanceAppInstance.identityHash);
    console.log('freeBalChan: ', freeBalChan);

    const allChannels = await this.findAll();
    console.log('allChannels: ', allChannels);
  }

  async saveAppProposal(
    multisigAddress: string,
    appProposal: AppInstanceProposal,
    monotonicNumProposedApps: number,
  ): Promise<void> {
    const {
      identityHash,
      abiEncodings: { actionEncoding, stateEncoding },
      appDefinition,
      appSeqNo,
      initialState,
      initiatorDeposit,
      initiatorDepositTokenAddress,
      responderDeposit,
      responderDepositTokenAddress,
      timeout,
      proposedToIdentifier,
      proposedByIdentifier,
      outcomeType,
    } = appProposal;

    await this.createQueryBuilder()
      .update(Channel)
      .set({ monotonicNumProposedApps })
      .execute();

    await this.createQueryBuilder()
      .insert()
      .into(AppInstance)
      .values({
        identityHash,
        type: AppType.PROPOSAL,
        actionEncoding,
        stateEncoding,
        initialState: initialState as any,
        initiatorDeposit,
        initiatorDepositTokenAddress,
        appDefinition,
        appSeqNo,
        latestState: initialState as any,
        latestTimeout: parseInt(timeout),
        latestVersionNumber: 0,
        responderDeposit,
        responderDepositTokenAddress,
        timeout: parseInt(timeout),
        proposedToIdentifier,
        proposedByIdentifier,
        outcomeType,
      })
      .execute();

    await this.createQueryBuilder()
      .relation(Channel, "appInstances")
      .of(multisigAddress)
      .add(identityHash);
  }

  async createAppInstance(
    multisigAddress: string,
    appJson: AppInstanceJson,
    freeBalanceAppInstance: AppInstanceJson,
  ) {
    const {
      identityHash,
      latestState,
      latestTimeout,
      latestVersionNumber,
      multiAssetMultiPartyCoinTransferInterpreterParams,
      participants,
      singleAssetTwoPartyCoinTransferInterpreterParams,
      twoPartyOutcomeInterpreterParams,
      appSeqNo,
      outcomeType,
    } = appJson;

    // TODO: better way to do this?
    const channel = await this.findByMultisigAddressOrThrow(multisigAddress);
    // channel.freeBalanceAppInstance.latestState = freeBalanceAppInstance.latestState;
    // channel.freeBalanceAppInstance.latestTimeout = freeBalanceAppInstance.latestTimeout;
    // channel.freeBalanceAppInstance.latestVersionNumber = freeBalanceAppInstance.latestVersionNumber;
    // // TODO: THIS SHOULD PROB BE DONE UPSTREAM
    let latestStateFixed = latestState;
    if (latestState["coinTransfers"]) {
      if (outcomeType === OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER) {
        latestStateFixed["coinTransfers"] = convertCoinTransfers(
          "bignumber",
          latestState["coinTransfers"],
        );
      }
    }

    let userAddr = xkeyKthAddress(channel.userPublicIdentifier, appSeqNo);
    const userParticipantAddress = participants.filter(p => p === userAddr)[0];
    const nodeParticipantAddress = participants.filter(p => p !== userAddr)[0];

    let outcomeInterpreterParameters;
    switch (outcomeType) {
      case OutcomeType.TWO_PARTY_FIXED_OUTCOME:
        outcomeInterpreterParameters = twoPartyOutcomeInterpreterParams;
        break;

      case OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER:
        outcomeInterpreterParameters = multiAssetMultiPartyCoinTransferInterpreterParams;
        break;

      case OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER:
        outcomeInterpreterParameters = singleAssetTwoPartyCoinTransferInterpreterParams;
        break;

      default:
        throw new Error(`Unrecognized outcome type: ${OutcomeType[outcomeType]}`);
    }

    await this.createQueryBuilder()
      .update(FreeBalanceAppInstance)
      .set({
        latestState: freeBalanceAppInstance.latestState as any,
        latestTimeout: freeBalanceAppInstance.latestTimeout,
        latestVersionNumber: freeBalanceAppInstance.latestVersionNumber,
      })
      .where("identityHash = :identityHash", { identityHash: freeBalanceAppInstance.identityHash })
      .update(AppInstance)
      .set({
        type: AppType.INSTANCE,
        userParticipantAddress,
        nodeParticipantAddress,
        latestState: latestStateFixed as any,
        latestTimeout,
        latestVersionNumber,
        outcomeInterpreterParameters,
      })
      .where("identityHash = :identityHash", { identityHash })
      .execute();
  }

  // OTHER METHODS

  async findAll(available: boolean = true): Promise<Channel[]> {
    return this.find({ where: { available } });
  }

  async findByMultisigAddress(multisigAddress: string): Promise<Channel | undefined> {
    return this.findOne(multisigAddress, {
      relations: ["freeBalanceAppInstance"],
    });
  }

  async findByUserPublicIdentifier(userPublicIdentifier: string): Promise<Channel | undefined> {
    return this.findOne({
      where: { userPublicIdentifier },
      relations: ["freeBalanceAppInstance"],
    });
  }

  async findByAppInstanceId(appInstanceId: string): Promise<Channel | undefined> {
    // TODO: fix this query
    // when you return just `channel` you will only have one app instance
    // that matches the appId
    const channel = await this.createQueryBuilder("channel")
      .leftJoin("channel.appInstances", "appInstance")
      .where("appInstance.identityHash = :appInstanceId", { appInstanceId })
      .getOne();
    return this.findOne(channel.multisigAddress, {
      relations: ["freeBalanceAppInstance"],
    });
  }

  async findByMultisigAddressOrThrow(multisigAddress: string): Promise<Channel> {
    const channel = await this.findByMultisigAddress(multisigAddress);
    if (!channel) {
      throw new Error(`Channel does not exist for multisig ${multisigAddress}`);
    }
    return channel;
  }

  async findByUserPublicIdentifierOrThrow(userPublicIdentifier: string): Promise<Channel> {
    const channel = await this.findByUserPublicIdentifier(userPublicIdentifier);
    if (!channel) {
      throw new Error(`Channel does not exist for userPublicIdentifier ${userPublicIdentifier}`);
    }

    return channel;
  }

  async addRebalanceProfileToChannel(
    userPublicIdentifier: string,
    rebalanceProfile: RebalanceProfile,
  ): Promise<RebalanceProfile> {
    const channel = await this.createQueryBuilder("channel")
      .leftJoinAndSelect("channel.rebalanceProfiles", "rebalanceProfiles")
      .where("channel.userPublicIdentifier = :userPublicIdentifier", { userPublicIdentifier })
      .getOne();

    if (!channel) {
      throw new NotFoundException(
        `Channel does not exist for userPublicIdentifier ${userPublicIdentifier}`,
      );
    }

    const existing = channel.rebalanceProfiles.find(
      (prof: RebalanceProfile) => prof.assetId === rebalanceProfile.assetId,
    );

    await this.manager.transaction(async (transactionalEntityManager: EntityManager) => {
      await transactionalEntityManager.save(rebalanceProfile);

      if (existing) {
        log.debug(`Found existing profile for token ${rebalanceProfile.assetId}, replacing`);
        await transactionalEntityManager
          .createQueryBuilder()
          .relation(Channel, "rebalanceProfiles")
          .of(channel)
          .remove(existing);
      }

      return await transactionalEntityManager
        .createQueryBuilder()
        .relation(Channel, "rebalanceProfiles")
        .of(channel)
        .add(rebalanceProfile);
    });
    return rebalanceProfile;
  }

  async getRebalanceProfileForChannelAndAsset(
    userPublicIdentifier: string,
    assetId: string = AddressZero,
  ): Promise<RebalanceProfile | undefined> {
    const channel = await this.createQueryBuilder("channel")
      .leftJoinAndSelect("channel.rebalanceProfiles", "rebalanceProfiles")
      .where("channel.userPublicIdentifier = :userPublicIdentifier", { userPublicIdentifier })
      .getOne();

    if (!channel) {
      throw new NotFoundException(
        `Channel does not exist for userPublicIdentifier ${userPublicIdentifier}`,
      );
    }

    const profile = channel.rebalanceProfiles.find(
      (prof: RebalanceProfile) => prof.assetId.toLowerCase() === assetId.toLowerCase(),
    );

    return profile;
  }

  async setInflightCollateralization(
    channel: Channel,
    collateralizationInFlight: boolean,
  ): Promise<Channel> {
    channel.collateralizationInFlight = collateralizationInFlight;
    return await this.save(channel);
  }
}
