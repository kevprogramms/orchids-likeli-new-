import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import { config } from './config/index.js'
import { logger } from './lib/logger.js'
import { healthRoutes } from './routes/health.js'
import { marketRoutes } from './routes/markets.js'
import { userRoutes } from './routes/users.js'
import { statsRoutes } from './routes/stats.js'
import { IndexerService } from './services/IndexerService.js'

// Extend Fastify Request type to include startTime
declare module 'fastify' {
  interface FastifyRequest {
    startTime: number
  }
}

// Create Fastify instance
const fastify = Fastify({
  logger: false, // We use our own logger
  trustProxy: true,
  bodyLimit: 10485760, // 10MB
})

async function buildServer() {
  try {
    // Register plugins
    await fastify.register(cors, {
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://likeli.app', 'https://www.likeli.app']
        : true,
      credentials: true
    })

    await fastify.register(helmet, {
      contentSecurityPolicy: false // Disable for API
    })

    // Swagger documentation
    await fastify.register(swagger, {
      swagger: {
        info: {
          title: 'Likeli Indexer API',
          description: 'Real-time prediction market data API',
          version: '1.0.0',
          contact: {
            name: 'Likeli Team',
            email: 'dev@likeli.app'
          }
        },
        host: `localhost:${config.PORT}`,
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'health', description: 'Health check endpoints' },
          { name: 'markets', description: 'Market data endpoints' },
          { name: 'users', description: 'User portfolio endpoints' },
          { name: 'stats', description: 'Statistics endpoints' }
        ]
      }
    })

    await fastify.register(swaggerUI, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'full',
        deepLinking: false
      },
      staticCSP: true,
      transformSpecification: (swaggerObject, request, reply) => {
        return swaggerObject
      },
      transformSpecificationClone: true
    })

    // Register routes
    await fastify.register(healthRoutes, { prefix: '/' })
    await fastify.register(marketRoutes, { prefix: '/' })
    await fastify.register(userRoutes, { prefix: '/' })
    await fastify.register(statsRoutes, { prefix: '/' })

    // Global error handler
    fastify.setErrorHandler((error, request, reply) => {
      logger.error('Request error:', {
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
        params: request.params,
        query: request.query,
        body: request.body
      })

      // Don't expose internal errors in production
      const isDev = process.env.NODE_ENV !== 'production'
      
      reply.status(error.statusCode || 500).send({
        success: false,
        error: {
          message: isDev ? error.message : 'Internal server error',
          statusCode: error.statusCode || 500,
          ...(isDev && { stack: error.stack })
        }
      })
    })

    // Global not found handler
    fastify.setNotFoundHandler((request, reply) => {
      logger.warn('Route not found:', {
        method: request.method,
        url: request.url,
        ip: request.ip
      })

      reply.status(404).send({
        success: false,
        error: {
          message: 'Route not found',
          statusCode: 404
        }
      })
    })

    // Health check middleware
    fastify.addHook('onRequest', async (request) => {
      request.startTime = Date.now()
    })

    fastify.addHook('onResponse', async (request, reply) => {
      const responseTime = Date.now() - request.startTime
      
      logger.info('Request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: `${responseTime}ms`,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      })
    })

    return fastify
  } catch (error) {
    logger.error('Failed to build server:', error)
    throw error
  }
}

async function startServer() {
  const server = await buildServer()
  
  try {
    // Start the server
    await server.listen({
      port: config.PORT,
      host: config.HOST
    })

    logger.info(`🚀 Likeli Indexer API ready at http://${config.HOST}:${config.PORT}`)
    logger.info(`📚 API Documentation available at http://${config.HOST}:${config.PORT}/docs`)
    logger.info(`🏥 Health check available at http://${config.HOST}:${config.PORT}/health`)

    // Initialize and start indexer service
    const indexerService = new IndexerService()
    
    // Start indexing in the background
    logger.info('Starting blockchain indexer...')
    indexerService.startIndexing().catch(error => {
      logger.error('Indexer failed to start:', error)
    })

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`)
      
      try {
        // Stop indexer
        await indexerService.stopIndexing()
        
        // Close server
        await server.close()
        
        logger.info('Server shut down successfully')
        process.exit(0)
      } catch (error) {
        logger.error('Error during shutdown:', error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
    
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer()
}

export { buildServer, startServer }
