import { MinimalTransaction, EthereumCommitment } from "@connext/types";
import { Interface, keccak256, solidityPack } from "ethers/utils";
import { sortSignaturesBySignerAddress } from "@connext/types";

import { ChallengeRegistry } from "../contracts";
import { AppInstance } from "../models";
import {
  AppIdentity,
  Context,
  SignedStateHashUpdate,
  SetStateCommitmentJSON,
} from "../types";
import { appIdentityToHash } from "../utils";

const iface = new Interface(ChallengeRegistry.abi);

export const getSetStateCommitment = (
  context: Context,
  appInstance: AppInstance,
) => new SetStateCommitment(
  context.network.ChallengeRegistry,
  appInstance.identity,
  appInstance.hashOfLatestState,
  appInstance.versionNumber,
  appInstance.timeout,
);

export class SetStateCommitment implements EthereumCommitment {
  constructor(
    public readonly challengeRegistryAddress: string,
    public readonly appIdentity: AppIdentity,
    public readonly appStateHash: string,
    public readonly versionNumber: number, // app nonce
    public readonly timeout: number,
    public readonly appIdentityHash: string = appIdentityToHash(appIdentity),
    private participantSignatures: string[] = [],
  ) {}

  get signatures(): string[] {
    return this.participantSignatures;
  }

  set signatures(sigs: string[]) {
    if (sigs.length < 2) {
      throw new Error(
        `Incorrect number of signatures supplied. Expected at least 2, got ${sigs.length}`,
      );
    }
    this.participantSignatures = sigs;
  }

  public encode(): string {
    return solidityPack(
      ["bytes1", "bytes32", "uint256", "uint256", "bytes32"],
      [
        "0x19",
        appIdentityToHash(this.appIdentity),
        this.versionNumber,
        this.timeout,
        this.appStateHash,
      ],
    );
  }

  public hashToSign(): string {
    return keccak256(this.encode());
  }

  public async getSignedTransaction(): Promise<MinimalTransaction> {
    this.assertSignatures();
    return {
      to: this.challengeRegistryAddress,
      value: 0,
      data: iface.functions.setState.encode([
        this.appIdentity,
        await this.getSignedStateHashUpdate(),
      ]),
    };
  }

  public toJson(): SetStateCommitmentJSON {
    return {
      appIdentityHash: this.appIdentityHash,
      appIdentity: this.appIdentity,
      appStateHash: this.appStateHash,
      challengeRegistryAddress: this.challengeRegistryAddress,
      signatures: this.signatures,
      timeout: this.timeout,
      versionNumber: this.versionNumber,
    };
  }

  public static fromJson(json: SetStateCommitmentJSON) {
    return new SetStateCommitment(
      json.challengeRegistryAddress,
      json.appIdentity,
      json.appStateHash,
      json.versionNumber,
      json.timeout,
      json.appIdentityHash,
      json.signatures,
    );
  }

  private async getSignedStateHashUpdate(): Promise<SignedStateHashUpdate> {
    this.assertSignatures();
    const hash = this.hashToSign();
    return {
      appStateHash: this.appStateHash,
      versionNumber: this.versionNumber,
      timeout: this.timeout,
      signatures: await sortSignaturesBySignerAddress(hash, this.signatures),
    };
  }

  private assertSignatures() {
    if (!this.signatures || this.signatures.length === 0) {
      throw new Error(`No signatures detected`);
    }

    if (this.signatures.length < 2) {
      throw new Error(
        `Incorrect number of signatures supplied. Expected at least 2, got ${this.signatures.length}`,
      );
    }
  }
}
