import {
  recoverAddress,
  arrayify,
  hexlify,
  randomBytes,
  SigningKey,
  joinSignature,
  BigNumber,
} from "ethers/utils";
import { isBN, toBN } from "./math";

// stolen from https://github.com/microsoft/TypeScript/issues/3192#issuecomment-261720275
export const enumify = <T extends {[index: string]: U}, U extends string>(x: T): T => x;

export const bigNumberifyJson = (json: any): object =>
  typeof json === "string" ? json : JSON.parse(
    JSON.stringify(json),
    (key: string, value: any): any => (value && value["_hex"]) ? toBN(value._hex) : value,
  );

export const deBigNumberifyJson = (json: object) =>
  JSON.parse(
    JSON.stringify(json),
    (key: string, val: any) => (val && isBN(val)) ? val.toHexString() : val,
  );

export const stringify = (obj: any, space: number = 2): string =>
  JSON.stringify(
    obj,
    (key: string, value: any): any => (value && value._hex) ? toBN(value._hex).toString() : value,
    space,
  );

export const delay = (ms: number): Promise<void> =>
  new Promise((res: any): any => setTimeout(res, ms));

export function createRandomBytesHexString(length: number) {
  return hexlify(randomBytes(length));
}

export function createRandomAddress() {
  return createRandomBytesHexString(20);
}

export function createRandom32ByteHexString() {
  return createRandomBytesHexString(32);
}

export async function recoverAddressWithEthers(digest: string, sig: string) {
  return recoverAddress(arrayify(digest), sig);
}

export async function signDigestWithEthers(privateKey: string, digest: string) {
  const signingKey = new SigningKey(privateKey);
  return joinSignature(signingKey.signDigest(arrayify(digest)));
}

export async function sortSignaturesBySignerAddress(
  digest: string,
  signatures: string[],
): Promise<string[]> {
  return (
    await Promise.all(
      signatures
        .slice()
        .map(async sig => ({ sig, addr: await recoverAddressWithEthers(digest, sig) })),
    )
  )
    .sort((A, B) => {
      return new BigNumber(A.addr).lt(B.addr) ? -1 : 1;
    })
    .map(x => x.sig);
}
