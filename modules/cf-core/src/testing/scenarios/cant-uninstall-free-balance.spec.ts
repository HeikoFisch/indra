import { Node } from "../../node";
import { CANNOT_UNINSTALL_FREE_BALANCE } from "../../errors";
import { StateChannel } from "../../models";

import { setup, SetupContext } from "../setup";
import { constructUninstallRpc, createChannel } from "../utils";

describe("Confirms that a FreeBalance cannot be uninstalled", () => {
  let nodeA: Node;
  let nodeB: Node;

  beforeAll(async () => {
    const context: SetupContext = await setup(global);
    nodeA = context["A"].node;
    nodeB = context["B"].node;
  });

  describe("Node A and B open channel, attempt to uninstall FreeBalance", () => {
    it("can't uninstall FreeBalance", async () => {
      const multisigAddress = await createChannel(nodeA, nodeB);

      // channel to expose the FreeBalance appInstanceId
      const channel = StateChannel.setupChannel(
        global["network"].IdentityApp,
        global["network"].ProxyFactory,
        multisigAddress,
        [nodeA.publicIdentifier, nodeB.publicIdentifier],
      );

      const fbUninstallReq = constructUninstallRpc(channel.freeBalance.identityHash);

      try {
        await nodeA.rpcRouter.dispatch(fbUninstallReq);
      } catch (e) {
        expect(e.toString()).toMatch(CANNOT_UNINSTALL_FREE_BALANCE(multisigAddress));
      }
    });
  });
});
