import { CommitmentTypes, ProtocolNames, ProtocolParams } from "@connext/types";

import { UNASSIGNED_SEQ_NO } from "../constants";
import { getSetStateCommitment } from "../ethereum";
import {
  Context,
  Opcode,
  PersistAppType,
  ProtocolExecutionFlow,
  ProtocolMessage,
} from "../types";

import { logTime } from "../utils";
import { xkeyKthAddress } from "../xkeys";

import { assertIsValidSignature } from "./utils";

const protocol = ProtocolNames.update;
const { OP_SIGN, IO_SEND, IO_SEND_AND_WAIT, PERSIST_APP_INSTANCE, PERSIST_COMMITMENT } = Opcode;
const { SetState } = CommitmentTypes;

/**
 * @description This exchange is described at the following URL:
 *
 * specs.counterfactual.com/07-update-protocol#messages
 *
 */
export const UPDATE_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Intiating */: async function*(context: Context) {
    const { store, message } = context;
    const log = context.log.newContext("CF-UpdateProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Initiation started`);

    const { processID, params } = message;

    const {
      appIdentityHash,
      multisigAddress,
      responderXpub,
      newState,
    } = params as ProtocolParams.Update;

    const preProtocolStateChannel = await store.getStateChannel(multisigAddress);
    const preAppIstance = preProtocolStateChannel.getAppInstance(appIdentityHash)

    console.log(`[update] initiating update of: ${appIdentityHash}`);
    const postProtocolStateChannel = preProtocolStateChannel.setState(preAppIstance, newState);

    const appInstance = postProtocolStateChannel.getAppInstance(appIdentityHash);

    const responderEphemeralKey = xkeyKthAddress(responderXpub, appInstance.appSeqNo);

    const setStateCommitment = getSetStateCommitment(
      context,
      appInstance,
    );
    const setStateCommitmentHash = setStateCommitment.hashToSign();

    const initiatorSignature = yield [OP_SIGN, setStateCommitmentHash, appInstance.appSeqNo];

    substart = Date.now();
    const {
      customData: { signature: responderSignature },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        protocol,
        processID,
        params,
        seq: 1,
        toXpub: responderXpub,
        customData: {
          signature: initiatorSignature,
        },
      } as ProtocolMessage,
    ];
    logTime(log, substart, `Received responder's sig`);

    substart = Date.now();
    await assertIsValidSignature(responderEphemeralKey, setStateCommitmentHash, responderSignature);
    logTime(log, substart, `Verified responder's sig`);

    setStateCommitment.signatures = [initiatorSignature, responderSignature];

    yield [PERSIST_COMMITMENT, SetState, setStateCommitment, appIdentityHash];

    yield [PERSIST_APP_INSTANCE, PersistAppType.Instance, postProtocolStateChannel, appInstance];
    logTime(log, start, `Finished Initiating`);
  },

  1 /* Responding */: async function*(context: Context) {
    const { store, message } = context;
    const log = context.log.newContext("CF-UpdateProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Response started`);

    const {
      processID,
      params,
      customData: { signature: initiatorSignature },
    } = message;

    const {
      appIdentityHash,
      multisigAddress,
      initiatorXpub,
      newState,
    } = params as ProtocolParams.Update;

    const preProtocolStateChannel = await store.getStateChannel(multisigAddress);
    const preAppIstance = preProtocolStateChannel.getAppInstance(appIdentityHash)

    console.log(`[update] responding to update of: ${appIdentityHash}`);
    const postProtocolStateChannel = preProtocolStateChannel.setState(preAppIstance, newState);

    const appInstance = postProtocolStateChannel.getAppInstance(appIdentityHash);

    const initiatorEphemeralKey = xkeyKthAddress(initiatorXpub, appInstance.appSeqNo);

    const setStateCommitment = getSetStateCommitment(
      context,
      appInstance,
    );
    const setStateCommitmentHash = setStateCommitment.hashToSign();

    substart = Date.now();
    await assertIsValidSignature(initiatorEphemeralKey, setStateCommitmentHash, initiatorSignature);
    logTime(log, substart, `Verified initator's sig`);

    const responderSignature = yield [OP_SIGN, setStateCommitmentHash, appInstance.appSeqNo];

    setStateCommitment.signatures = [initiatorSignature, responderSignature];

    yield [PERSIST_COMMITMENT, SetState, setStateCommitment, appIdentityHash];

    yield [PERSIST_APP_INSTANCE, PersistAppType.Instance, postProtocolStateChannel, appInstance];

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
    logTime(log, start, `Finished responding`);
  },
};
