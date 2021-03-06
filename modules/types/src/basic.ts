import { BigNumber as ethersBN, BigNumberish, Interface, ParamType } from "ethers/utils";

export { Contract } from "ethers";
export {
  JsonRpcProvider,
  TransactionReceipt,
  TransactionResponse,
} from "ethers/providers";
export { BigNumberish, Network, Transaction } from "ethers/utils";

// special strings
export type ABIEncoding = string; // eg "tuple(address to, uint256 amount)"
export type Address = string; // aka HexString of length 42
export type DecString = string; // eg "3.14" (implied to be e18 int)
export type HexString = string; // eg "0xabc123"
export type Xpub = string; // eg "xpub6AbC...123" (str length = 111)

export type BigNumber = ethersBN;
export const BigNumber = ethersBN;

export type HexObject = { _hex: HexString };

export interface EthSignature {
  r: string;
  s: string;
  v: string;
}

// This is copied from the ethers definition of how an ABI is typed.
export type ContractABI = Array<string | ParamType> | string | Interface;

export type SolidityPrimitiveType = string | BigNumberish | boolean;

type SolidityABIEncoderV2Struct = {
  [x: string]: SolidityValueType;
};

type SolidityABIEncoderV2SArray = Array<SolidityValueType>;

// The application-specific state of an app instance, to be interpreted by the
// app developer. We just treat it as an opaque blob; however since we pass this
// around in protocol messages and include this in transaction data in challenges,
// we impose some restrictions on the type; they must be serializable both as
// JSON and as solidity structs.
export type SolidityValueType =
  | SolidityPrimitiveType
  | SolidityABIEncoderV2Struct
  | SolidityABIEncoderV2SArray;

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
