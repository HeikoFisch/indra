import {
  AppInstanceJson,
  AppInstanceProposal,
  OutcomeType,
  SimpleLinkedTransferApp,
  convertCoinTransfers,
  HashLockTransferApp,
} from "@connext/types";
import { EntityRepository, Repository } from "typeorm";

import { Channel } from "../channel/channel.entity";
import { AppRegistry } from "../appRegistry/appRegistry.entity";

import { AppInstance, AppType } from "./appInstance.entity";
import { bigNumberify } from "ethers/utils";
import { Zero, AddressZero, HashZero } from "ethers/constants";
import { safeJsonParse, sortAddresses, xkeyKthAddress } from "../util";

export const convertAppToInstanceJSON = (app: AppInstance, channel: Channel): AppInstanceJson => {
  if (!app) {
    return undefined;
  }
  // interpreter params
  let multiAssetMultiPartyCoinTransferInterpreterParams = null;
  let singleAssetTwoPartyCoinTransferInterpreterParams = null;
  let twoPartyOutcomeInterpreterParams = null;

  switch (OutcomeType[app.outcomeType]) {
    case OutcomeType.TWO_PARTY_FIXED_OUTCOME:
      twoPartyOutcomeInterpreterParams = safeJsonParse(app.outcomeInterpreterParameters);
      break;

    case OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER:
      multiAssetMultiPartyCoinTransferInterpreterParams = safeJsonParse(
        app.outcomeInterpreterParameters,
      );
      break;

    case OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER:
      singleAssetTwoPartyCoinTransferInterpreterParams = safeJsonParse(
        app.outcomeInterpreterParameters,
      );
      break;

    default:
      throw new Error(`Unrecognized outcome type: ${OutcomeType[app.outcomeType]}`);
  }
  const json: AppInstanceJson = {
    appInterface: {
      stateEncoding: app.stateEncoding,
      actionEncoding: app.actionEncoding || null,
      addr: app.appDefinition,
    },
    appSeqNo: app.appSeqNo,
    defaultTimeout: bigNumberify(app.timeout).toNumber(),
    identityHash: app.identityHash,
    latestState: app.latestState,
    latestTimeout: app.latestTimeout,
    latestVersionNumber: app.latestVersionNumber,
    multisigAddress: channel.multisigAddress,
    outcomeType: app.outcomeType,
    participants: sortAddresses([app.userParticipantAddress, app.nodeParticipantAddress]),
    multiAssetMultiPartyCoinTransferInterpreterParams,
    singleAssetTwoPartyCoinTransferInterpreterParams,
    twoPartyOutcomeInterpreterParams,
  };
  return json;
};

export const convertAppToProposedInstanceJSON = (app: AppInstance): AppInstanceProposal => {
  if (!app) {
    return undefined;
  }
  // interpreter params
  let multiAssetMultiPartyCoinTransferInterpreterParams = undefined;
  let singleAssetTwoPartyCoinTransferInterpreterParams = undefined;
  let twoPartyOutcomeInterpreterParams = undefined;

  switch (OutcomeType[app.outcomeType]) {
    case OutcomeType.TWO_PARTY_FIXED_OUTCOME:
      twoPartyOutcomeInterpreterParams = safeJsonParse(app.outcomeInterpreterParameters);
      break;

    case OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER:
      multiAssetMultiPartyCoinTransferInterpreterParams = safeJsonParse(
        app.outcomeInterpreterParameters,
      );
      break;

    case OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER:
      singleAssetTwoPartyCoinTransferInterpreterParams = safeJsonParse(
        app.outcomeInterpreterParameters,
      );
      break;

    default:
      throw new Error(`Unrecognized outcome type: ${OutcomeType[app.outcomeType]}`);
  }
  return {
    abiEncodings: {
      stateEncoding: app.stateEncoding,
      actionEncoding: app.actionEncoding,
    },
    appDefinition: app.appDefinition,
    appSeqNo: app.appSeqNo,
    identityHash: app.identityHash,
    initialState: app.initialState,
    initiatorDeposit: bigNumberify(app.initiatorDeposit).toHexString(),
    initiatorDepositTokenAddress: app.initiatorDepositTokenAddress,
    outcomeType: app.outcomeType,
    proposedByIdentifier: app.proposedByIdentifier,
    proposedToIdentifier: app.proposedToIdentifier,
    responderDeposit: bigNumberify(app.responderDeposit).toHexString(),
    responderDepositTokenAddress: app.responderDepositTokenAddress,
    timeout: bigNumberify(app.timeout).toHexString(),
    multiAssetMultiPartyCoinTransferInterpreterParams,
    singleAssetTwoPartyCoinTransferInterpreterParams,
    twoPartyOutcomeInterpreterParams,
  };
};

