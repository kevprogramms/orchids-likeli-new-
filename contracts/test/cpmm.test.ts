import { expect } from "chai";
import hre from "hardhat";
import { parseUnits } from "viem";

describe("CPMM contracts core", () => {
  it("creates a market, executes buys/sells, preserves invariant directionally, resolves, and pays out", async () => {
    const [deployer, alice, bob] = await hre.viem.getWalletClients();

    const usdc = await hre.viem.deployContract(
      "MockUSDC",
      ["Mock USDC", "USDC", 6, deployer.account.address],
      { client: { wallet: deployer } }
    );

    const vault = await hre.viem.deployContract(
      "CollateralVault",
      [usdc.address, deployer.account.address, deployer.account.address],
      { client: { wallet: deployer } }
    );

    const oracle = await hre.viem.deployContract("ResolutionOracle", [deployer.account.address], {
      client: { wallet: deployer }
    });

    const creationFee = parseUnits("50", 6);
    const minInitialLiquidity = parseUnits("100", 6);
    const tradingFeeBps = 100; // 1%

    const factory = await hre.viem.deployContract(
      "MarketFactory",
      [
        deployer.account.address,
        vault.address,
        oracle.address,
        creationFee,
        minInitialLiquidity,
        tradingFeeBps
      ],
      { client: { wallet: deployer } }
    );

    await vault.write.transferOwnership([factory.address], { account: deployer.account });

    const mintAmount = parseUnits("10000", 6);
    await usdc.write.mint([alice.account.address, mintAmount], { account: deployer.account });
    await usdc.write.mint([bob.account.address, mintAmount], { account: deployer.account });

    const depositAmount = parseUnits("1000", 6);

    await usdc.write.approve([vault.address, depositAmount], { account: alice.account });
    await vault.write.deposit([depositAmount], { account: alice.account });

    await usdc.write.approve([vault.address, depositAmount], { account: bob.account });
    await vault.write.deposit([depositAmount], { account: bob.account });

    const initialLiquidity = parseUnits("200", 6);
    const resolutionDate = BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24);

    const { request: createReq, result: marketAddress } = await factory.simulate.createMarket(
      ["Will it rain tomorrow?", "weather", resolutionDate, "Example rules", initialLiquidity],
      { account: alice.account }
    );

    await factory.write.createMarket(createReq);

    expect(await factory.read.marketCount()).to.equal(1n);
    expect(await factory.read.markets([0n])).to.equal(marketAddress);
    expect(await factory.read.isValidMarket([marketAddress])).to.equal(true);
    expect(await vault.read.isMarket([marketAddress])).to.equal(true);

    const market = await hre.viem.getContractAt("CPMMMarket", marketAddress);

    expect(await market.read.poolYes()).to.equal(initialLiquidity);
    expect(await market.read.poolNo()).to.equal(initialLiquidity);

    expect(await vault.read.userBalance([alice.account.address])).to.equal(
      depositAmount - creationFee - initialLiquidity
    );

    expect(await vault.read.feeBalance()).to.equal(creationFee);

    // Buy YES
    const buyYesAmount = parseUnits("10", 6);

    const k1 = (await market.read.poolYes()) * (await market.read.poolNo());

    const { request: buyYesReq, result: yesSharesOut } = await market.simulate.buy(
      [0, buyYesAmount, 0n],
      { account: alice.account }
    );
    await market.write.buy(buyYesReq);

    expect(await market.read.yesShares([alice.account.address])).to.equal(yesSharesOut);

    const k2 = (await market.read.poolYes()) * (await market.read.poolNo());
    expect(k2).to.be.greaterThanOrEqual(k1);

    const buyFee = (buyYesAmount * BigInt(tradingFeeBps)) / 10_000n;
    expect(await vault.read.feeBalance()).to.equal(creationFee + buyFee);

    // Buy NO
    const buyNoAmount = parseUnits("20", 6);

    const k3 = (await market.read.poolYes()) * (await market.read.poolNo());
    const { request: buyNoReq } = await market.simulate.buy([1, buyNoAmount, 0n], {
      account: bob.account
    });
    await market.write.buy(buyNoReq);

    const k4 = (await market.read.poolYes()) * (await market.read.poolNo());
    expect(k4).to.be.greaterThanOrEqual(k3);

    // Sell half of Alice's YES shares
    const aliceYesShares = await market.read.yesShares([alice.account.address]);
    const sellShares = aliceYesShares / 2n;

    const aliceVaultBeforeSell = await vault.read.userBalance([alice.account.address]);

    const k5 = (await market.read.poolYes()) * (await market.read.poolNo());

    const { request: sellReq, result: collateralOut } = await market.simulate.sell(
      [0, sellShares, 0n],
      { account: alice.account }
    );
    await market.write.sell(sellReq);

    expect(await market.read.yesShares([alice.account.address])).to.equal(aliceYesShares - sellShares);

    const aliceVaultAfterSell = await vault.read.userBalance([alice.account.address]);
    expect(aliceVaultAfterSell - aliceVaultBeforeSell).to.equal(collateralOut);

    const k6 = (await market.read.poolYes()) * (await market.read.poolNo());
    expect(k6).to.be.greaterThanOrEqual(k5);

    // Resolve YES and claim
    await oracle.write.resolveMarket([marketAddress, 0], { account: deployer.account });
    expect(await market.read.status()).to.equal(1n);

    const remainingYes = await market.read.yesShares([alice.account.address]);

    const aliceVaultBeforeClaim = await vault.read.userBalance([alice.account.address]);
    const { request: claimReq, result: claimed } = await market.simulate.claimPayout([], {
      account: alice.account
    });
    await market.write.claimPayout(claimReq);

    expect(claimed).to.equal(remainingYes);
    expect(await market.read.yesShares([alice.account.address])).to.equal(0n);

    const aliceVaultAfterClaim = await vault.read.userBalance([alice.account.address]);
    expect(aliceVaultAfterClaim - aliceVaultBeforeClaim).to.equal(remainingYes);
  });
});
