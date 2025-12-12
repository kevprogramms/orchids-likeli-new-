import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getPrisma } from '../lib/database.js'
import { StatsSerializer } from '../serializers/index.js'

export async function statsRoutes(fastify: FastifyInstance) {
  const prisma = getPrisma()

  // GET /stats - Get platform-wide statistics
  fastify.get('/stats', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['24h', '7d', '30d', 'all'], default: '7d' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                totalMarkets: { type: 'integer' },
                activeMarkets: { type: 'integer' },
                resolvedMarkets: { type: 'integer' },
                totalVolume: { type: 'string' },
                totalTrades: { type: 'integer' },
                averageDailyVolume: { type: 'string' },
                topCategories: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      category: { type: 'string' },
                      count: { type: 'integer' },
                      volume: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { period = '7d' } = request.query as { period: string }

    try {
      const now = new Date()
      const periodStart = new Date()
      
      // Calculate period start date
      switch (period) {
        case '24h':
          periodStart.setHours(now.getHours() - 24)
          break
        case '7d':
          periodStart.setDate(now.getDate() - 7)
          break
        case '30d':
          periodStart.setDate(now.getDate() - 30)
          break
        case 'all':
          periodStart.setFullYear(2020) // Far back to catch everything
          break
      }

      // Get market counts
      const [totalMarkets, activeMarkets, resolvedMarkets] = await Promise.all([
        prisma.market.count(),
        prisma.market.count({ where: { status: 'ACTIVE' } }),
        prisma.market.count({ where: { status: 'RESOLVED' } })
      ])

      // Get volume statistics
      const volumeStats = await prisma.market.aggregate({
        _sum: { totalVolume: true }
      })

      // Get trade count
      const totalTrades = await prisma.trade.count()

      // Calculate average daily volume
      const daysInPeriod = period === '24h' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 365
      const totalVolume = volumeStats._sum.totalVolume || 0n
      const averageDailyVolume = totalVolume / BigInt(daysInPeriod)

      // Get top categories
      const topCategories = await prisma.market.groupBy({
        by: ['category'],
        _count: { category: true },
        _sum: { totalVolume: true },
        orderBy: { _count: { category: 'desc' } },
        take: 10
      })

      const statsData = {
        totalMarkets,
        activeMarkets,
        resolvedMarkets,
        totalVolume,
        totalTrades,
        averageDailyVolume,
        topCategories: topCategories.map(cat => ({
          category: cat.category,
          count: cat._count.category,
          volume: cat._sum.totalVolume || 0n
        }))
      }

      const serializedStats = StatsSerializer.toResponse(statsData)

      reply.send({
        success: true,
        data: serializedStats
      })

    } catch (error) {
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch statistics',
        message: error.message
      })
    }
  })

  // GET /stats/markets/:id - Get market-specific statistics
  fastify.get('/stats/markets/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['24h', '7d', '30d'], default: '7d' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                marketId: { type: 'string' },
                volume24h: { type: 'string' },
                volume7d: { type: 'string' },
                volume30d: { type: 'string' },
                tradeCount24h: { type: 'integer' },
                tradeCount7d: { type: 'integer' },
                tradeCount30d: { type: 'integer' },
                uniqueTraders24h: { type: 'integer' },
                uniqueTraders7d: { type: 'integer' },
                uniqueTraders30d: { type: 'integer' },
                liquidityAdded24h: { type: 'string' },
                liquidityAdded7d: { type: 'string' },
                liquidityRemoved24h: { type: 'string' },
                liquidityRemoved7d: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { period = '7d' } = request.query as { period: string }

    try {
      const now = new Date()
      
      // Calculate period dates
      const periods = {
        '24h': new Date(now.getTime() - 24 * 60 * 60 * 1000),
        '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }

      const periodStart = periods[period as keyof typeof periods]

      // Get market statistics for different periods
      const [volume24h, volume7d, volume30d, tradeCount24h, tradeCount7d, tradeCount30d] = await Promise.all([
        // Volume in last 24h
        prisma.trade.aggregate({
          where: {
            marketId: id,
            timestamp: { gte: periods['24h'] }
          },
          _sum: { amount: true }
        }),
        // Volume in last 7d
        prisma.trade.aggregate({
          where: {
            marketId: id,
            timestamp: { gte: periods['7d'] }
          },
          _sum: { amount: true }
        }),
        // Volume in last 30d
        prisma.trade.aggregate({
          where: {
            marketId: id,
            timestamp: { gte: periods['30d'] }
          },
          _sum: { amount: true }
        }),
        // Trade count in last 24h
        prisma.trade.count({
          where: {
            marketId: id,
            timestamp: { gte: periods['24h'] }
          }
        }),
        // Trade count in last 7d
        prisma.trade.count({
          where: {
            marketId: id,
            timestamp: { gte: periods['7d'] }
          }
        }),
        // Trade count in last 30d
        prisma.trade.count({
          where: {
            marketId: id,
            timestamp: { gte: periods['30d'] }
          }
        })
      ])

      // Get unique traders
      const [uniqueTraders24h, uniqueTraders7d, uniqueTraders30d] = await Promise.all([
        prisma.trade.findMany({
          where: {
            marketId: id,
            timestamp: { gte: periods['24h'] }
          },
          select: { buyer: true, seller: true },
          distinct: ['buyer', 'seller']
        }).then(trades => new Set(trades.flatMap(t => [t.buyer, t.seller].filter(Boolean))).size),
        prisma.trade.findMany({
          where: {
            marketId: id,
            timestamp: { gte: periods['7d'] }
          },
          select: { buyer: true, seller: true },
          distinct: ['buyer', 'seller']
        }).then(trades => new Set(trades.flatMap(t => [t.buyer, t.seller].filter(Boolean))).size),
        prisma.trade.findMany({
          where: {
            marketId: id,
            timestamp: { gte: periods['30d'] }
          },
          select: { buyer: true, seller: true },
          distinct: ['buyer', 'seller']
        }).then(trades => new Set(trades.flatMap(t => [t.buyer, t.seller].filter(Boolean))).size)
      ])

      // Get liquidity events
      const [liquidityAdded24h, liquidityAdded7d, liquidityRemoved24h, liquidityRemoved7d] = await Promise.all([
        prisma.liquidityEvent.aggregate({
          where: {
            marketId: id,
            timestamp: { gte: periods['24h'] },
            eventType: 'ADDED'
          },
          _sum: { amount: true }
        }),
        prisma.liquidityEvent.aggregate({
          where: {
            marketId: id,
            timestamp: { gte: periods['7d'] },
            eventType: 'ADDED'
          },
          _sum: { amount: true }
        }),
        prisma.liquidityEvent.aggregate({
          where: {
            marketId: id,
            timestamp: { gte: periods['24h'] },
            eventType: 'REMOVED'
          },
          _sum: { amount: true }
        }),
        prisma.liquidityEvent.aggregate({
          where: {
            marketId: id,
            timestamp: { gte: periods['7d'] },
            eventType: 'REMOVED'
          },
          _sum: { amount: true }
        })
      ])

      const marketStats = {
        marketId: id,
        volume24h: (volume24h._sum.amount || 0n).toString(),
        volume7d: (volume7d._sum.amount || 0n).toString(),
        volume30d: (volume30d._sum.amount || 0n).toString(),
        tradeCount24h,
        tradeCount7d,
        tradeCount30d,
        uniqueTraders24h,
        uniqueTraders7d,
        uniqueTraders30d,
        liquidityAdded24h: (liquidityAdded24h._sum.amount || 0n).toString(),
        liquidityAdded7d: (liquidityAdded7d._sum.amount || 0n).toString(),
        liquidityRemoved24h: (liquidityRemoved24h._sum.amount || 0n).toString(),
        liquidityRemoved7d: (liquidityRemoved7d._sum.amount || 0n).toString()
      }

      reply.send({
        success: true,
        data: marketStats
      })

    } catch (error) {
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch market statistics',
        message: error.message
      })
    }
  })
}
