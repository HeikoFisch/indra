import { xkeyKthAddress } from "@connext/cf-core";
import { IConnextClient } from "@connext/types";
import { AddressZero, Zero } from "ethers/constants";

import { expect, TOKEN_AMOUNT } from "../util";
import { createClient, ETH_AMOUNT_SM } from "../util";

describe("Restore State", () => {
  let clientA: IConnextClient;
  let tokenAddress: string;
  let nodeFreeBalanceAddress: string;
  let nodePublicIdentifier: string;

  beforeEach(async () => {
    clientA = await createClient();
    tokenAddress = clientA.config.contractAddresses.Token;
    nodePublicIdentifier = clientA.config.nodePublicIdentifier;
    nodeFreeBalanceAddress = xkeyKthAddress(nodePublicIdentifier);
  });

  afterEach(async () => {
    await clientA.messaging.disconnect();
  });

  it("happy case: client can delete its store and restore from a remote backup", async () => {
    // client deposit and request node collateral
    await clientA.deposit({ amount: ETH_AMOUNT_SM.toString(), assetId: AddressZero });
    await clientA.requestCollateral(tokenAddress);

    // check balances pre
    const freeBalanceEthPre = await clientA.getFreeBalance(AddressZero);
    const freeBalanceTokenPre = await clientA.getFreeBalance(tokenAddress);
    expect(freeBalanceEthPre[clientA.freeBalanceAddress]).to.be.eq(ETH_AMOUNT_SM);
    expect(freeBalanceEthPre[nodeFreeBalanceAddress]).to.be.eq(Zero);
    expect(freeBalanceTokenPre[clientA.freeBalanceAddress]).to.be.eq(Zero);
    expect(freeBalanceTokenPre[nodeFreeBalanceAddress]).to.be.least(TOKEN_AMOUNT);

    // delete store
    clientA.store.clear();

    // check that getting balances will now error
    await expect(clientA.getFreeBalance(AddressZero)).to.be.rejectedWith(
      "Call to getStateChannel failed when searching for multisig address",
    );
    await expect(clientA.getFreeBalance(tokenAddress)).to.be.rejectedWith(
      "Call to getStateChannel failed when searching for multisig address",
    );

    await clientA.restoreState();

    // check balances post
    const freeBalanceEthPost = await clientA.getFreeBalance(AddressZero);
    const freeBalanceTokenPost = await clientA.getFreeBalance(tokenAddress);
    expect(freeBalanceEthPost[clientA.freeBalanceAddress]).to.be.eq(ETH_AMOUNT_SM);
    expect(freeBalanceEthPost[nodeFreeBalanceAddress]).to.be.eq(Zero);
    expect(freeBalanceTokenPost[clientA.freeBalanceAddress]).to.be.eq(Zero);
    expect(freeBalanceTokenPost[nodeFreeBalanceAddress]).to.be.least(TOKEN_AMOUNT);
  });
});
