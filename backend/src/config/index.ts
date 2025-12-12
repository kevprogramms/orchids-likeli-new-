import { z } from 'zod'
import * as dotenv from 'dotenv'

dotenv.config()

const configSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1),
  
  // Blockchain RPC
  RPC_URL: z.string().url(),
  FALLBACK_RPC_URL: z.string().url().optional(),
  
  // Contract Addresses
  MARKET_FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  COLLATERAL_VAULT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  POSITION_MANAGER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  RESOLUTION_ORACLE_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  
  // Server Configuration
  PORT: z.coerce.number().min(1024).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Indexer Configuration
  START_BLOCK: z.coerce.number().min(0).default(18000000),
  BATCH_SIZE: z.coerce.number().min(100).max(10000).default(2000),
  MAX_CONCURRENT_BLOCKS: z.coerce.number().min(1).max(50).default(10),
  RETRY_DELAY: z.coerce.number().min(1000).max(60000).default(5000),
  POLLING_INTERVAL: z.coerce.number().min(100).max(60000).default(1000),
  
  // Cache Configuration
  CACHE_TTL_SECONDS: z.coerce.number().min(60).max(86400).default(300),
  REDIS_URL: z.string().url().optional(),
  
  // Security
  API_KEY: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1).optional(),
})

export type Config = z.infer<typeof configSchema>

export const config: Config = configSchema.parse(process.env)
