import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import hre from "hardhat";
import { parseUnits } from "viem";

import { exportAbis } from "./exportAbis";

dotenv.config();

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const feeRecipient = (process.env.FEE_RECIPIENT || deployer.account.address) as `0x${string}`;

  let collateralToken = process.env.COLLATERAL_TOKEN as `0x${string}` | undefined;

  if (!collateralToken) {
    const mock = await hre.viem.deployContract(
      "MockUSDC",
      ["Mock USDC", "USDC", 6, deployer.account.address],
      { client: { wallet: deployer } }
    );

    collateralToken = mock.address;
    console.log(`Deployed MockUSDC: ${mock.address}`);
  }

  const vault = await hre.viem.deployContract(
    "CollateralVault",
    [collateralToken, deployer.account.address, feeRecipient],
    { client: { wallet: deployer } }
  );

  const oracle = await hre.viem.deployContract("ResolutionOracle", [deployer.account.address], {
    client: { wallet: deployer }
  });

  const creationFee = parseUnits("50", 6);
  const minInitialLiquidity = parseUnits("100", 6);
  const tradingFeeBps = 50;

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

  // Allow the factory to authorize markets & collect fees.
  await vault.write.transferOwnership([factory.address], { account: deployer.account });

  console.log(`CollateralVault:  ${vault.address}`);
  console.log(`ResolutionOracle: ${oracle.address}`);
  console.log(`MarketFactory:    ${factory.address}`);

  const deploymentsDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const deployment = {
    network: hre.network.name,
    chainId,
    collateralToken,
    feeRecipient,
    CollateralVault: vault.address,
    ResolutionOracle: oracle.address,
    MarketFactory: factory.address
  };

  fs.writeFileSync(
    path.join(deploymentsDir, `${hre.network.name}.json`),
    JSON.stringify(deployment, null, 2)
  );

  await exportAbis();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
