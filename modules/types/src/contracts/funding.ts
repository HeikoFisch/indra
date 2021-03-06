import { Address, BigNumber, HexString, HexObject } from "../basic";
import { tidy } from "./misc";

////////////////////////////////////////
// keep synced w contracts/funding/default-apps/TimeLockedPassthrough.sol

type TimeLockedPassthroughAppState = {
  challengeRegistryAddress: Address;
  targetAppIdentityHash: HexString;
  switchesOutcomeAt: HexString;
  defaultOutcome: HexString | any;
};

////////////////////////////////////////
// keep synced w contracts/funding/interpreters/MultiAssetMultiPartyCoinTransferInterpreter.sol

export type MultiAssetMultiPartyCoinTransferInterpreterParams = {
  limit: BigNumber[];
  tokenAddresses: Address[];
};

export type MultiAssetMultiPartyCoinTransferInterpreterParamsJson = Partial<
  MultiAssetMultiPartyCoinTransferInterpreterParams
> & {
  limit: HexObject[];
};

export const multiAssetMultiPartyCoinTransferInterpreterParamsEncoding = tidy(`tuple(
  uint256[] limit,
  address[] tokenAddresses
)`);

////////////////////////////////////////
// keep synced w contracts/funding/interpreters/SingleAssetTwoPartyCoinTransferInterpreter.sol

export type SingleAssetTwoPartyCoinTransferInterpreterParams = {
  limit: BigNumber;
  tokenAddress: Address;
};

export type SingleAssetTwoPartyCoinTransferInterpreterParamsJson = Partial<
  SingleAssetTwoPartyCoinTransferInterpreterParams
> & {
  limit: HexObject;
};

export const singleAssetTwoPartyCoinTransferInterpreterParamsEncoding = tidy(`tuple(
  uint256 limit,
  address tokenAddress
)`);

////////////////////////////////////////
// keep synced w contracts/funding/interpreters/TwoPartyFixedOutcomeInterpreter.sol

export type TwoPartyFixedOutcomeInterpreterParams = {
  playerAddrs: [Address, Address];
  amount: BigNumber;
  tokenAddress: Address;
};

export type TwoPartyFixedOutcomeInterpreterParamsJson = Partial<
  TwoPartyFixedOutcomeInterpreterParams
> & {
  amount: HexObject;
};

// TODO: tokenAddress?!
export const twoPartyFixedOutcomeInterpreterParamsEncoding = tidy(`tuple(
  address[2] playerAddrs,
  uint256 amount
)`);

////////////////////////////////////////
// keep synced w contracts/funding/libs/LibOutcome.sol

export type CoinTransfer = {
  amount: BigNumber;
  to: Address;
};

export enum TwoPartyFixedOutcome {
  SEND_TO_ADDR_ONE = 0,
  SEND_TO_ADDR_TWO = 1,
  SPLIT_AND_SEND_TO_BOTH_ADDRS = 2,
}

////////////////////////////////////////
// keep synced w contracts/funding/state-deposit-holders/MinimumViableMultisig.sol

export enum MultisigOperation {
  Call = 0,
  DelegateCall = 1
}

////////////////////////////////////////
// contracts/funding/ConditionalTransactionDelegateTarget.sol

type FreeBalanceAppState = {
  tokenAddresses: Address[];
  balances: CoinTransfer[][];
  activeApps: HexString[];
};
