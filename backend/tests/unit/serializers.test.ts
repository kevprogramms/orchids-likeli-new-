import { describe, it, expect, beforeEach } from 'vitest'
import { MarketSerializer, OrderBookSerializer, PriceHistorySerializer } from '../../src/serializers/index.js'

describe('MarketSerializer', () => {
  it('should serialize market to list item', () => {
    const market = {
      id: '1',
      marketId: 123n,
      marketAddress: '0x1234...',
      type: 'SANDBOX',
      status: 'ACTIVE',
      question: 'Will Bitcoin reach $100k by 2024?',
      category: 'Crypto',
      resolutionDate: new Date('2024-12-31'),
      totalVolume: 1000000n,
      totalTrades: 100n,
      tradeCount: 250n,
      createdAt: new Date('2024-01-01'),
      priceHistory: [
        {
          yesPrice: 500000000000000000n, // 0.5
          noPrice: 500000000000000000n  // 0.5
        }
      ]
    }

    const result = MarketSerializer.toListItem(market as any)

    expect(result).toEqual({
      id: '1',
      marketId: 123n,
      marketAddress: '0x1234...',
      type: 'SANDBOX',
      status: 'ACTIVE',
      question: 'Will Bitcoin reach $100k by 2024?',
      category: 'Crypto',
      resolutionDate: new Date('2024-12-31'),
      totalVolume: 1000000n,
      totalTrades: 100n,
      tradeCount: 250n,
      createdAt: new Date('2024-01-01'),
      currentPrices: {
        yes: 0.5,
        no: 0.5
      }
    })
  })
})

describe('OrderBookSerializer', () => {
  it('should serialize order book with bids and asks', () => {
    const bids = [
      { price: 550000000000000000n, size: 1000n }, // 0.55
      { price: 540000000000000000n, size: 2000n }  // 0.54
    ]

    const asks = [
      { price: 560000000000000000n, size: 1500n }, // 0.56
      { price: 570000000000000000n, size: 3000n }  // 0.57
    ]

    const result = OrderBookSerializer.toResponse(bids, asks)

    expect(result.bids).toHaveLength(2)
    expect(result.asks).toHaveLength(2)
    expect(result.bids[0].price).toBe(550000000000000000n) // Best bid first
    expect(result.asks[0].price).toBe(560000000000000000n) // Best ask first
    expect(result.spread).toBeDefined()
  })
})

describe('PriceHistorySerializer', () => {
  it('should serialize price history', () => {
    const snapshots = [
      {
        timestamp: new Date('2024-01-01'),
        yesPrice: 450000000000000000n, // 0.45
        noPrice: 550000000000000000n,  // 0.55
        yesProbability: 450000000000000000n,
        noProbability: 550000000000000000n
      },
      {
        timestamp: new Date('2024-01-02'),
        yesPrice: 500000000000000000n, // 0.5
        noPrice: 500000000000000000n,  // 0.5
        yesProbability: 500000000000000000n,
        noProbability: 500000000000000000n
      }
    ]

    const result = PriceHistorySerializer.toResponse(snapshots)

    expect(result).toEqual([
      {
        timestamp: new Date('2024-01-01'),
        yesPrice: 0.45,
        noPrice: 0.55,
        yesProbability: 0.45,
        noProbability: 0.55
      },
      {
        timestamp: new Date('2024-01-02'),
        yesPrice: 0.5,
        noPrice: 0.5,
        yesProbability: 0.5,
        noProbability: 0.5
      }
    ])
  })
})
