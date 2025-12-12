import { Prisma } from '@prisma/client'

// Extended types with relations
export type MarketWithRelations = Prisma.MarketGetPayload<{
  include: {
    priceHistory: true
    trades: true
    liquidityEvents: true
    orders: true
    positions: true
  }
}>

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    market: true
  }
}>

export type TradeWithRelations = Prisma.TradeGetPayload<{
  include: {
    market: true
  }
}>

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  pagination?: {
    page: number
    limit: number
    total: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface MarketListItem {
  id: string
  marketId: bigint
  marketAddress: string
  type: 'SANDBOX' | 'MAIN'
  status: 'ACTIVE' | 'RESOLVED' | 'VOID' | 'GRADUATED'
  question: string
  category: string
  resolutionDate: Date
  totalVolume: bigint
  totalTrades: bigint
  tradeCount: bigint
  createdAt: Date
  currentPrices?: {
    yes: number
    no: number
  }
}

export interface OrderBookEntry {
  price: bigint
  size: bigint
  total: bigint
}

export interface OrderBook {
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  spread?: {
    absolute: bigint
    percentage: number
  }
}

export interface PricePoint {
  timestamp: Date
  yesPrice: number
  noPrice: number
  yesProbability: number
  noProbability: number
}

export interface UserPortfolio {
  user: string
  balances: {
    free: bigint
    locked: bigint
    total: bigint
  }
  positions: Array<{
    marketId: string
    marketQuestion: string
    outcome: 'YES' | 'NO'
    shares: bigint
    avgPrice: bigint
    unrealizedPnl: bigint
    realizedPnl: bigint
    marketStatus: string
  }>
  stats: {
    totalDeposited: bigint
    totalWithdrawn: bigint
    totalFeesPaid: bigint
    realizedPnl: bigint
    winRate: number
    totalTrades: number
  }
}

export interface MarketStats {
  totalMarkets: number
  activeMarkets: number
  resolvedMarkets: number
  totalVolume: bigint
  totalTrades: number
  averageDailyVolume: bigint
  topCategories: Array<{
    category: string
    count: number
    volume: bigint
  }>
}

// Ethers.js event types
export interface LogEvent {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
  logIndex: string
}

// Indexer types
export interface IndexingOptions {
  startBlock?: number
  endBlock?: number
  batchSize?: number
  maxConcurrent?: number
}

export interface SyncProgress {
  currentBlock: number
  totalBlocks: number
  processedEvents: number
  estimatedTimeRemaining?: number
  speed: number // events per second
}

// Cache types
export interface CacheEntry<T> {
  data: T
  expiresAt: number
  lastUpdated: Date
}
