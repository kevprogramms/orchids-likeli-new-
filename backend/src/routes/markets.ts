import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getPrisma } from '../lib/database.js'
import { MarketSerializer, OrderBookSerializer, PriceHistorySerializer } from '../serializers/index.js'
import type { MarketListItem } from '../types/index.js'

export async function marketRoutes(fastify: FastifyInstance) {
  const prisma = getPrisma()

  // GET /markets - List markets with pagination and filtering
  fastify.get('/markets', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          status: { type: 'string', enum: ['ACTIVE', 'RESOLVED', 'VOID', 'GRADUATED'] },
          type: { type: 'string', enum: ['SANDBOX', 'MAIN'] },
          category: { type: 'string' },
          search: { type: 'string' },
          sortBy: { type: 'string', enum: ['createdAt', 'totalVolume', 'tradeCount', 'resolutionDate'], default: 'createdAt' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }
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
                  marketId: { type: 'string' },
                  marketAddress: { type: 'string' },
                  type: { type: 'string' },
                  status: { type: 'string' },
                  question: { type: 'string' },
                  category: { type: 'string' },
                  resolutionDate: { type: 'string' },
                  totalVolume: { type: 'string' },
                  totalTrades: { type: 'string' },
                  tradeCount: { type: 'string' },
                  createdAt: { type: 'string' },
                  currentPrices: {
                    type: 'object',
                    properties: {
                      yes: { type: 'number' },
                      no: { type: 'number' }
                    }
                  }
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
    const { 
      page = 1, 
      limit = 20, 
      status, 
      type, 
      category, 
      search, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = request.query as any

    const skip = (page - 1) * limit
    
    try {
      // Build where clause
      const where: any = {}
      if (status) where.status = status
      if (type) where.type = type
      if (category) where.category = { contains: category, mode: 'insensitive' }
      if (search) {
        where.OR = [
          { question: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } }
        ]
      }

      // Build orderBy clause
      const orderBy: any = {}
      orderBy[sortBy] = sortOrder

      // Get total count for pagination
      const total = await prisma.market.count({ where })
      const hasNext = skip + limit < total
      const hasPrev = page > 1

      // Get markets with latest price data
      const markets = await prisma.market.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          priceHistory: {
            orderBy: { timestamp: 'desc' },
            take: 1
          }
        }
      })

      const serializedMarkets = markets.map(market => MarketSerializer.toListItem(market))

      reply.send({
        success: true,
        data: serializedMarkets,
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
        error: 'Failed to fetch markets',
        message: error.message
      })
    }
  })

  // GET /markets/:id - Get specific market details
  fastify.get('/markets/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                marketId: { type: 'string' },
                marketAddress: { type: 'string' },
                type: { type: 'string' },
                status: { type: 'string' },
                question: { type: 'string' },
                category: { type: 'string' },
                rules: { type: 'string' },
                resolutionDate: { type: 'string' },
                creator: { type: 'string' },
                winningOutcome: { type: 'string' },
                totalVolume: { type: 'string' },
                totalTrades: { type: 'string' },
                tradeCount: { type: 'string' },
                createdAt: { type: 'string' },
                resolvedAt: { type: 'string' },
                graduatedAt: { type: 'string' },
                currentPrice: { 
                  type: 'object',
                  properties: {
                    yes: { type: 'string' },
                    no: { type: 'string' },
                    yesProbability: { type: 'string' },
                    noProbability: { type: 'string' }
                  }
                },
                stats: {
                  type: 'object'
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }

    try {
      const market = await prisma.market.findUnique({
        where: { id },
        include: {
          priceHistory: {
            orderBy: { timestamp: 'desc' },
            take: 1
          },
          trades: {
            orderBy: { timestamp: 'desc' },
            take: 100
          }
        }
      })

      if (!market) {
        reply.status(404).send({
          success: false,
          error: 'Market not found'
        })
        return
      }

      const serializedMarket = MarketSerializer.toDetail(market)

      reply.send({
        success: true,
        data: serializedMarket
      })

    } catch (error) {
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch market',
        message: error.message
      })
    }
  })

  // GET /markets/:id/orderbook - Get order book for a market
  fastify.get('/markets/:id/orderbook', {
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
          limit: { type: 'integer', minimum: 5, maximum: 50, default: 20 }
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
                bids: { 
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      price: { type: 'string' },
                      size: { type: 'string' },
                      total: { type: 'string' }
                    }
                  }
                },
                asks: { 
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      price: { type: 'string' },
                      size: { type: 'string' },
                      total: { type: 'string' }
                    }
                  }
                },
                spread: {
                  type: 'object',
                  properties: {
                    absolute: { type: 'string' },
                    percentage: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { limit = 20 } = request.query as { limit: number }

    try {
      const market = await prisma.market.findUnique({
        where: { id },
        include: {
          orders: {
            where: { status: 'ACTIVE' },
            orderBy: [{ price: 'desc' }, { createdAt: 'asc' }],
            take: limit * 2 // Get more orders to ensure we have both sides
          }
        }
      })

      if (!market) {
        reply.status(404).send({
          success: false,
          error: 'Market not found'
        })
        return
      }

      // Separate bids and asks
      const bids = market.orders
        .filter(order => order.side === 'BID')
        .reduce((acc, order) => {
          const existing = acc.find(b => b.price === order.price)
          if (existing) {
            existing.size += order.remainingSize
          } else {
            acc.push({ price: order.price, size: order.remainingSize })
          }
          return acc
        }, [] as Array<{ price: bigint; size: bigint }>)

      const asks = market.orders
        .filter(order => order.side === 'ASK')
        .reduce((acc, order) => {
          const existing = acc.find(a => a.price === order.price)
          if (existing) {
            existing.size += order.remainingSize
          } else {
            acc.push({ price: order.price, size: order.remainingSize })
          }
          return acc
        }, [] as Array<{ price: bigint; size: bigint }>)

      const orderBook = OrderBookSerializer.toResponse(bids, asks)

      reply.send({
        success: true,
        data: orderBook
      })

    } catch (error) {
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch order book',
        message: error.message
      })
    }
  })

  // GET /markets/:id/history - Get price history for a market
  fastify.get('/markets/:id/history', {
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
          from: { type: 'string' }, // ISO date string
          to: { type: 'string' }, // ISO date string
          interval: { type: 'string', enum: ['1m', '5m', '15m', '1h', '1d'], default: '1h' }
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
                  timestamp: { type: 'string' },
                  yesPrice: { type: 'number' },
                  noPrice: { type: 'number' },
                  yesProbability: { type: 'number' },
                  noProbability: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { from, to, interval = '1h' } = request.query as any

    try {
      const where: any = { marketId: id }
      
      if (from || to) {
        where.timestamp = {}
        if (from) where.timestamp.gte = new Date(from)
        if (to) where.timestamp.lte = new Date(to)
      }

      const snapshots = await prisma.priceSnapshot.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        take: 1000 // Limit to prevent overwhelming responses
      })

      const serializedHistory = PriceHistorySerializer.toResponse(snapshots)

      reply.send({
        success: true,
        data: serializedHistory
      })

    } catch (error) {
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch price history',
        message: error.message
      })
    }
  })
}