@EntityRepository(AppInstance)
export class AppInstanceRepository extends Repository<AppInstance> {
  findByIdentityHash(identityHash: string): Promise<AppInstance | undefined> {
    return this.findOne(identityHash, {
      relations: ["channel"],
    });
  }

  findByMultisigAddressAndType(multisigAddress: string, type: AppType): Promise<AppInstance[]> {
    return this.createQueryBuilder("app_instances")
      .leftJoinAndSelect(
        "app_instances.channel",
        "channel",
        "channel.multisigAddress = :multisigAddress",
        { multisigAddress },
      )
      .where("app_instance.type = :type", { type })
      .getMany();
    // return this.findOne({
    //   where: {
    //     type,
    //   },
    //   relations: ["channel"],
    // });
  }

  async getAppProposal(appInstanceId: string): Promise<AppInstanceProposal | undefined> {
    const app = await this.findByIdentityHash(appInstanceId);
    if (!app || app.type !== AppType.PROPOSAL) {
      return undefined;
    }
    return convertAppToProposedInstanceJSON(app);
  }

  async saveAppProposal(channel: Channel, appProposal: AppInstanceProposal): Promise<void> {
    let app = await this.findByIdentityHash(appProposal.identityHash);
    if (!app) {
      app = new AppInstance();
    }
    app.type = AppType.PROPOSAL;
    app.identityHash = appProposal.identityHash;
    app.actionEncoding = appProposal.abiEncodings.actionEncoding;
    app.stateEncoding = appProposal.abiEncodings.stateEncoding;
    app.appDefinition = appProposal.appDefinition;
    app.appSeqNo = appProposal.appSeqNo;
    app.initialState = appProposal.initialState;
    app.initiatorDeposit = bigNumberify(appProposal.initiatorDeposit);
    app.initiatorDepositTokenAddress = appProposal.initiatorDepositTokenAddress;
    app.latestState = appProposal.initialState;
    app.latestTimeout = bigNumberify(appProposal.timeout).toNumber();
    app.latestVersionNumber = 0;
    app.responderDeposit = bigNumberify(appProposal.responderDeposit);
    app.responderDepositTokenAddress = appProposal.responderDepositTokenAddress;
    app.timeout = bigNumberify(appProposal.timeout).toNumber();
    app.proposedToIdentifier = appProposal.proposedToIdentifier;
    app.proposedByIdentifier = appProposal.proposedByIdentifier;
    app.outcomeType = appProposal.outcomeType;
    app.meta = appProposal.meta;

    app.channel = channel;

    await this.save(app);
  }

  async removeAppProposal(appInstanceId: string): Promise<AppInstance> {
    const app = await this.findByIdentityHash(appInstanceId);
    if (!app || app.type !== AppType.PROPOSAL) {
      throw new Error(`No app proposal existed for ${appInstanceId}`);
    }
    app.type = AppType.REJECTED;
    return this.save(app);
  }

  async getFreeBalance(multisigAddress: string): Promise<AppInstanceJson | undefined> {
    const [app] = await this.findByMultisigAddressAndType(multisigAddress, AppType.FREE_BALANCE);
    return convertAppToInstanceJSON(app, app.channel);
  }

