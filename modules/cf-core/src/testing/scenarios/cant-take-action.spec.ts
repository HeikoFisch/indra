import { Node } from "../../node";
import { INVALID_ACTION } from "../../errors";

import { NetworkContextForTestSuite } from "../contracts";
import { constructTakeActionRpc, createChannel, installApp } from "../utils";
import { setup, SetupContext } from "../setup";

const { TicTacToeApp } = global["network"] as NetworkContextForTestSuite;

describe("Node method follows spec - fails with improper action taken", () => {
  let nodeA: Node;
  let nodeB: Node;

  beforeAll(async () => {
    const context: SetupContext = await setup(global);
    nodeA = context["A"].node;
    nodeB = context["B"].node;
  });

  describe("Node A and B install an AppInstance, Node A takes invalid action", () => {
    it("can't take invalid action", async () => {
      const validAction = {
        actionType: 1,
        playX: 0,
        playY: 0,
        winClaim: {
          winClaimType: 0,
          idx: 0,
        },
      };
      const multisigAddress = await createChannel(nodeA, nodeB);

      const [appInstanceId] = await installApp(nodeA, nodeB, multisigAddress, TicTacToeApp);

      const takeActionReq = constructTakeActionRpc(appInstanceId, validAction);

      await expect(nodeA.rpcRouter.dispatch(takeActionReq)).rejects.toThrowError(INVALID_ACTION);
    });
  });
});
