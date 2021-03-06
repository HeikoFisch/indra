import { OutcomeType, createRandomAddress } from "@connext/types";
import { AddressZero, Zero } from "ethers/constants";
import { getAddress } from "ethers/utils";

import { AppInstance } from "./app-instance";

describe("AppInstance", () => {
  it("should be able to instantiate", () => {
    const participants = [getAddress(createRandomAddress()), getAddress(createRandomAddress())];

    const appInstance = new AppInstance(
      participants,
      Math.ceil(Math.random() * 2e10),
      {
        addr: getAddress(createRandomAddress()),
        stateEncoding: "tuple(address foo, uint256 bar)",
        actionEncoding: undefined,
      },
      Math.ceil(Math.random() * 2e10),
      { foo: getAddress(createRandomAddress()), bar: 0 },
      /* versionNumber */ 999,
      Math.ceil(1000 * Math.random()),
      OutcomeType.TWO_PARTY_FIXED_OUTCOME,
      getAddress(createRandomAddress()),
      {
        playerAddrs: [AddressZero, AddressZero],
        amount: Zero,
        tokenAddress: AddressZero,
      },
      undefined,
      undefined,
    );

    expect(appInstance).not.toBe(null);
    expect(appInstance).not.toBe(undefined);
    expect(appInstance.participants).toBe(participants);

    // TODO: moar tests pl0x
  });
});
