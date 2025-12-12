import pino from 'pino'
import { config } from '../config/index.js'

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: undefined, // Remove pid, hostname
  msgPrefix: 'likeli-backend|',
  hooks: {
    logMethod(args, method) {
      if (args[0]?.includes && typeof args[0].includes === 'function') {
        args[0] = args[0].replace(/\|/g, ': ')
      }
      method.apply(this, args as any)
    }
  }
})

export { logger }
