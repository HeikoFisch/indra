import {
  CoinBalanceRefundAppName,
  enumify,
  FastSignedTransferAppName,
  HashLockTransferAppName,
  OutcomeType,
  SimpleLinkedTransferAppName,
  SimpleSignedTransferAppName,
  SimpleTwoPartySwapAppName,
  WithdrawAppName,
} from "@connext/types";

export const SupportedApplications = enumify({
  [CoinBalanceRefundAppName]: CoinBalanceRefundAppName,
  [SimpleLinkedTransferAppName]: SimpleLinkedTransferAppName,
  [SimpleSignedTransferAppName]: SimpleSignedTransferAppName,
  [SimpleTwoPartySwapAppName]: SimpleTwoPartySwapAppName,
  [FastSignedTransferAppName]: FastSignedTransferAppName,
  [WithdrawAppName]: WithdrawAppName,
  [HashLockTransferAppName]: HashLockTransferAppName,
});

export type SupportedApplications =
  (typeof SupportedApplications)[keyof typeof SupportedApplications];

export type AppRegistryInfo = {
  actionEncoding?: string;
  allowNodeInstall: boolean;
  name: SupportedApplications;
  outcomeType: OutcomeType;
  stateEncoding: string;
};

export type AppRegistryType = AppRegistryInfo[];
