import { Contract, JsonRpcProvider, ContractInterface } from 'ethers'
import fs from 'fs'
import path from 'path'
import { logger } from '../lib/logger.js'

// Load ABIs from artifacts
function loadABI(contractName: string): ContractInterface {
  const abiPath = path.join(process.cwd(), 'contracts', 'artifacts', 'abi', `${contractName}.json`)
  
  try {
    const abiFile = fs.readFileSync(abiPath, 'utf-8')
    const { abi } = JSON.parse(abiFile)
    return abi
  } catch (error) {
    logger.warn(`Could not load ABI for ${contractName}:`, error)
    // Return minimal ABI as fallback
    return [
      "function marketCount() view returns (uint256)",
      "function getMarket(uint256) view returns (address)",
      "event MarketCreated(uint256 indexed marketId, address indexed marketAddress, address indexed creator, string question, uint8 marketType, uint256 resolutionDate)"
    ]
  }
}

// MarketFactory contract interface
export function MarketFactory__getContract(address: string, provider: JsonRpcProvider): Contract {
  const abi = loadABI('MarketFactory')
  return new Contract(address, abi, provider)
}

// SandboxMarket contract interface
export function SandboxMarket__getContract(address: string, provider: JsonRpcProvider): Contract {
  const abi = loadABI('SandboxMarket')
  return new Contract(address, abi, provider)
}

// MainMarket contract interface  
export function MainMarket__getContract(address: string, provider: JsonRpcProvider): Contract {
  const abi = loadABI('MainMarket')
  return new Contract(address, abi, provider)
}

// Common contract addresses (will be set via environment variables)
export const CONTRACT_ADDRESSES = {
  MARKET_FACTORY: process.env.MARKET_FACTORY_ADDRESS || '',
  COLLATERAL_VAULT: process.env.COLLATERAL_VAULT_ADDRESS || '',
  POSITION_MANAGER: process.env.POSITION_MANAGER_ADDRESS || '',
  RESOLUTION_ORACLE: process.env.RESOLUTION_ORACLE_ADDRESS || ''
}
