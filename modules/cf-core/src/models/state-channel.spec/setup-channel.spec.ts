import { Zero } from "ethers/constants";
import { getAddress } from "ethers/utils";
import { createRandomAddress } from "@connext/types";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../constants";
import { getRandomExtendedPubKeys } from "../../testing/random-signing-keys";
import { generateRandomNetworkContext } from "../../testing/mocks";

import { AppInstance } from "../app-instance";
import { AppInstanceProposal } from "../app-instance-proposal";
import { StateChannel } from "../state-channel";

describe("StateChannel::setupChannel", () => {
  const multisigAddress = getAddress(createRandomAddress());
  const xpubs = getRandomExtendedPubKeys(2);

  let sc: StateChannel;

  const networkContext = generateRandomNetworkContext();

  beforeAll(() => {
    sc = StateChannel.setupChannel(
      networkContext.IdentityApp,
      {
        proxyFactory: networkContext.ProxyFactory,
        multisigMastercopy: networkContext.MinimumViableMultisig,
      },
      multisigAddress,
      xpubs,
    );
  });

  it("should have empty map for proposed app instances", () => {
    expect(sc.proposedAppInstances).toEqual(new Map<string, AppInstanceProposal>());
  });

  it("should have empty map for app instances", () => {
    expect(sc.appInstances).toEqual(new Map<string, AppInstance>());
  });

  it("should not alter any of the base properties", () => {
    expect(sc.multisigAddress).toBe(multisigAddress);
    expect(sc.userNeuteredExtendedKeys).toBe(xpubs);
  });

  it("should have bumped the sequence number", () => {
    expect(sc.numProposedApps).toBe(1);
  });

  describe("the installed ETH Free Balance", () => {
    let fb: AppInstance;

    beforeAll(() => {
      fb = sc.freeBalance;
    });

    it("should exist", () => {
      expect(fb).not.toBe(undefined);
    });

    it("should have versionNumber 0 to start", () => {
      expect(fb.versionNumber).toBe(0);
    });

    it("should have a default timeout defined by the hard-coded assumption", () => {
      // See HARD_CODED_ASSUMPTIONS in state-channel.ts
      expect(fb.timeout).toBe(172800);
    });

    it("should use the default timeout for the initial timeout", () => {
      expect(fb.timeout).toBe(fb.defaultTimeout);
    });

    it("should use the multisig owners as the participants", () => {
      expect(fb.participants).toEqual(sc.multisigOwners);
    });

    it("should use the FreeBalanceAppApp as the app target", () => {
      expect(fb.appInterface.addr).toBe(networkContext.IdentityApp);
      expect(fb.appInterface.actionEncoding).toBe(undefined);
    });

    it("should have seqNo of 0 (b/c it is the first ever app)", () => {
      expect(fb.appSeqNo).toBe(0);
    });

    it("should set the participants as the userNeuteredExtendedKeys", () => {});

    it("should have 0 balances for Alice and Bob", () => {
      for (const amount of Object.values(
        sc.getFreeBalanceClass().withTokenAddress(CONVENTION_FOR_ETH_TOKEN_ADDRESS) || {},
      )) {
        expect(amount).toEqual(Zero);
      }
    });
  });
});
