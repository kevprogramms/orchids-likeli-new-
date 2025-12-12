import type { 
  MarketListItem, 
  OrderBook, 
  OrderBookEntry, 
  PricePoint, 
  UserPortfolio, 
  MarketStats 
} from '../types/index.js'
import type { Market, Order, Trade, Position, CollateralBalance } from '@prisma/client'

export class MarketSerializer {
  static toListItem(market: Market & { 
    priceHistory?: { yesPrice: bigint; noPrice: bigint }[] 
  }): MarketListItem {
    const latestPrice = market.priceHistory?.[market.priceHistory.length - 1]
    
    return {
      id: market.id,
      marketId: market.marketId,
      marketAddress: market.marketAddress,
      type: market.type as 'SANDBOX' | 'MAIN',
      status: market.status,
      question: market.question,
      category: market.category,
      resolutionDate: market.resolutionDate,
      totalVolume: market.totalVolume,
      totalTrades: market.totalTrades,
      tradeCount: market.tradeCount,
      createdAt: market.createdAt,
      currentPrices: latestPrice ? {
        yes: Number(latestPrice.yesPrice) / 1e18,
        no: Number(latestPrice.noPrice) / 1e18
      } : undefined
    }
  }

  static toDetail(market: any) {
    const latestPrice = market.priceHistory?.[market.priceHistory.length - 1]
    
    return {
      id: market.id,
      marketId: market.marketId,
      marketAddress: market.marketAddress,
      type: market.type,
      status: market.status,
      question: market.question,
      category: market.category,
      rules: market.rules,
      resolutionDate: market.resolutionDate,
      creator: market.creator,
      winningOutcome: market.winningOutcome,
      totalVolume: market.totalVolume.toString(),
      totalTrades: market.totalTrades.toString(),
      tradeCount: market.tradeCount.toString(),
      createdAt: market.createdAt,
      resolvedAt: market.resolvedAt,
      graduatedAt: market.graduatedAt,
      currentPrice: latestPrice ? {
        yes: (Number(latestPrice.yesPrice) / 1e18).toFixed(4),
        no: (Number(latestPrice.noPrice) / 1e18).toFixed(4),
        yesProbability: (Number(latestPrice.yesProbability) / 1e18).toFixed(2),
        noProbability: (Number(latestPrice.noProbability) / 1e18).toFixed(2)
      } : null,
      stats: {
        volume24h: '0', // Would need to calculate from recent trades
        volume7d: '0',
        tradeCount24h: 0
      }
    }
  }
}

export class OrderBookSerializer {
  static toResponse(
    bids: Array<{ price: bigint; size: bigint }>,
    asks: Array<{ price: bigint; size: bigint }>
  ): OrderBook {
    const serializedBids: OrderBookEntry[] = bids
      .sort((a, b) => Number(b.price - a.price))
      .slice(0, 20)
      .map((bid, index, array) => ({
        price: bid.price,
        size: bid.size,
        total: array.slice(0, index + 1).reduce((sum, b) => sum + b.size, 0n)
      }))

    const serializedAsks: OrderBookEntry[] = asks
      .sort((a, b) => Number(a.price - b.price))
      .slice(0, 20)
      .map((ask, index, array) => ({
        price: ask.price,
        size: ask.size,
        total: array.slice(0, index + 1).reduce((sum, a) => sum + a.size, 0n)
      }))

    const spread = this.calculateSpread(bids, asks)
    
    return {
      bids: serializedBids,
      asks: serializedAsks,
      spread
    }
  }

  private static calculateSpread(bids: Array<{ price: bigint; size: bigint }>, asks: Array<{ price: bigint; size: bigint }>) {
    const bestBid = bids.length > 0 ? Math.max(...bids.map(b => Number(b.price))) : 0
    const bestAsk = asks.length > 0 ? Math.min(...asks.map(a => Number(a.price))) : 0
    
    if (bestBid === 0 || bestAsk === 0) return undefined
    
    const absolute = BigInt(bestAsk - bestBid)
    const percentage = ((bestAsk - bestBid) / bestBid) * 100
    
    return {
      absolute,
      percentage
    }
  }
}

export class PriceHistorySerializer {
  static toResponse(snapshots: Array<{ 
    timestamp: Date; 
    yesPrice: bigint; 
    noPrice: bigint; 
    yesProbability: bigint; 
    noProbability: bigint 
  }>): PricePoint[] {
    return snapshots.map(snapshot => ({
      timestamp: snapshot.timestamp,
      yesPrice: Number(snapshot.yesPrice) / 1e18,
      noPrice: Number(snapshot.noPrice) / 1e18,
      yesProbability: Number(snapshot.yesProbability) / 1e18,
      noProbability: Number(snapshot.noProbability) / 1e18
    }))
  }
}

export class PortfolioSerializer {
  static toResponse(
    balance: CollateralBalance,
    positions: Array<Position & { market: Market }>
  ): UserPortfolio {
    return {
      user: balance.user,
      balances: {
        free: balance.freeBalance,
        locked: balance.lockedBalance,
        total: balance.freeBalance + balance.lockedBalance
      },
      positions: positions.map(position => ({
        marketId: position.marketId,
        marketQuestion: position.market.question,
        outcome: position.outcome as 'YES' | 'NO',
        shares: position.shares,
        avgPrice: position.avgPrice,
        unrealizedPnl: position.unrealizedPnl,
        realizedPnl: position.realizedPnl,
        marketStatus: position.market.status
      })),
      stats: {
        totalDeposited: balance.totalDeposited,
        totalWithdrawn: balance.totalWithdrawn,
        totalFeesPaid: balance.totalFeesPaid,
        realizedPnl: balance.realizedPnl,
        winRate: this.calculateWinRate(positions),
        totalTrades: positions.length
      }
    }
  }

  private static calculateWinRate(positions: Array<Position & { market: Market }>): number {
    if (positions.length === 0) return 0
    
    const winningPositions = positions.filter(position => {
      // Logic to determine if position is winning based on current prices
      // This would need to be implemented based on market resolution state
      return position.market.status === 'RESOLVED' && position.realizedPnl > 0
    }).length
    
    return (winningPositions / positions.length) * 100
  }
}

export class StatsSerializer {
  static toResponse(stats: {
    totalMarkets: number
    activeMarkets: number
    resolvedMarkets: number
    totalVolume: bigint
    totalTrades: number
    averageDailyVolume: bigint
    topCategories: Array<{ category: string; count: number; volume: bigint }>
  }): MarketStats {
    return {
      totalMarkets: stats.totalMarkets,
      activeMarkets: stats.activeMarkets,
      resolvedMarkets: stats.resolvedMarkets,
      totalVolume: stats.totalVolume,
      totalTrades: stats.totalTrades,
      averageDailyVolume: stats.averageDailyVolume,
      topCategories: stats.topCategories.map(cat => ({
        ...cat,
        volume: cat.volume
      }))
    }
  }
}

export class TradeSerializer {
  static toResponse(trades: Array<Trade & { market: Market }>) {
    return trades.map(trade => ({
      id: trade.id,
      tradeId: trade.tradeId.toString(),
      marketId: trade.marketId,
      marketQuestion: trade.market.question,
      buyer: trade.buyer,
      seller: trade.seller,
      outcome: trade.outcome,
      side: trade.side,
      shares: trade.shares.toString(),
      price: (Number(trade.price) / 1e18).toFixed(4),
      amount: trade.amount.toString(),
      fee: trade.fee.toString(),
      timestamp: trade.timestamp,
      blockNumber: trade.blockNumber.toString(),
      transactionHash: trade.transactionHash
    }))
  }
}
