import { bigNumberifyJson, createRandomAddress, StateChannelJSON } from "@connext/types";
import { getAddress } from "ethers/utils";

import { getRandomExtendedPubKeys } from "../../testing/random-signing-keys";
import { generateRandomNetworkContext } from "../../testing/mocks";

import { StateChannel } from "../state-channel";

describe("StateChannel", () => {
  it("should be able to instantiate", () => {
    const multisigAddress = getAddress(createRandomAddress());
    const xpubs = getRandomExtendedPubKeys(2);

    const { ProxyFactory, MinimumViableMultisig } = generateRandomNetworkContext();

    const sc = new StateChannel(
      multisigAddress,
      { proxyFactory: ProxyFactory, multisigMastercopy: MinimumViableMultisig },
      xpubs,
    );

    expect(sc).not.toBe(null);
    expect(sc).not.toBe(undefined);
    expect(sc.multisigAddress).toBe(multisigAddress);
    expect(sc.userNeuteredExtendedKeys).toBe(xpubs);
    expect(sc.numActiveApps).toBe(0);
    expect(sc.numProposedApps).toBe(0);
  });

  describe("should be able to write a channel to a json", () => {
    const multisigAddress = getAddress(createRandomAddress());
    const xpubs = getRandomExtendedPubKeys(2);

    let sc: StateChannel;
    let json: StateChannelJSON;

    const { IdentityApp, ProxyFactory, MinimumViableMultisig } = generateRandomNetworkContext();

    beforeAll(() => {
      // NOTE: this functionality is tested in `setup-channel.spec`
      sc = StateChannel.setupChannel(
        IdentityApp,
        { proxyFactory: ProxyFactory, multisigMastercopy: MinimumViableMultisig },
        multisigAddress,
        xpubs,
      );
      json = sc.toJson();
    });

    it("it should have app instance arrays", () => {
      expect(json.appInstances).toEqual([]);
    });

    it("should have proposed app instance array", () => {
      expect(json.proposedAppInstances).toEqual([]);
    });

    it("should have a free balance app instance", () => {
      expect(json.freeBalanceAppInstance).toBeDefined();
    });

    it("should not change the user xpubs", () => {
      expect(json.userNeuteredExtendedKeys).toEqual(xpubs);
    });

    it("should not change the multisig address", () => {
      expect(json.multisigAddress).toEqual(multisigAddress);
    });

    it("should have the correct critical state channel addresses", () => {
      expect(json.addresses.proxyFactory).toEqual(sc.addresses.proxyFactory);
      expect(sc.addresses.proxyFactory).toEqual(ProxyFactory);
      expect(json.addresses.multisigMastercopy).toEqual(sc.addresses.multisigMastercopy);
      expect(sc.addresses.multisigMastercopy).toEqual(MinimumViableMultisig);
    });
  });

  describe("should be able to rehydrate from json", () => {
    const multisigAddress = getAddress(createRandomAddress());
    const xpubs = getRandomExtendedPubKeys(2);

    const { IdentityApp, ProxyFactory, MinimumViableMultisig } = generateRandomNetworkContext();

    let sc: StateChannel;
    let json: StateChannelJSON;
    let rehydrated: StateChannel;

    beforeAll(() => {
      // NOTE: this functionality is tested in `setup-channel.spec`
      sc = StateChannel.setupChannel(
        IdentityApp,
        { proxyFactory: ProxyFactory, multisigMastercopy: MinimumViableMultisig },
        multisigAddress,
        xpubs,
      );
      json = sc.toJson();
      rehydrated = StateChannel.fromJson(json);
    });

    it("should work", () => {
      for (const prop of Object.keys(sc)) {
        if (typeof sc[prop] === "function" || prop === "freeBalanceAppInstance") {
          // skip fns
          // free balance asserted below
          continue;
        }
        expect(rehydrated[prop]).toEqual(sc[prop]);
      }
    });

    it("should have app instance maps", () => {
      expect(rehydrated.appInstances).toEqual(sc.appInstances);
    });

    it("should have proposed app instance maps", () => {
      expect(rehydrated.proposedAppInstances).toEqual(sc.proposedAppInstances);
    });

    it("should have a free balance app instance", () => {
      // will fail because of { _hex: "" } vs BigNumber comparison
      expect(rehydrated.freeBalance).toMatchObject(bigNumberifyJson(sc.freeBalance));
    });

    it("should not change the user xpubs", () => {
      expect(rehydrated.userNeuteredExtendedKeys).toEqual(sc.userNeuteredExtendedKeys);
    });

    it("should not change the multisig address", () => {
      expect(rehydrated.multisigAddress).toEqual(sc.multisigAddress);
    });
  });
});
