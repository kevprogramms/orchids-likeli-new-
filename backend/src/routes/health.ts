import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getPrisma } from '../lib/database.js'
import { IndexerService } from '../services/IndexerService.js'

export async function healthRoutes(fastify: FastifyInstance) {
  const prisma = getPrisma()
  
  fastify.get('/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            database: { 
              type: 'object',
              properties: {
                status: { type: 'string' },
                latency: { type: 'number' }
              }
            },
            indexer: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                isRunning: { type: 'boolean' },
                lastSyncBlock: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now()
    
    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`
      const dbLatency = Date.now() - startTime
      
      // Check indexer status (would need to inject indexer service)
      const indexerStatus = {
        status: 'unknown',
        isRunning: false,
        lastSyncBlock: '0'
      }
      
      reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: 'connected',
          latency: dbLatency
        },
        indexer: indexerStatus
      })
      
    } catch (error) {
      reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        error: error.message
      })
    }
  })

  fastify.get('/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if database is ready
      await prisma.$queryRaw`SELECT 1`
      
      reply.send({
        ready: true,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      reply.status(503).send({
        ready: false,
        error: error.message
      })
    }
  })

  fastify.get('/live', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      live: true,
      timestamp: new Date().toISOString()
    })
  })
}
