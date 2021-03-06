import { VerifyNonceDtoType } from "@connext/types";
import { connect, Client } from "ts-nats";
import axios, { AxiosResponse } from "axios";

import { env } from "./env";
import { Wallet } from "ethers";
import { HDNode } from "ethers/utils";

let natsClient: Client | undefined = undefined;

export const getNatsClient = (): Client => {
  if (!natsClient || natsClient.isClosed()) {
    throw new Error(`NATS is not connected, use connectNats first`);
  }

  return natsClient;
};

export const connectNats = async (): Promise<Client> => {
  const hDNode = HDNode.fromMnemonic(Wallet.createRandom().mnemonic);
  if (!natsClient) {
    const adminJWT: AxiosResponse<string> = await axios.post(`${env.nodeUrl}/auth`, {
      sig: "0xbeef",
      userPublicIdentifier: hDNode.neuter().extendedKey,
      adminToken: env.adminToken,
    } as VerifyNonceDtoType);
    natsClient = await connect({ servers: ["nats://172.17.0.1:4222"], userJWT: adminJWT.data });
  }
  return natsClient;
};

export const closeNats = (): void => {
  if (natsClient) {
    natsClient.close();
  }
  natsClient = undefined;
};
