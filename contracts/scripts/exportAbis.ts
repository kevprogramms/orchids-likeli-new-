import hre from "hardhat";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_NAMES = [
  "MarketFactory",
  "CPMMMarket",
  "CollateralVault",
  "ResolutionOracle",
  "MockUSDC"
] as const;

export async function exportAbis() {
  const outDir = path.join(hre.config.paths.artifacts, "abi");
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of CONTRACT_NAMES) {
    const artifact = await hre.artifacts.readArtifact(name);
    const minimal = {
      contractName: artifact.contractName,
      abi: artifact.abi
    };

    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(minimal, null, 2));
  }
}

if (require.main === module) {
  exportAbis().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
