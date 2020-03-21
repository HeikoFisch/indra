import { Controller } from "rpc-server";

import { RequestHandler } from "../request-handler";
import { CFCoreTypes } from "../types";

export abstract class NodeController extends Controller {
  public static readonly methodName: CFCoreTypes.MethodName;

  public async executeMethod(
    requestHandler: RequestHandler,
    params: CFCoreTypes.MethodParams,
  ): Promise<CFCoreTypes.MethodResult> {
    await this.beforeExecution(requestHandler, params);

    const lockNames = await this.getRequiredLockNames(requestHandler, params);

    const lockValues: string[] = await Promise.all(lockNames.map((name)=> {
      return requestHandler.lockService.acquireLock(name);
    }));

    const ret = await this.executeMethodImplementation(requestHandler, params);

    await Promise.all(lockNames.map((name, index)=> {
      return requestHandler.lockService.releaseLock(name, lockValues[index]);
    }));

    await this.afterExecution(requestHandler, params);

    return ret;
  }

  protected abstract executeMethodImplementation(
    requestHandler: RequestHandler,
    params: CFCoreTypes.MethodParams,
  ): Promise<CFCoreTypes.MethodResult>;

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: CFCoreTypes.MethodParams,
  ): Promise<void> {}

  protected async afterExecution(
    requestHandler: RequestHandler,
    params: CFCoreTypes.MethodParams,
  ): Promise<void> {}

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: CFCoreTypes.MethodParams,
  ): Promise<string[]> {
    return [];
  }
}
