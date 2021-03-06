import { Address, BigNumberish, HexString } from "./basic";
import { AppIdentity, MultisigOperation, NetworkContext } from "./contracts";
import { enumify } from "./utils";

// This is used instead of the ethers `Transaction` because that type
// requires the nonce and chain ID to be specified, when sometimes those
// arguments are not known at the time of creating a transaction.
export type MinimalTransaction = {
  to: string;
  value: BigNumberish;
  data: string;
};

// Multisig
export interface EthereumCommitment {
  signatures: string[];
  encode(): string;
  hashToSign(): string;
  getSignedTransaction(): Promise<MinimalTransaction>;
}

export const CommitmentTypes = enumify({
  Conditional: "conditional",
  SetState: "setState",
  Setup: "setup",
  Withdraw: "withdraw",
});
export type CommitmentTypes = (typeof CommitmentTypes)[keyof typeof CommitmentTypes];

export type MultisigTransaction = MinimalTransaction & {
  operation: MultisigOperation;
};

export type SetStateCommitmentJSON = {
  readonly appIdentity: AppIdentity;
  readonly appIdentityHash: HexString;
  readonly appStateHash: HexString;
  readonly challengeRegistryAddress: Address;
  readonly signatures: string[];
  readonly timeout: number;
  readonly versionNumber: number;
};

export type ConditionalTransactionCommitmentJSON = {
  readonly appIdentityHash: HexString;
  readonly freeBalanceAppIdentityHash: HexString;
  readonly interpreterAddr: Address;
  readonly interpreterParams: HexString; // ?
  readonly multisigAddress: Address;
  readonly multisigOwners: Address[];
  readonly networkContext: NetworkContext;
  readonly signatures: string[];
};