  async saveFreeBalance(channel: Channel, freeBalance: AppInstanceJson): Promise<AppInstance> {
    let freeBalanceSaved = await this.findByIdentityHash(freeBalance.identityHash);
    if (!freeBalanceSaved) {
      freeBalanceSaved = new AppInstance();
      freeBalanceSaved.identityHash = freeBalance.identityHash;
      freeBalanceSaved.type = AppType.FREE_BALANCE;
      freeBalanceSaved.stateEncoding = freeBalance.appInterface.stateEncoding;
      freeBalanceSaved.actionEncoding = freeBalance.appInterface.actionEncoding;
      freeBalanceSaved.appDefinition = freeBalance.appInterface.addr;
      freeBalanceSaved.appSeqNo = freeBalance.appSeqNo;
      freeBalanceSaved.channel = channel;
      freeBalanceSaved.outcomeType = OutcomeType[freeBalance.outcomeType];
      // new instance, save initial state as latest
      freeBalanceSaved.initialState = freeBalance.latestState;
      // save participants
      const userFreeBalance = xkeyKthAddress(channel.userPublicIdentifier);
      freeBalanceSaved.userParticipantAddress = freeBalance.participants.filter(
        p => p === userFreeBalance,
      )[0];
      freeBalanceSaved.nodeParticipantAddress = freeBalance.participants.filter(
        p => p !== userFreeBalance,
      )[0];
      // TODO: proper way to add these since free balance does not go thorugh
      // propose flow
      freeBalanceSaved.initiatorDeposit = Zero;
      freeBalanceSaved.initiatorDepositTokenAddress = AddressZero;
      freeBalanceSaved.responderDeposit = Zero;
      freeBalanceSaved.responderDepositTokenAddress = AddressZero;
      freeBalanceSaved.proposedToIdentifier = channel.userPublicIdentifier;
      freeBalanceSaved.proposedByIdentifier = channel.nodePublicIdentifier;
    }
    freeBalanceSaved.latestState = freeBalance.latestState;
    freeBalanceSaved.latestTimeout = freeBalance.latestTimeout;
    freeBalanceSaved.latestVersionNumber = freeBalance.latestVersionNumber;
    freeBalanceSaved.timeout = freeBalance.latestTimeout;

    // interpreter params
    if (freeBalanceSaved.outcomeType) {
      return this.save(freeBalanceSaved);
    }
    switch (OutcomeType[freeBalance.outcomeType]) {
      case OutcomeType.TWO_PARTY_FIXED_OUTCOME:
        freeBalanceSaved.outcomeInterpreterParameters =
          freeBalance.twoPartyOutcomeInterpreterParams;
        break;

      case OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER:
        freeBalanceSaved.outcomeInterpreterParameters =
          freeBalance.multiAssetMultiPartyCoinTransferInterpreterParams;
        break;

      case OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER:
        freeBalanceSaved.outcomeInterpreterParameters =
          freeBalance.singleAssetTwoPartyCoinTransferInterpreterParams;
        break;

      default:
        throw new Error(`Unrecognized outcome type: ${OutcomeType[freeBalance.outcomeType]}`);
    }
    return this.save(freeBalanceSaved);
  }

  async getAppInstance(appInstanceId: string): Promise<AppInstanceJson | undefined> {
    const app = await this.findByIdentityHash(appInstanceId);
    if (!app) {
      return undefined;
    }
    return convertAppToInstanceJSON(app, app.channel);
  }

