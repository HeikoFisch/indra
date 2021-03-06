import { MethodNames, MethodParams, MethodResults } from "@connext/types";
import { jsonRpcMethod } from "rpc-server";

import { RequestHandler } from "../../request-handler";
import { NodeController } from "../controller";

/**
 * Gets all installed appInstances across all of the channels open on
 * this Node.
 */
export class GetInstalledAppInstancesController extends NodeController {
  @jsonRpcMethod(MethodNames.chan_getAppInstances)
  public executeMethod = super.executeMethod;

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: MethodParams.GetAppInstances,
  ): Promise<MethodResults.GetAppInstances> {
    const { store } = requestHandler;
    const { multisigAddress } = params;

    if (!multisigAddress) {
      throw new Error("Multisig address must be provided");
    }

    return {
      appInstances: await store.getAppInstances(multisigAddress),
    };
  }
}
