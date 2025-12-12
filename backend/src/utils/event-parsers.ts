import { Log, Interface } from 'ethers'
import { logger } from '../lib/logger.js'

// Event parsing interfaces
interface MarketCreatedEvent {
  marketId: bigint
  marketAddress: string
  creator: string
  question: string
  marketType: number // 0 = Sandbox, 1 = Main
  resolutionDate: number
}

interface TradeEvent {
  tradeId: bigint
  marketId: string
  user: string
  outcome: number // 0 = YES, 1 = NO
  isBuy: boolean
  shares: bigint
  cost: bigint
  newPrice: bigint
  timestamp: number
}

interface LiquidityEvent {
  eventId: bigint
  marketId: string
  provider: string
  eventType: number // 0 = ADDED, 1 = REMOVED
  amount: bigint
  shares: bigint
  timestamp: number
}

// ABI interfaces for event parsing
const MARKET_FACTORY_INTERFACE = new Interface([
  "event MarketCreated(uint256 indexed marketId, address indexed marketAddress, address indexed creator, string question, uint8 marketType, uint256 resolutionDate)",
  "event MarketGraduated(uint256 indexed marketId, address indexed oldAddress, address indexed newAddress, uint256 timestamp)"
])

const SANDBOX_MARKET_INTERFACE = new Interface([
  "event Trade(address indexed user, uint8 indexed outcome, bool isBuy, uint256 shares, uint256 cost, uint256 newPrice, uint256 timestamp)",
  "event LiquidityAdded(address indexed provider, uint256 amount)",
  "event LiquidityRemoved(address indexed provider, uint256 amount)",
  "event PriceUpdate(uint256 yesPrice, uint256 noPrice, uint256 yesProb, uint256 noProb)"
])

const MAIN_MARKET_INTERFACE = new Interface([
  "event OrderPlaced(uint256 indexed orderId, address indexed user, uint8 outcome, bool isBid, uint256 price, uint256 size)",
  "event OrderFilled(uint256 indexed orderId, uint256 filledSize, uint256 remainingSize)",
  "event OrderCancelled(uint256 indexed orderId)"
])

export function parseMarketCreatedEvent(log: Log): MarketCreatedEvent | null {
  try {
    const parsed = MARKET_FACTORY_INTERFACE.parseLog({
      topics: log.topics,
      data: log.data
    })

    return {
      marketId: parsed.args.marketId,
      marketAddress: parsed.args.marketAddress,
      creator: parsed.args.creator,
      question: parsed.args.question,
      marketType: parsed.args.marketType,
      resolutionDate: parsed.args.resolutionDate
    }
  } catch (error) {
    logger.debug('Failed to parse MarketCreated event:', error)
    return null
  }
}

export function parseTradeEvent(log: Log): TradeEvent | null {
  try {
    const parsed = SANDBOX_MARKET_INTERFACE.parseLog({
      topics: log.topics,
      data: log.data
    })

    return {
      tradeId: BigInt(0), // Would need actual trade ID from event
      marketId: '', // Would need market ID mapping
      user: parsed.args.user,
      outcome: parsed.args.outcome,
      isBuy: parsed.args.isBuy,
      shares: parsed.args.shares,
      cost: parsed.args.cost,
      newPrice: parsed.args.newPrice,
      timestamp: parsed.args.timestamp
    }
  } catch (error) {
    logger.debug('Failed to parse Trade event:', error)
    return null
  }
}

export function parseLiquidityEvent(log: Log): LiquidityEvent | null {
  try {
    const eventName = log.topics[0] // First topic is event signature
    
    if (eventName === '0x1234567890abcdef') { // Placeholder hash for LiquidityAdded
      const parsed = SANDBOX_MARKET_INTERFACE.parseLog({
        topics: log.topics,
        data: log.data
      })

      return {
        eventId: BigInt(0), // Would need actual event ID
        marketId: '', // Would need market ID mapping
        provider: parsed.args.provider,
        eventType: 0, // ADDED
        amount: parsed.args.amount,
        shares: BigInt(0), // Would need to calculate from event data
        timestamp: Math.floor(Date.now() / 1000) // Would need from event
      }
    } else if (eventName === '0xabcdef1234567890') { // Placeholder hash for LiquidityRemoved
      const parsed = SANDBOX_MARKET_INTERFACE.parseLog({
        topics: log.topics,
        data: log.data
      })

      return {
        eventId: BigInt(0),
        marketId: '',
        provider: parsed.args.provider,
        eventType: 1, // REMOVED
        amount: parsed.args.amount,
        shares: BigInt(0),
        timestamp: Math.floor(Date.now() / 1000)
      }
    }
    
    return null
  } catch (error) {
    logger.debug('Failed to parse Liquidity event:', error)
    return null
  }
}

export function parseMarketGraduatedEvent(log: Log) {
  try {
    const parsed = MARKET_FACTORY_INTERFACE.parseLog({
      topics: log.topics,
      data: log.data
    })

    return {
      marketId: parsed.args.marketId,
      oldAddress: parsed.args.oldAddress,
      newAddress: parsed.args.newAddress,
      timestamp: parsed.args.timestamp
    }
  } catch (error) {
    logger.debug('Failed to parse MarketGraduated event:', error)
    return null
  }
}
