# Likeli CPMM Contracts (Hardhat + TypeScript)

This workspace contains the on-chain CPMM (constant-product market maker) contracts described in `docs/smart-contract-plan.md`.

## Layout

- `contracts/` – Solidity contracts
- `test/` – unit tests (Hardhat + viem)
- `scripts/` – deploy + ABI export scripts
- `artifacts/abi/` – exported ABIs for the frontend/backend

## Setup

```bash
cd contracts
npm install
cp .env.example .env
```

## Build

```bash
npm run build
```

## Test

```bash
npx hardhat test
```

## Deploy (Arbitrum Sepolia)

1. Configure `.env`:
   - `ARBITRUM_SEPOLIA_RPC_URL`
   - `DEPLOYER_PRIVATE_KEY`
   - `COLLATERAL_TOKEN` (optional; if unset on local, the script can deploy a `MockUSDC`)
   - `FEE_RECIPIENT` (optional)

2. Deploy:

```bash
npm run deploy:arbitrumSepolia
```

The deploy script prints addresses and writes them to `deployments/arbitrumSepolia.json`.

## Export ABIs

```bash
npm run export-abis
```

This writes minimal ABI JSON files to `contracts/artifacts/abi/*.json`.

## Deployed addresses

After deploying, update the addresses below (and keep `deployments/arbitrumSepolia.json` in sync):

- Arbitrum Sepolia
  - `CollateralVault`: `TBD`
  - `ResolutionOracle`: `TBD`
  - `MarketFactory`: `TBD`

## Contracts

- `MarketFactory.sol` – registry + market creation fee + market deployment
- `CPMMMarket.sol` – binary market trading (buy/sell), constant-product invariant, settlement + payout claims
- `CollateralVault.sol` – USDC-style collateral accounting (deposit/withdraw), market escrow, fee routing
- `ResolutionOracle.sol` – minimal oracle for resolving markets (owner-driven for now)
- `libraries/CPMMMath.sol` – CPMM math helpers
