import { EventNames, MethodNames, MethodParams, MethodResults, ProtocolNames } from "@connext/types";
import { INVALID_ARGUMENT } from "ethers/errors";
import { jsonRpcMethod } from "rpc-server";

import {
  IMPROPERLY_FORMATTED_STRUCT,
  INVALID_ACTION,
  NO_APP_INSTANCE_FOR_TAKE_ACTION,
  STATE_OBJECT_NOT_ENCODABLE,
} from "../../errors";
import { ProtocolRunner } from "../../machine";
import { RequestHandler } from "../../request-handler";
import { Store } from "../../store";
import { SolidityValueType, UpdateStateMessage } from "../../types";
import { getFirstElementInListNotEqualTo } from "../../utils";

import { NodeController } from "../controller";

export class TakeActionController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_takeAction)
  public executeMethod = super.executeMethod;

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: MethodParams.TakeAction,
  ): Promise<string[]> {
    const multisigAddress = await requestHandler.store.getMultisigAddressFromAppInstance(
      params.appInstanceId,
    );
    return [multisigAddress, params.appInstanceId];
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: MethodParams.TakeAction,
  ): Promise<void> {
    const { store } = requestHandler;
    const { appInstanceId, action } = params;

    if (!appInstanceId) {
      throw new Error(NO_APP_INSTANCE_FOR_TAKE_ACTION);
    }

    const appInstance = await store.getAppInstance(appInstanceId);

    try {
      appInstance.encodeAction(action);
    } catch (e) {
      if (e.code === INVALID_ARGUMENT) {
        throw new Error(`${IMPROPERLY_FORMATTED_STRUCT}: ${e.message}`);
      }
      throw new Error(STATE_OBJECT_NOT_ENCODABLE);
    }
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.TakeAction,
  ): Promise<MethodResults.TakeAction> {
    const { store, publicIdentifier, protocolRunner } = requestHandler;
    const { appInstanceId, action } = params;

    const sc = await store.getStateChannelFromAppInstanceID(appInstanceId);

    const responderXpub = getFirstElementInListNotEqualTo(
      publicIdentifier,
      sc.userNeuteredExtendedKeys,
    );

    await runTakeActionProtocol(
      appInstanceId,
      store,
      protocolRunner,
      publicIdentifier,
      responderXpub,
      action,
    );

    const appInstance = await store.getAppInstance(appInstanceId);

    return { newState: appInstance.state };
  }

  protected async afterExecution(
    requestHandler: RequestHandler,
    params: MethodParams.TakeAction,
  ): Promise<void> {
    const { store, router, publicIdentifier } = requestHandler;
    const { appInstanceId, action } = params;

    const appInstance = await store.getAppInstance(appInstanceId);

    const msg = {
      from: publicIdentifier,
      type: EventNames.UPDATE_STATE_EVENT,
      data: { appInstanceId, action, newState: appInstance.state },
    } as UpdateStateMessage;

    await router.emit(msg.type, msg, `outgoing`);
  }
}

async function runTakeActionProtocol(
  appIdentityHash: string,
  store: Store,
  protocolRunner: ProtocolRunner,
  initiatorXpub: string,
  responderXpub: string,
  action: SolidityValueType,
) {
  const stateChannel = await store.getStateChannelFromAppInstanceID(appIdentityHash);

  try {
    await protocolRunner.initiateProtocol(ProtocolNames.takeAction, {
      initiatorXpub,
      responderXpub,
      appIdentityHash,
      action,
      multisigAddress: stateChannel.multisigAddress,
    });
  } catch (e) {
    if (e.toString().indexOf(`VM Exception`) !== -1) {
      // TODO: Fetch the revert reason
      throw new Error(`${INVALID_ACTION}: ${e.message}`);
    }
    throw new Error(`Couldn't run TakeAction protocol: ${e.message}`);
  }

  return {};
}
