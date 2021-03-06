import { CF_PATH, IMessagingService, IStoreService } from "@connext/types";
import { Wallet } from "ethers";
import { JsonRpcProvider, TransactionRequest } from "ethers/providers";
import { parseEther } from "ethers/utils";
import { fromExtendedKey } from "ethers/utils/hdnode";

import { Node } from "../node";
import { computeRandomExtendedPrvKey } from "../xkeys";

import { MemoryLockService, MemoryMessagingService, MemoryStoreServiceFactory } from "./services";
import {
  A_EXTENDED_PRIVATE_KEY,
  B_EXTENDED_PRIVATE_KEY,
  C_EXTENDED_PRIVATE_KEY,
} from "./test-constants.jest";
import { Logger } from "./logger";

export const env = {
  logLevel: process.env.LOG_LEVEL ? parseInt(process.env.LOG_LEVEL, 10) : 0,
};

export interface NodeContext {
  node: Node;
  store: IStoreService;
}

export interface SetupContext {
  [nodeName: string]: NodeContext;
}

export async function setupWithMemoryMessagingAndStore(
  global: any,
  nodeCPresent: boolean = false,
  newExtendedPrvKeys: boolean = false,
): Promise<SetupContext> {
  return setup(
    global,
    nodeCPresent,
    newExtendedPrvKeys,
    new MemoryMessagingService(),
    new MemoryStoreServiceFactory(),
  );
}

export async function setup(
  global: any,
  nodeCPresent: boolean = false,
  newExtendedPrvKey: boolean = false,
  messagingService: IMessagingService = new MemoryMessagingService(),
  storeServiceFactory = new MemoryStoreServiceFactory(),
): Promise<SetupContext> {
  const setupContext: SetupContext = {};

  const nodeConfig = { STORE_KEY_PREFIX: "test" };
  const provider = new JsonRpcProvider(global["wallet"].provider.connection.url);

  const extendedPrvKeyA = A_EXTENDED_PRIVATE_KEY;
  let extendedPrvKeyB = B_EXTENDED_PRIVATE_KEY;

  if (newExtendedPrvKey) {
    const newExtendedPrvKeys = await generateNewFundedExtendedPrvKeys(
      global["wallet"].privateKey,
      provider,
    );
    extendedPrvKeyB = newExtendedPrvKeys.B_EXTENDED_PRV_KEY;
  }

  const lockService = new MemoryLockService();

  const hdNodeA = fromExtendedKey(extendedPrvKeyA).derivePath(CF_PATH);
  const storeServiceA = storeServiceFactory.createStoreService();
  const nodeA = await Node.create(
    messagingService,
    storeServiceA,
    global["network"],
    nodeConfig,
    provider,
    lockService,
    hdNodeA.neuter().extendedKey,
    (index: string): Promise<string> => Promise.resolve(hdNodeA.derivePath(index).privateKey),
    0,
    new Logger("CreateClient", env.logLevel, true, "A"),
  );

  setupContext["A"] = {
    node: nodeA,
    store: storeServiceA,
  };

  const hdNodeB = fromExtendedKey(extendedPrvKeyB).derivePath(CF_PATH);
  const storeServiceB = storeServiceFactory.createStoreService();
  const nodeB = await Node.create(
    messagingService,
    storeServiceB,
    global["network"],
    nodeConfig,
    provider,
    lockService,
    hdNodeB.neuter().extendedKey,
    (index: string): Promise<string> => Promise.resolve(hdNodeB.derivePath(index).privateKey),
    0,
    new Logger("CreateClient", env.logLevel, true, "B"),
  );
  setupContext["B"] = {
    node: nodeB,
    store: storeServiceB,
  };

  let nodeC: Node;
  if (nodeCPresent) {
    const hdNodeC = fromExtendedKey(C_EXTENDED_PRIVATE_KEY).derivePath(CF_PATH);
    const storeServiceC = storeServiceFactory.createStoreService();
    nodeC = await Node.create(
      messagingService,
      storeServiceC,
      global["network"],
      nodeConfig,
      provider,
      lockService,
      hdNodeC.neuter().extendedKey,
      (index: string): Promise<string> => Promise.resolve(hdNodeC.derivePath(index).privateKey),
      0,
      new Logger("CreateClient", env.logLevel, true, "C"),
    );
    setupContext["C"] = {
      node: nodeC,
      store: storeServiceC,
    };
  }

  return setupContext;
}

export async function generateNewFundedWallet(fundedPrivateKey: string, provider: JsonRpcProvider) {
  const fundedWallet = new Wallet(fundedPrivateKey, provider);
  const wallet = Wallet.createRandom().connect(provider);

  const transactionToA: TransactionRequest = {
    to: wallet.address,
    value: parseEther("20").toHexString(),
  };
  await fundedWallet.sendTransaction(transactionToA);
  return wallet;
}

export async function generateNewFundedExtendedPrvKeys(
  fundedPrivateKey: string,
  provider: JsonRpcProvider,
) {
  const fundedWallet = new Wallet(fundedPrivateKey, provider);
  const A_EXTENDED_PRV_KEY = computeRandomExtendedPrvKey();
  const B_EXTENDED_PRV_KEY = computeRandomExtendedPrvKey();

  const signerAPrivateKey = fromExtendedKey(A_EXTENDED_PRV_KEY).derivePath(CF_PATH).privateKey;
  const signerBPrivateKey = fromExtendedKey(B_EXTENDED_PRV_KEY).derivePath(CF_PATH).privateKey;

  const signerAAddress = new Wallet(signerAPrivateKey).address;
  const signerBAddress = new Wallet(signerBPrivateKey).address;

  const transactionToA: TransactionRequest = {
    to: signerAAddress,
    value: parseEther("1").toHexString(),
  };
  const transactionToB: TransactionRequest = {
    to: signerBAddress,
    value: parseEther("1").toHexString(),
  };
  await fundedWallet.sendTransaction(transactionToA);
  await fundedWallet.sendTransaction(transactionToB);
  return {
    A_EXTENDED_PRV_KEY,
    B_EXTENDED_PRV_KEY,
  };
}