  async saveAppInstance(
    channel: Channel,
    appJson: AppInstanceJson,
    isMigration: boolean = false, // will create new apps
  ): Promise<AppInstance> {
    const {
      identityHash,
      latestState,
      latestTimeout,
      latestVersionNumber,
      multiAssetMultiPartyCoinTransferInterpreterParams,
      participants,
      singleAssetTwoPartyCoinTransferInterpreterParams,
      twoPartyOutcomeInterpreterParams,
    } = appJson;
    let app = await this.findByIdentityHash(identityHash);
    if (!app) {
      if (!isMigration) {
        throw new Error(`Did not find app with identity hash: ${identityHash}`);
      }
      // create app from appJSON
      app = new AppInstance();
      app.identityHash = identityHash;
      app.type = AppType.PROPOSAL; // other fields will be updated
      app.stateEncoding = appJson.appInterface.stateEncoding;
      app.actionEncoding = appJson.appInterface.actionEncoding;
      app.appDefinition = appJson.appInterface.addr;
      app.appSeqNo = appJson.appSeqNo;
      app.channel = channel;
      app.outcomeType = OutcomeType[appJson.outcomeType];
      // new instance, save initial state as latest
      app.initialState = appJson.latestState;
      app.timeout = appJson.defaultTimeout;

      // fill in dummy values, no way to calculate these
      // and app is already installed, so proposal specific
      // fields are no longer needed
      app.initiatorDeposit = Zero;
      app.initiatorDepositTokenAddress = AddressZero;
      app.responderDeposit = Zero;
      app.responderDepositTokenAddress = AddressZero;
      app.proposedToIdentifier = channel.userPublicIdentifier;
      app.proposedByIdentifier = channel.nodePublicIdentifier;
    }
    if (app.type === AppType.INSTANCE && app.latestVersionNumber === latestVersionNumber) {
      // app was not updated, return
      return app;
    }
    // first time app is being upgraded from proposal to instance
    if (app.type !== AppType.INSTANCE) {
      app.type = AppType.INSTANCE;
      // save participants
      let userAddr = xkeyKthAddress(channel.userPublicIdentifier, app.appSeqNo);
      // for migrations, this could be the free balance addr (3/19/2020)
      if (!participants.filter(p => p === userAddr)[0] && !isMigration) {
        userAddr = xkeyKthAddress(channel.userPublicIdentifier);
      }
      app.userParticipantAddress = participants.filter(p => p === userAddr)[0];
      app.nodeParticipantAddress = participants.filter(p => p !== userAddr)[0];
    }

    // TODO: THIS SHOULD PROB BE DONE UPSTREAM
    let latestStateFixed = latestState;
    if (latestState["coinTransfers"]) {
      if (app.outcomeType === OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER) {
        latestStateFixed["coinTransfers"] = convertCoinTransfers(
          "bignumber",
          latestState["coinTransfers"],
        );
      }
    }

    app.latestState = latestStateFixed;
    app.latestTimeout = latestTimeout;
    app.latestVersionNumber = latestVersionNumber;

    // interpreter params
    switch (OutcomeType[app.outcomeType]) {
      case OutcomeType.TWO_PARTY_FIXED_OUTCOME:
        app.outcomeInterpreterParameters = twoPartyOutcomeInterpreterParams;
        break;

      case OutcomeType.MULTI_ASSET_MULTI_PARTY_COIN_TRANSFER:
        app.outcomeInterpreterParameters = multiAssetMultiPartyCoinTransferInterpreterParams;
        break;

      case OutcomeType.SINGLE_ASSET_TWO_PARTY_COIN_TRANSFER:
        app.outcomeInterpreterParameters = singleAssetTwoPartyCoinTransferInterpreterParams;
        break;

      default:
        throw new Error(`Unrecognized outcome type: ${OutcomeType[app.outcomeType]}`);
    }

    // TODO: everything else should already be in from the proposal, verify this
    return this.save(app);
  }

  removeAppInstance(app: AppInstance): Promise<AppInstance> {
    if (app.type !== AppType.INSTANCE) {
      throw new Error(`App is not of correct type`);
    }
    app.type = AppType.UNINSTALLED;
    return this.save(app);
  }

