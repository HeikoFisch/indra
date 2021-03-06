import { MemoryStorage as MemoryStoreService } from "@connext/store";
import {
  createRandom32ByteHexString,
  EXPECTED_CONTRACT_NAMES_IN_NETWORK_CONTEXT,
  NetworkContext,
  nullLogger,
  ProtocolNames,
} from "@connext/types";
import { Wallet } from "ethers";
import { AddressZero, HashZero, Zero } from "ethers/constants";
import { JsonRpcProvider } from "ethers/providers";
import { HDNode } from "ethers/utils";
import { anything, instance, mock, when } from "ts-mockito";

import {
  NO_APP_INSTANCE_ID_TO_INSTALL,
  NO_MULTISIG_FOR_APP_INSTANCE_ID,
  NO_PROPOSED_APP_INSTANCE_FOR_APP_INSTANCE_ID,
} from "../../errors";
import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../constants";
import { ProtocolRunner } from "../../machine";
import { StateChannel } from "../../models";
import { Store } from "../../store";
import { xkeysToSortedKthAddresses } from "../../xkeys";

import { getRandomExtendedPubKeys } from "../../testing/random-signing-keys";
import { createAppInstanceProposalForTest } from "../../testing/utils";

import { install } from "./install";

const NETWORK_CONTEXT_OF_ALL_ZERO_ADDRESSES = EXPECTED_CONTRACT_NAMES_IN_NETWORK_CONTEXT.reduce(
  (acc, contractName) => ({
    ...acc,
    [contractName]: AddressZero,
  }),
  {} as NetworkContext,
);

describe("Can handle correct & incorrect installs", () => {
  let store: Store;
  let protocolRunner: ProtocolRunner;
  let initiatorIdentifier: string;

  beforeAll(() => {
    store = new Store(new MemoryStoreService());
    protocolRunner = new ProtocolRunner(
      NETWORK_CONTEXT_OF_ALL_ZERO_ADDRESSES,
      {} as JsonRpcProvider,
      store,
      nullLogger,
    );
    initiatorIdentifier = HDNode.fromMnemonic(Wallet.createRandom().mnemonic).neuter().extendedKey;
  });

  it("fails to install with undefined appInstanceId", async () => {
    await expect(
      install(store, protocolRunner, { appInstanceId: undefined! }, initiatorIdentifier),
    ).rejects.toThrowError(NO_APP_INSTANCE_ID_TO_INSTALL);
  });

  it("fails to install with empty string appInstanceId", async () => {
    await expect(
      install(store, protocolRunner, { appInstanceId: "" }, initiatorIdentifier),
    ).rejects.toThrowError(NO_APP_INSTANCE_ID_TO_INSTALL);
  });

  it("fails to install without the AppInstance being proposed first", async () => {
    await expect(
      install(store, protocolRunner, { appInstanceId: HashZero }, initiatorIdentifier),
    ).rejects.toThrowError(NO_PROPOSED_APP_INSTANCE_FOR_APP_INSTANCE_ID(HashZero));
  });

  it("fails to install without the AppInstanceId being in a channel", async () => {
    expect.hasAssertions();

    const mockedStore = mock(Store);

    const appInstanceId = createRandom32ByteHexString();
    const appInstanceProposal = createAppInstanceProposalForTest(appInstanceId);

    when(mockedStore.getAppInstanceProposal(appInstanceId)).thenResolve(appInstanceProposal);

    when(mockedStore.getStateChannelFromAppInstanceID(appInstanceId)).thenThrow(
      Error(NO_MULTISIG_FOR_APP_INSTANCE_ID),
    );

    await expect(
      install(instance(mockedStore), protocolRunner, { appInstanceId }, initiatorIdentifier),
    ).rejects.toThrowError(NO_MULTISIG_FOR_APP_INSTANCE_ID);
  });

  it("succeeds to install a proposed AppInstance", async () => {
    const mockedProtocolRunner = mock(ProtocolRunner);
    const protocolRunner = instance(mockedProtocolRunner);

    const mockedStore = mock(Store);
    const store = instance(mockedStore);

    const appInstanceId = createRandom32ByteHexString();
    const multisigAddress = Wallet.createRandom().address;
    const extendedKeys = getRandomExtendedPubKeys(2);
    const participants = xkeysToSortedKthAddresses(extendedKeys, 0);

    const stateChannel = StateChannel.setupChannel(
      AddressZero,
      { proxyFactory: AddressZero, multisigMastercopy: AddressZero },
      multisigAddress,
      extendedKeys,
    );

    expect(
      stateChannel
        .getFreeBalanceClass()
        .getBalance(CONVENTION_FOR_ETH_TOKEN_ADDRESS, participants[0]),
    ).toEqual(Zero);
    expect(
      stateChannel
        .getFreeBalanceClass()
        .getBalance(CONVENTION_FOR_ETH_TOKEN_ADDRESS, participants[1]),
    ).toEqual(Zero);

    await store.saveStateChannel(stateChannel);

    const appInstanceProposal = createAppInstanceProposalForTest(appInstanceId);

    when(mockedStore.getAppInstanceProposal(appInstanceId)).thenResolve(appInstanceProposal);

    when(mockedStore.getStateChannelFromAppInstanceID(appInstanceId)).thenResolve(stateChannel);

    // Gets around having to register middleware into the machine
    // and just returns a basic <string, StateChannel> map with the
    // expected multisigAddress in it.
    when(mockedProtocolRunner.initiateProtocol(ProtocolNames.install, anything())).thenResolve();

    // The AppInstanceProposal that's returned is the one that was installed, which
    // is the same one as the one that was proposed
    await expect(
      install(
        store,
        protocolRunner,
        {
          appInstanceId,
        },
        extendedKeys[0],
      ),
    ).resolves.toEqual(appInstanceProposal);
  });
});
