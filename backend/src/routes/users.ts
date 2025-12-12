import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getPrisma } from '../lib/database.js'
import { PortfolioSerializer, TradeSerializer } from '../serializers/index.js'

export async function userRoutes(fastify: FastifyInstance) {
  const prisma = getPrisma()

  // GET /users/:address/portfolio - Get user portfolio and positions
  fastify.get('/users/:address/portfolio', {
    schema: {
      params: {
        type: 'object',
        properties: {
          address: { type: 'string' }
        },
        required: ['address']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                user: { type: 'string' },
                balances: {
                  type: 'object',
                  properties: {
                    free: { type: 'string' },
                    locked: { type: 'string' },
                    total: { type: 'string' }
                  }
                },
                positions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      marketId: { type: 'string' },
                      marketQuestion: { type: 'string' },
                      outcome: { type: 'string' },
                      shares: { type: 'string' },
                      avgPrice: { type: 'string' },
                      unrealizedPnl: { type: 'string' },
                      realizedPnl: { type: 'string' },
                      marketStatus: { type: 'string' }
                    }
                  }
                },
                stats: {
                  type: 'object',
                  properties: {
                    totalDeposited: { type: 'string' },
                    totalWithdrawn: { type: 'string' },
                    totalFeesPaid: { type: 'string' },
                    realizedPnl: { type: 'string' },
                    winRate: { type: 'number' },
                    totalTrades: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string }

    try {
      // Get or create user balance record
      const balance = await prisma.collateralBalance.upsert({
        where: { user: address },
        update: {},
        create: { user: address }
      })

      // Get user positions
      const positions = await prisma.position.findMany({
        where: { user: address },
        include: {
          market: {
            select: {
              id: true,
              question: true,
              status: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      const portfolio = PortfolioSerializer.toResponse(balance, positions)

      reply.send({
        success: true,
        data: portfolio
      })

    } catch (error) {
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch user portfolio',
        message: error.message
      })
    }
  })

  // GET /users/:address/trades - Get user trade history
  fastify.get('/users/:address/trades', {
    schema: {
      params: {
        type: 'object',
        properties: {
          address: { type: 'string' }
        },
        required: ['address']
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          marketId: { type: 'string' },
          outcome: { type: 'string', enum: ['YES', 'NO'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  tradeId: { type: 'string' },
                  marketId: { type: 'string' },
                  marketQuestion: { type: 'string' },
                  buyer: { type: 'string' },
                  seller: { type: 'string' },
                  outcome: { type: 'string' },
                  side: { type: 'string' },
                  shares: { type: 'string' },
                  price: { type: 'string' },
                  amount: { type: 'string' },
                  fee: { type: 'string' },
                  timestamp: { type: 'string' },
                  blockNumber: { type: 'string' },
                  transactionHash: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                hasNext: { type: 'boolean' },
                hasPrev: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string }
    const { page = 1, limit = 20, marketId, outcome } = request.query as any

    const skip = (page - 1) * limit

    try {
      // Build where clause for user trades
      const where: any = {
        OR: [
          { buyer: address },
          { seller: address }
        ]
      }
      
      if (marketId) where.marketId = marketId
      if (outcome) where.outcome = outcome

      // Get total count for pagination
      const total = await prisma.trade.count({ where })
      const hasNext = skip + limit < total
      const hasPrev = page > 1

      // Get trades
      const trades = await prisma.trade.findMany({
        where,
        include: {
          market: {
            select: {
              id: true,
              question: true
            }
          }
        },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit
      })

      const serializedTrades = TradeSerializer.toResponse(trades)

      reply.send({
        success: true,
        data: serializedTrades,
        pagination: {
          page,
          limit,
          total,
          hasNext,
          hasPrev
        }
      })

    } catch (error) {
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch user trades',
        message: error.message
      })
    }
  })

  // GET /users/:address/positions - Get user positions only
  fastify.get('/users/:address/positions', {
    schema: {
      params: {
        type: 'object',
        properties: {
          address: { type: 'string' }
        },
        required: ['address']
      },
      querystring: {
        type: 'object',
        properties: {
          marketStatus: { type: 'string', enum: ['ACTIVE', 'RESOLVED', 'VOID', 'GRADUATED'] },
          outcome: { type: 'string', enum: ['YES', 'NO'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  marketId: { type: 'string' },
                  marketQuestion: { type: 'string' },
                  outcome: { type: 'string' },
                  shares: { type: 'string' },
                  avgPrice: { type: 'string' },
                  unrealizedPnl: { type: 'string' },
                  realizedPnl: { type: 'string' },
                  marketStatus: { type: 'string' },
                  marketResolutionDate: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { address } = request.params as { address: string }
    const { marketStatus, outcome } = request.query as any

    try {
      const where: any = { user: address }
      
      if (marketStatus || outcome) {
        where.market = {}
        if (marketStatus) where.market.status = marketStatus
        if (outcome) where.outcome = outcome
      }

      const positions = await prisma.position.findMany({
        where,
        include: {
          market: {
            select: {
              id: true,
              question: true,
              status: true,
              resolutionDate: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      const serializedPositions = positions.map(position => ({
        marketId: position.marketId,
        marketQuestion: position.market.question,
        outcome: position.outcome,
        shares: position.shares.toString(),
        avgPrice: position.avgPrice.toString(),
        unrealizedPnl: position.unrealizedPnl.toString(),
        realizedPnl: position.realizedPnl.toString(),
        marketStatus: position.market.status,
        marketResolutionDate: position.market.resolutionDate.toISOString()
      }))

      reply.send({
        success: true,
        data: serializedPositions
      })

    } catch (error) {
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch user positions',
        message: error.message
      })
    }
  })
}
