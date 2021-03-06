import { stringify } from "@connext/types";
import { BigNumber } from "ethers/utils";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "./constants";

export const APP_ALREADY_UNINSTALLED = (id: string): string =>
  `Cannot uninstall app ${id}, it has already been uninstalled`;

export const CANNOT_DEPOSIT = "Cannot deposit while another deposit is occurring in the channel.";

export const COIN_BALANCE_NOT_PROPOSED = "No coin balance refund app proposed in channel.";

export const NOT_YOUR_BALANCE_REFUND_APP =
  "Cannot uninstall a balance refund app without being the recipient";

export const USE_RESCIND_DEPOSIT_RIGHTS =
  "Use `rescindDepositRights` to uninstall coin balance refund app.";

export const BALANCE_REFUND_APP_ALREADY_INSTALLED =
  "Balance refund app is installed, please uninstall first.";

export const BALANCE_REFUND_APP_NOT_INSTALLED = "Balance refund app is not installed.";

export const CANNOT_UNINSTALL_FREE_BALANCE = (multisigAddress: string): string =>
  `Cannot uninstall the FreeBalance of channel: ${multisigAddress}`;

export const CANNOT_WITHDRAW =
  "Cannot withdraw while another deposit / withdraw app is active in the channel.";

export const CHANNEL_CREATION_FAILED =
  "Failed to create channel. Multisignature wallet cannot be deployed properly";

export const DEPOSIT_FAILED = "Failed to send funds to the multisig contract";

export const ETH_BALANCE_REFUND_NOT_UNINSTALLED =
  "The ETH balance refund AppInstance is still installed when it's not supposed to be";

export const FAILED_TO_GET_ERC20_BALANCE = (tokenAddress: string, address: string): string =>
  `Failed to get the balance of address: ${address} for ERC20 token: ${tokenAddress}`;

export const IMPROPERLY_FORMATTED_STRUCT = "Improperly formatted ABIEncoderV2 struct";

export const INCORRECT_MULTISIG_ADDRESS = "Channel multisig address does not match expected";

export const INVALID_FACTORY_ADDRESS = (address: string): string =>
  `Channel factory address is invalid: ${address}`;

export const INVALID_MASTERCOPY_ADDRESS = (address: string): string =>
  `Multisig master address is invalid: ${address}`;

export const NO_NETWORK_PROVIDER_CREATE2 =
  "`getCreate2MultisigAddress` needs access to an eth provider within the network context";

export const INSUFFICIENT_ERC20_FUNDS_TO_DEPOSIT = (
  address: string,
  tokenAddress: string,
  amount: BigNumber,
  balance: BigNumber,
): string =>
  `Node's default signer ${address} has ${balance} and needs ${amount} of the specified ERC20 token ${tokenAddress} to deposit`;

export const INSUFFICIENT_FUNDS_TO_WITHDRAW = (
  address: string,
  amount: BigNumber,
  balance: BigNumber,
): string => {
  if (address === CONVENTION_FOR_ETH_TOKEN_ADDRESS) {
    return `Node has ${balance} and needs ${amount} ETH to withdraw`;
  }
  return `Node has ${balance} and needs ${amount} of token ${address} to withdraw`;
};

export const INSUFFICIENT_FUNDS_IN_FREE_BALANCE_FOR_ASSET = (
  publicIdentifier: string,
  multisigAddress: string,
  tokenAddress: string,
  balance: BigNumber,
  allocationAmount: BigNumber,
): string =>
  `Node with public identifier ${publicIdentifier} has insufficient funds in channel ${multisigAddress}
  for token ${tokenAddress} to allocate towards an AppInstance. Current free balance for token is ${balance},
  attempted allocation amount: ${allocationAmount} `;

export const INSUFFICIENT_FUNDS =
  "Node's default signer does not have enough funds for this action";

export const INVALID_ACTION = "Invalid action taken";

export const INVALID_NETWORK_NAME = "Invalid network name provided for initializing Node";

export const NO_ACTION_ENCODING_FOR_APP_INSTANCE =
  "The AppInstance does not have an Action encoding defined";

export const NO_APP_CONTRACT_ADDR = "The App Contract address is empty";

export const NO_APP_INSTANCE_FOR_GIVEN_ID = "No AppInstance exists for the given ID";

export const NO_APP_INSTANCE_FOR_TAKE_ACTION = "No AppInstanceId specified to takeAction on";

export const NO_APP_INSTANCE_ID_FOR_GET_STATE = "No string specified to get state for";

export const NO_APP_INSTANCE_ID_TO_GET_DETAILS = "No string specified to get details for";

export const NO_APP_INSTANCE_ID_TO_INSTALL = "No AppInstanceId specified to install";

export const NO_APP_INSTANCE_ID_TO_UNINSTALL = "No AppInstanceId specified to uninstall";

export const NO_MULTISIG_FOR_APP_INSTANCE_ID =
  "No multisig address exists for the given appInstanceId";

export const NO_PROPOSED_APP_INSTANCE_FOR_APP_INSTANCE_ID = (id: string): string =>
  `No proposed AppInstance exists for the given appInstanceId: ${id}`;

export const NO_STATE_CHANNEL_FOR_MULTISIG_ADDR = (multisigAddress: string): string =>
  `Call to getStateChannel failed when searching for multisig address: ${multisigAddress}. This probably means that the StateChannel does not exist yet.`;

export const NO_STATE_CHANNEL_FOR_APP_INSTANCE_ID = (appInstanceId: string): string =>
  `Call to getStateChannel failed when searching for app instance id: ${appInstanceId}.`;

export const NO_STATE_CHANNEL_FOR_OWNERS = (owners: string): string =>
  `Call to getStateChannel failed when searching by owners: ${owners}.`;

export const NO_TRANSACTION_HASH_FOR_MULTISIG_DEPLOYMENT =
  "The multisig deployment transaction does not have a hash";

export const NULL_INITIAL_STATE_FOR_PROPOSAL =
  "A proposed AppInstance cannot have an empty initial state";

export const STATE_OBJECT_NOT_ENCODABLE =
  "The state object is not encodable by the AppInstance's state encoding";

export const TWO_PARTY_OUTCOME_DIFFERENT_ASSETS = (assetA: string, assetB: string): string =>
  `For a TWO_PARTY_FIXED_OUTCOME there cannot be two kinds of tokens deposited: ${assetA} and ${assetB}`;

export const WITHDRAWAL_FAILED = "Failed to withdraw funds out of the multisig contract";

export const NO_MULTISIG_FOR_COUNTERPARTIES = (owners: string[]): string =>
  `Could not find multisig address between counterparties ${stringify(owners)}`;
