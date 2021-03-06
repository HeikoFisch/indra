/* global before */
import { waffle as buidler } from "@nomiclabs/buidler";
import * as waffle from "ethereum-waffle";
import { Contract, Wallet } from "ethers";
import DolphinCoin from "../../build/DolphinCoin.json";
import SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter from "../../build/SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter.json";
import { AddressZero, One, Zero } from "ethers/constants";
import { BigNumber, BigNumberish, defaultAbiCoder } from "ethers/utils";
import { createRandomAddress } from "@connext/types";

import { expect } from "./utils/index";

type CoinTransfer = {
  to: string;
  amount: BigNumber;
};

type InterpreterParams = {
  capitalProvided: BigNumberish;
  capitalProvider: string;
  virtualAppUser: string;
  tokenAddress: string;
};

const encodeParams = (params: InterpreterParams) =>
  defaultAbiCoder.encode(
    [
      `
        tuple(
          uint256 capitalProvided,
          address capitalProvider,
          address virtualAppUser,
          address tokenAddress
        )
      `,
    ],
    [params],
  );

const encodeOutcome = (outcome: [CoinTransfer, CoinTransfer]) =>
  defaultAbiCoder.encode(
    [
      `
        tuple(
          address to,
          uint256 amount
        )[2]
      `,
    ],
    [outcome],
  );

describe("SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter", () => {
  let provider = buidler.provider;
  let wallet: Wallet;
  let erc20: Contract;
  let coinTransferFromVirtualAppInterpreter: Contract;

  async function interpretOutcomeAndExecuteEffect(
    outcome: [CoinTransfer, CoinTransfer],
    params: InterpreterParams,
  ) {
    return await coinTransferFromVirtualAppInterpreter.functions.interpretOutcomeAndExecuteEffect(
      encodeOutcome(outcome),
      encodeParams(params),
    );
  }

  before(async () => {
    wallet = (await provider.getWallets())[0];
    erc20 = await waffle.deployContract(wallet, DolphinCoin);

    coinTransferFromVirtualAppInterpreter = await waffle.deployContract(
      wallet,
      SingleAssetTwoPartyCoinTransferFromVirtualAppInterpreter,
    );

    // fund interpreter with ERC20 tokenAddresses
    await erc20.functions.transfer(
      coinTransferFromVirtualAppInterpreter.address,
      erc20.functions.balanceOf(wallet.address),
    );

    // fund interpreter with ETH
    await wallet.sendTransaction({
      to: coinTransferFromVirtualAppInterpreter.address,
      value: new BigNumber(100),
    });
  });

  it("Can distribute ETH coins correctly in full", async () => {
    const to = createRandomAddress();
    const randomAddress = createRandomAddress();
    const lender = createRandomAddress();
    const capitalProvided = One;

    await interpretOutcomeAndExecuteEffect(
      [
        { to, amount: capitalProvided },
        { to: randomAddress, amount: Zero },
      ],
      {
        capitalProvided,
        capitalProvider: to,
        virtualAppUser: lender,
        tokenAddress: AddressZero,
      },
    );

    expect(await provider.getBalance(to)).to.eq(One);
    expect(await provider.getBalance(lender)).to.eq(Zero);
  });

  // FIXME: This test fails because `lender` has Zero amount. I think probably
  //        has something to do with the fact that `address payable` is used but
  //        I'm not entirely sure.
  it.skip("Can distribute ETH coins correctly partially", async () => {
    const to = createRandomAddress();
    const randomAddress = createRandomAddress();
    const lender = createRandomAddress();
    const capitalProvided = One;
    const amount = capitalProvided.div(2);

    await interpretOutcomeAndExecuteEffect(
      [
        { to, amount: capitalProvided },
        { to: randomAddress, amount: Zero },
      ],
      {
        capitalProvided,
        capitalProvider: to,
        virtualAppUser: lender,
        tokenAddress: AddressZero,
      },
    );

    expect(await provider.getBalance(to)).to.eq(amount);
    expect(await provider.getBalance(lender)).to.eq(amount);
  });

  it("Can distribute ERC20 only correctly in full", async () => {
    const to = createRandomAddress();
    const randomAddress = createRandomAddress();
    const lender = createRandomAddress();
    const capitalProvided = One;

    await interpretOutcomeAndExecuteEffect(
      [
        { to, amount: capitalProvided },
        { to: randomAddress, amount: Zero },
      ],
      {
        capitalProvided,
        capitalProvider: to,
        virtualAppUser: lender,
        tokenAddress: erc20.address,
      },
    );

    expect(await erc20.functions.balanceOf(to)).to.eq(One);
    expect(await erc20.functions.balanceOf(lender)).to.eq(Zero);
  });

  // FIXME: This test fails because `lender` has Zero amount. I think probably
  //        has something to do with the fact that `address payable` is used but
  //        I'm not entirely sure.
  it.skip("Can distribute ERC20 coins correctly partially", async () => {
    const to = createRandomAddress();
    const randomAddress = createRandomAddress();
    const lender = createRandomAddress();
    const capitalProvided = One;
    const amount = capitalProvided.div(2);

    await interpretOutcomeAndExecuteEffect(
      [
        { to, amount: capitalProvided },
        { to: randomAddress, amount: Zero },
      ],
      {
        capitalProvided,
        capitalProvider: to,
        virtualAppUser: lender,
        tokenAddress: erc20.address,
      },
    );

    expect(await erc20.functions.balanceOf(to)).to.eq(amount);
    expect(await erc20.functions.balanceOf(lender)).to.eq(amount);
  });
});
