import { CFCoreTypes } from "@connext/types";

import { Lock } from "./lock";

export class MemoryLockService implements CFCoreTypes.ILockService {
  public readonly locks: Map<string, Lock> = new Map<string, Lock>();

  async acquireLock(
    lockName: string,
    timeout?: number,
  ): Promise<string> {
    let lock
    if (!this.locks.has(lockName)) {
      this.locks.set(lockName, new Lock(lockName));
      lock = this.locks.get(lockName)!;
    }

    let retval = null;
    let rejectReason = null;
    let unlockKey = "";
    
    return lock.acquireLock(timeout);
  }

  async releaseLock(
    lockName: string,
    lockValue: string,
  ): Promise<any> {
    const lock = this.locks.get(lockName)
    //@ts-ignore
    return lock.releaseLock(lockName, lockValue);
  }
}

export default MemoryLockService;
 