  async findLinkedTransferAppsByPaymentIdAndType(
    paymentId: string,
    type: AppType = AppType.INSTANCE,
  ): Promise<AppInstance[]> {
    const res = await this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: SimpleLinkedTransferApp })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "paymentId": "${paymentId}" }'`)
      .andWhere("app_instance.type = :type", { type })
      .getMany();
    return res;
  }

  async findLinkedTransferAppByPaymentIdAndSender(
    paymentId: string,
    senderFreeBalanceAddress: string,
  ): Promise<AppInstance> {
    const res = await this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: SimpleLinkedTransferApp })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "paymentId": "${paymentId}" }'`)
      .andWhere(
        `app_instance."latestState"::JSONB #> '{"coinTransfers",0,"to"}' = '"${senderFreeBalanceAddress}"'`,
      )
      .getOne();
    return res;
  }

  async findLinkedTransferAppByPaymentIdAndReceiver(
    paymentId: string,
    receiverFreeBalanceAddress: string,
  ): Promise<AppInstance> {
    const res = await this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: SimpleLinkedTransferApp })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "paymentId": "${paymentId}" }'`)
      // receiver is recipient
      .andWhere(
        `app_instance."latestState"::JSONB #> '{"coinTransfers",1,"to"}' = '"${receiverFreeBalanceAddress}"'`,
      )
      .getOne();
    return res;
  }

  async findRedeemedLinkedTransferAppByPaymentIdFromNode(
    paymentId: string,
    nodeFreeBalanceAddress: string,
  ): Promise<AppInstance> {
    const res = await this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: SimpleLinkedTransferApp })
      // if uninstalled, redeemed
      .andWhere("app_instance.type = :type", { type: AppType.UNINSTALLED })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "paymentId": "${paymentId}" }'`)
      // node is sender
      .andWhere(
        `app_instance."latestState"::JSONB #> '{"coinTransfers",0,"to"}' = '"${nodeFreeBalanceAddress}"'`,
      )
      .getOne();
    return res;
  }

  async findActiveLinkedTransferAppsToRecipient(
    recipient: string,
    nodeFreeBalanceAddress: string,
  ): Promise<AppInstance[]> {
    const res = await this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: SimpleLinkedTransferApp })
      .andWhere("app_instance.type = :type", { type: AppType.INSTANCE })
      // node is receiver of transfer
      .andWhere(
        `app_instance."latestState"::JSONB #> '{"coinTransfers",1,"to"}' = '"${nodeFreeBalanceAddress}"'`,
      )
      // meta for transfer recipient
      .andWhere(`app_instance."meta"::JSONB @> '{"recipient":"${recipient}"}'`)
      // preImage is HashZero
      .andWhere(`app_instance."latestState"::JSONB @> '{"preImage": "${HashZero}"}'`)
      .getMany();
    return res;
  }

  async findActiveLinkedTransferAppsFromSenderToNode(
    senderFreeBalanceAddress: string,
    nodeFreeBalanceAddress: string,
  ): Promise<AppInstance[]> {
    const res = await this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: SimpleLinkedTransferApp })
      .andWhere("app_instance.type = :type", { type: AppType.INSTANCE })
      // sender is sender of transfer
      .andWhere(
        `app_instance."latestState"::JSONB #> '{"coinTransfers",0,"to"}' = '"${senderFreeBalanceAddress}"'`,
      )
      // node is receiver of transfer
      .andWhere(
        `app_instance."latestState"::JSONB #> '{"coinTransfers",1,"to"}' = '"${nodeFreeBalanceAddress}"'`,
      )
      // preimage can be HashZero or empty, if its HashZero, then the
      // node should takeAction + uninstall. if its not HashZero, then
      // the node should just uninstall. If the node has completed the
      // transfer, then the type would be AppType.UNINSTALLED
      .getMany();
    return res;
  }

  async findLinkedTransferAppsByPaymentId(paymentId: string): Promise<AppInstance[]> {
    const res = await this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: SimpleLinkedTransferApp })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "paymentId": "${paymentId}" }'`)
      .printSql()
      .getMany();
    return res;
  }

  /////////////////////////////////////////////
  ///////// HASHLOCK QUERIES
  findHashLockTransferAppsByLockHash(lockHash: string): Promise<AppInstance[]> {
    return this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: HashLockTransferApp })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "lockHash": "${lockHash}" }'`)
      .getMany();
  }

  findRedeemedHashLockTransferAppByLockHashFromNode(
    lockHash: string,
    nodeFreeBalanceAddress: string,
  ): Promise<AppInstance> {
    return (
      this.createQueryBuilder("app_instance")
        .leftJoinAndSelect(
          AppRegistry,
          "app_registry",
          "app_registry.appDefinitionAddress = app_instance.appDefinition",
        )
        .leftJoinAndSelect("app_instance.channel", "channel")
        .where("app_registry.name = :name", { name: HashLockTransferApp })
        // if uninstalled, redeemed
        .andWhere("app_instance.type = :type", { type: AppType.UNINSTALLED })
        .andWhere(`app_instance."latestState"::JSONB @> '{ "lockHash": "${lockHash}" }'`)
        // node is sender
        .andWhere(
          `app_instance."latestState"::JSONB #> '{"coinTransfers",0,"to"}' = '"${nodeFreeBalanceAddress}"'`,
        )
        .getOne()
    );
  }

  findHashLockTransferAppsByLockHashAndRecipient(
    lockHash: string,
    recipient: string,
  ): Promise<AppInstance | undefined> {
    return (
      this.createQueryBuilder("app_instance")
        .leftJoinAndSelect(
          AppRegistry,
          "app_registry",
          "app_registry.appDefinitionAddress = app_instance.appDefinition",
        )
        .leftJoinAndSelect("app_instance.channel", "channel")
        .where("app_registry.name = :name", { name: HashLockTransferApp })
        // meta for transfer recipient
        .andWhere(`app_instance."meta"::JSONB @> '{"recipient":"${recipient}"}'`)
        .andWhere(`app_instance."latestState"::JSONB @> '{"lockHash": "${lockHash}"}'`)
        .getOne()
    );
  }

  findHashLockTransferAppsByLockHashAndSender(
    lockHash: string,
    sender: string,
  ): Promise<AppInstance | undefined> {
    return this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: HashLockTransferApp })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "lockHash": "${lockHash}" }'`)
      .andWhere(`app_instance."latestState"::JSONB #> '{"coinTransfers",0,"to"}' = '"${sender}"'`)
      .getOne();
  }

  findHashLockTransferAppsByLockHashAndReceiver(
    lockHash: string,
    receiver: string,
  ): Promise<AppInstance | undefined> {
    return this.createQueryBuilder("app_instance")
      .leftJoinAndSelect(
        AppRegistry,
        "app_registry",
        "app_registry.appDefinitionAddress = app_instance.appDefinition",
      )
      .leftJoinAndSelect("app_instance.channel", "channel")
      .where("app_registry.name = :name", { name: HashLockTransferApp })
      .andWhere(`app_instance."latestState"::JSONB @> '{ "lockHash": "${lockHash}" }'`)
      .andWhere(`app_instance."latestState"::JSONB #> '{"coinTransfers",1,"to"}' = '"${receiver}"'`)
      .getOne();
  }

  findActiveHashLockTransferAppsToRecipient(
    recipient: string,
    nodeFreeBalanceAddress: string,
    currentBlock: number,
  ): Promise<AppInstance[]> {
    return (
      this.createQueryBuilder("app_instance")
        .leftJoinAndSelect(
          AppRegistry,
          "app_registry",
          "app_registry.appDefinitionAddress = app_instance.appDefinition",
        )
        .leftJoinAndSelect("app_instance.channel", "channel")
        .where("app_registry.name = :name", { name: HashLockTransferApp })
        .andWhere("app_instance.type = :type", { type: AppType.INSTANCE })
        // node is receiver of transfer
        .andWhere(
          `app_instance."latestState"::JSONB #> '{"coinTransfers",1,"to"}' = '"${nodeFreeBalanceAddress}"'`,
        )
        // meta for transfer recipient
        .andWhere(`app_instance."meta"::JSONB @> '{"recipient":"${recipient}"}'`)
        // preimage can be HashZero or empty, if its HashZero, then the
        // node should takeAction + uninstall. if its not HashZero, then
        // the node should just uninstall. If the node has completed the
        // transfer, then the type would be AppType.UNINSTALLED
        .andWhere(`app_instance."latestState"::JSONB @> '{"lockHash": "${HashZero}"}'`)
        // and timeout hasnt passed
        .andWhere(`app_instance."latestState"->>"timeout"::NUMERIC > ${currentBlock}`)
        .getMany()
    );
  }

  findActiveHashLockTransferAppsFromSenderToNode(
    sender: string, // free balance addr
    nodeFreeBalanceAddress: string,
    currentBlock: number,
  ): Promise<AppInstance[]> {
    return (
      this.createQueryBuilder("app_instance")
        .leftJoinAndSelect(
          AppRegistry,
          "app_registry",
          "app_registry.appDefinitionAddress = app_instance.appDefinition",
        )
        .leftJoinAndSelect("app_instance.channel", "channel")
        .where("app_registry.name = :name", { name: HashLockTransferApp })
        .andWhere("app_instance.type = :type", { type: AppType.INSTANCE })
        // sender is sender of transfer
        .andWhere(`app_instance."latestState"::JSONB #> '{"coinTransfers",0,"to"}' = '"${sender}"'`)
        // node is receiver of transfer
        .andWhere(
          `app_instance."latestState"::JSONB #> '{"coinTransfers",1,"to"}' = '"${nodeFreeBalanceAddress}"'`,
        )
        // and timeout hasnt passed
        .andWhere(`app_instance."latestState"->>"timeout"::NUMERIC > ${currentBlock}`)
        // preimage can be HashZero or empty, if its HashZero, then the
        // node should takeAction + uninstall. if its not HashZero, then
        // the node should just uninstall. If the node has completed the
        // transfer, then the type would be AppType.UNINSTALLED
        .getMany()
    );
  }
}
