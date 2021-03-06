import { CommitmentTypes, PersistAppType, ProtocolNames, ProtocolParams, ILoggerService } from "@connext/types";
import { JsonRpcProvider } from "ethers/providers";

import { UNASSIGNED_SEQ_NO } from "../constants";
import { getSetStateCommitment } from "../ethereum";
import { StateChannel, AppInstance } from "../models";
import { Store } from "../store";
import {
  Context,
  Opcode,
  ProtocolExecutionFlow,
  ProtocolMessage,
} from "../types";
import { logTime } from "../utils";
import { xkeyKthAddress } from "../xkeys";

import { assertIsValidSignature, computeTokenIndexedFreeBalanceIncrements } from "./utils";

const protocol = ProtocolNames.uninstall;
const { OP_SIGN, IO_SEND, IO_SEND_AND_WAIT, PERSIST_APP_INSTANCE, PERSIST_COMMITMENT } = Opcode;
const { SetState } = CommitmentTypes;

/**
 * @description This exchange is described at the following URL:
 *
 * specs.counterfactual.com/06-uninstall-protocol#messages
 */
export const UNINSTALL_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Initiating */: async function*(context: Context) {
    const { message, store, network } = context;
    const log = context.log.newContext("CF-UninstallProtocol");
    const start = Date.now();
    log.debug(`Initiation started for uninstall`);

    const { params, processID } = message;
    const { responderXpub, appIdentityHash, multisigAddress } = params as ProtocolParams.Uninstall;

    // 6ms
    const preProtocolStateChannel = await store.getStateChannel(multisigAddress);

    // 1ms
    const appToUninstall = preProtocolStateChannel.getAppInstance(appIdentityHash);

    // 47ms
    const postProtocolStateChannel = await computeStateTransition(
      params as ProtocolParams.Uninstall,
      network.provider,
      preProtocolStateChannel,
      appToUninstall,
      log,
    );

    // 0ms
    const responderEphemeralKey = xkeyKthAddress(responderXpub, appToUninstall.appSeqNo);

    const uninstallCommitment = getSetStateCommitment(
      context,
      postProtocolStateChannel.freeBalance,
    );
    const uninstallCommitmentHash = uninstallCommitment.hashToSign();

    let checkpoint = Date.now(); 
    // 4ms
    const signature = yield [OP_SIGN, uninstallCommitmentHash, appToUninstall.appSeqNo];
    logTime(log, checkpoint, `Signed uninstall commitment initiator`)

    // 94ms
    const {
      customData: { signature: responderSignature },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        protocol,
        processID,
        params,
        toXpub: responderXpub,
        customData: { signature },
        seq: 1,
      } as ProtocolMessage,
    ];
  
    checkpoint = Date.now(); 
    // 6ms
    await assertIsValidSignature(responderEphemeralKey, uninstallCommitmentHash, responderSignature);
    logTime(log, checkpoint, `Asserted valid signature in initiating uninstall`)

    uninstallCommitment.signatures = [signature, responderSignature];

    // 5ms
    yield [PERSIST_COMMITMENT, SetState, uninstallCommitment, appIdentityHash];

    // 24ms
    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.Uninstall,
      postProtocolStateChannel,
      appToUninstall,
    ];

    // 204ms
    logTime(log, start, `Finished Initiating uninstall`);
  },

  1 /* Responding */: async function*(context: Context) {
    const { message, store, network } = context;
    const log = context.log.newContext("CF-UninstallProtocol");
    const start = Date.now();
    log.debug(`Response started for uninstall`);

    const { params, processID } = message;
    const { initiatorXpub, appIdentityHash, multisigAddress } = params as ProtocolParams.Uninstall;

    // 9ms
    const preProtocolStateChannel = (await store.getStateChannel(multisigAddress)) as StateChannel;

    // 0ms
    const appToUninstall = preProtocolStateChannel.getAppInstance(appIdentityHash);

    // 40ms
    const postProtocolStateChannel = await computeStateTransition(
      params as ProtocolParams.Uninstall,
      network.provider,
      preProtocolStateChannel,
      appToUninstall,
      log,
    );

    // 0ms
    const initiatorEphemeralKey = xkeyKthAddress(initiatorXpub, appToUninstall.appSeqNo);

    const uninstallCommitment = getSetStateCommitment(
      context,
      postProtocolStateChannel.freeBalance,
    );

    const initiatorSignature = context.message.customData.signature;
    const uninstallCommitmentHash = uninstallCommitment.hashToSign();

    let checkpoint = Date.now();
    // 15ms
    await assertIsValidSignature(initiatorEphemeralKey, uninstallCommitmentHash, initiatorSignature);
    logTime(log, checkpoint, `Asserted valid signature in responding uninstall`)
    checkpoint = Date.now();

    // 10ms
    const responderSignature = yield [OP_SIGN, uninstallCommitmentHash, appToUninstall.appSeqNo];
    logTime(log, checkpoint, `Signed commitment in responding uninstall`)

    uninstallCommitment.signatures = [responderSignature, initiatorSignature];

    // 13ms
    yield [PERSIST_COMMITMENT, SetState, uninstallCommitment, appIdentityHash];

    // 59ms
    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.Uninstall,
      postProtocolStateChannel,
      appToUninstall,
    ];

    // 0ms
    yield [
      IO_SEND,
      {
        protocol,
        processID,
        toXpub: initiatorXpub,
        seq: UNASSIGNED_SEQ_NO,
        customData: {
          signature: responderSignature,
        },
      } as ProtocolMessage,
    ];

    // 100ms
    logTime(log, start, `Finished responding to uninstall`);
  },
};

async function computeStateTransition(
  params: ProtocolParams.Uninstall,
  provider: JsonRpcProvider,
  stateChannel: StateChannel,
  appInstance: AppInstance,
  log?: ILoggerService,
) {
  const { blockNumberToUseIfNecessary } = params;
  return stateChannel.uninstallApp(
    appInstance,
    await computeTokenIndexedFreeBalanceIncrements(
      appInstance,
      provider,
      undefined,
      blockNumberToUseIfNecessary,
      log
    ),
  );
}
