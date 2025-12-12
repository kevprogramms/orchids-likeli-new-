import { PrismaClient } from '@prisma/client'
import { logger } from './logger.js'

let prisma: PrismaClient

declare global {
  var __prisma__: PrismaClient | undefined
}

export function getPrisma(): PrismaClient {
  if (!global.__prisma__) {
    global.__prisma__ = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'info', emit: 'event' },
        { level: 'warn', emit: 'event' }
      ]
    })

    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      global.__prisma__.$on('query', (e) => {
        logger.debug('Query:', e.query, e.params)
      })
    }

    global.__prisma__.$on('error', (e) => {
      logger.error('Database error:', e)
    })
  }

  return global.__prisma__
}

export { prisma as db }
