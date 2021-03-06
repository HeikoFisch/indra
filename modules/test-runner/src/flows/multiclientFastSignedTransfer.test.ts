import { signDigest } from "@connext/crypto";
import {
  ConditionalTransferTypes,
  createRandom32ByteHexString,
  EventNames,
  EventPayloads,
  FastSignedTransferParameters,
  IConnextClient,
  ResolveFastSignedTransferParameters,
  toBN,
} from "@connext/types";
import { Wallet } from "ethers";
import { AddressZero } from "ethers/constants";
import {
  bigNumberify,
  solidityKeccak256,
  SigningKey,
} from "ethers/utils";
import { before } from "mocha";
import { Client } from "ts-nats";

import { createClient, fundChannel, getNatsClient } from "../util";

describe("Full Flow: Multi-client transfer", () => {
  let gateway: IConnextClient;
  let indexerA: IConnextClient;
  let indexerB: IConnextClient;
  let nats: Client;
  let signerWalletA: Wallet;
  let signerWalletB: Wallet;

  before(async () => {
    nats = getNatsClient();
  });

  beforeEach(async () => {
    gateway = await createClient();
    indexerA = await createClient();
    indexerB = await createClient();

    signerWalletA = Wallet.createRandom();
    signerWalletB = Wallet.createRandom();
  });

  afterEach(async () => {
    await gateway.messaging.disconnect();
    await indexerA.messaging.disconnect();
    await indexerB.messaging.disconnect();
  });

  it.skip("Clients fast signed transfer assets between themselves", async function() {
    const startTime = Date.now();
    const DURATION = 90_000;

    let gatewayTransfers = {
      sent: 0,
      received: 0,
    };
    let indexerATransfers = {
      sent: 0,
      received: 0,
    };
    let indexerBTransfers = {
      sent: 0,
      received: 0,
    };

    await new Promise(async done => {
      await fundChannel(gateway, bigNumberify(100));
      await fundChannel(indexerA, bigNumberify(100));

      gateway.on(
        "RECEIVE_TRANSFER_FINISHED_EVENT",
        async (data: EventPayloads.ReceiveTransferFinished) => {
          if (Date.now() - startTime >= DURATION) {
            // sufficient time has elapsed, resolve
            done();
          }
          await new Promise(async res => {
            const newPaymentId = createRandom32ByteHexString();
            await nats.subscribe(`transfer.fast-signed.${newPaymentId}.reclaimed`, () => {
              console.log(`GATEWAY TRANSFER ${gatewayTransfers.sent} RECLAIMED`);
              res();
            });
            if (data.sender === indexerA.publicIdentifier) {
              await gateway.conditionalTransfer({
                amount: "1",
                conditionType: ConditionalTransferTypes.FastSignedTransfer,
                paymentId: newPaymentId,
                recipient: indexerA.publicIdentifier,
                signer: signerWalletA.address,
                assetId: AddressZero,
                maxAllocation: "10",
              } as FastSignedTransferParameters);
              gatewayTransfers.sent += 1;
              console.log(`GATEWAY TRANSFER ${gatewayTransfers.sent} TO INDEXER A`);
            } else if (data.sender === indexerB.publicIdentifier) {
              await gateway.conditionalTransfer({
                amount: "1",
                conditionType: ConditionalTransferTypes.FastSignedTransfer,
                paymentId: newPaymentId,
                recipient: indexerB.publicIdentifier,
                signer: signerWalletB.address,
                assetId: AddressZero,
                maxAllocation: "10",
              } as FastSignedTransferParameters);
              gatewayTransfers.sent += 1;
              console.log(`GATEWAY TRANSFER ${gatewayTransfers.sent} TO INDEXER B`);
            }
          });
        },
      );

      gateway.on(
        EventNames.CREATE_TRANSFER,
        async (eventData: EventPayloads.CreateFastTransfer,
      ) => {
          let withdrawerSigningKey: SigningKey;
          let indexer: IConnextClient;
          let indexerTransfers: {
            sent: number;
            received: number;
          };
          if (eventData.transferMeta.signer === signerWalletA.address) {
            withdrawerSigningKey = new SigningKey(signerWalletA.privateKey);
            indexer = indexerA;
            indexerTransfers = indexerATransfers;
          } else if (eventData.transferMeta.signer === signerWalletB.address) {
            withdrawerSigningKey = new SigningKey(signerWalletB.privateKey);
            indexer = indexerB;
            indexerTransfers = indexerBTransfers;
          }
          const data = createRandom32ByteHexString();
          const digest = solidityKeccak256(["bytes32", "bytes32"], [data, eventData.paymentId]);
          const signature = await signDigest(withdrawerSigningKey!.privateKey, digest);

          await indexer!.resolveCondition({
            conditionType: ConditionalTransferTypes.FastSignedTransfer,
            data,
            paymentId: eventData.paymentId,
            signature,
          } as ResolveFastSignedTransferParameters);
          indexerTransfers!.received += 1;
          console.log(
            `${indexer!.publicIdentifier} RESOLVED TRANSFER ${
              indexerTransfers!.received
            } TO GATEWAY`,
          );

          await indexer!.transfer({
            amount: toBN(eventData.amount),
            assetId: AddressZero,
            recipient: eventData.sender,
          });
          indexerTransfers!.sent += 1;
          console.log(
            `${indexer!.publicIdentifier} SENT TRANSFER ${indexerTransfers!.received} TO GATEWAY`,
          );
        },
      );

      await new Promise(async res => {
        const newPaymentId = createRandom32ByteHexString();
        await nats.subscribe(`transfer.fast-signed.${newPaymentId}.reclaimed`, () => {
          res();
        });
        await gateway.conditionalTransfer({
          amount: "1",
          conditionType: ConditionalTransferTypes.FastSignedTransfer,
          paymentId: createRandom32ByteHexString(),
          recipient: indexerA.publicIdentifier,
          signer: signerWalletA.address,
          assetId: AddressZero,
          maxAllocation: "10",
        } as FastSignedTransferParameters);
        gatewayTransfers.sent += 1;
        console.log(`GATEWAY TRANSFER ${gatewayTransfers.sent} TO INDEXER A`);
      });
      await gateway.conditionalTransfer({
        amount: "1",
        conditionType: ConditionalTransferTypes.FastSignedTransfer,
        paymentId: createRandom32ByteHexString(),
        recipient: indexerB.publicIdentifier,
        signer: signerWalletB.address,
        assetId: AddressZero,
        maxAllocation: "10",
      } as FastSignedTransferParameters);
      gatewayTransfers.sent += 1;
      console.log(`GATEWAY TRANSFER ${gatewayTransfers.sent} TO INDEXER B`);
    });
  });
});
