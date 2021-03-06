import { MethodNames, MethodParams, MethodResults, ProtocolNames } from "@connext/types";
import { INVALID_ARGUMENT } from "ethers/errors";
import { jsonRpcMethod } from "rpc-server";

import {
  IMPROPERLY_FORMATTED_STRUCT,
  NO_APP_INSTANCE_FOR_TAKE_ACTION,
  STATE_OBJECT_NOT_ENCODABLE,
} from "../../errors";
import { ProtocolRunner } from "../../machine";
import { RequestHandler } from "../../request-handler";
import { Store } from "../../store";
import { SolidityValueType } from "../../types";
import { getFirstElementInListNotEqualTo } from "../../utils";
import { NodeController } from "../controller";

export class UpdateStateController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_updateState)
  public executeMethod = super.executeMethod;

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: MethodParams.UpdateState,
  ): Promise<string[]> {
    return [params.appInstanceId];
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: MethodParams.UpdateState,
  ): Promise<void> {
    const { store } = requestHandler;
    const { appInstanceId, newState } = params;

    if (!appInstanceId) {
      throw new Error(NO_APP_INSTANCE_FOR_TAKE_ACTION);
    }

    const appInstance = await store.getAppInstance(appInstanceId);

    try {
      appInstance.encodeState(newState);
    } catch (e) {
      if (e.code === INVALID_ARGUMENT) {
        throw new Error(`${IMPROPERLY_FORMATTED_STRUCT}: ${e.message}`);
      }
      throw new Error(STATE_OBJECT_NOT_ENCODABLE);
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.UpdateState,
  ): Promise<MethodResults.UpdateState> {
    const { store, publicIdentifier, protocolRunner } = requestHandler;
    const { appInstanceId, newState } = params;

    const sc = await store.getStateChannelFromAppInstanceID(appInstanceId);

    const responderXpub = getFirstElementInListNotEqualTo(
      publicIdentifier,
      sc.userNeuteredExtendedKeys,
    );

    await runUpdateStateProtocol(
      appInstanceId,
      store,
      protocolRunner,
      publicIdentifier,
      responderXpub,
      newState,
    );

    return { newState };
  }
}

async function runUpdateStateProtocol(
  appIdentityHash: string,
  store: Store,
  protocolRunner: ProtocolRunner,
  initiatorXpub: string,
  responderXpub: string,
  newState: SolidityValueType,
) {
  const stateChannel = await store.getStateChannelFromAppInstanceID(appIdentityHash);

  await protocolRunner.initiateProtocol(ProtocolNames.update, {
    initiatorXpub,
    responderXpub,
    appIdentityHash,
    newState,
    multisigAddress: stateChannel.multisigAddress,
  });
}
