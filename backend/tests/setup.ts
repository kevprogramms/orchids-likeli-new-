import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { getPrisma } from '../src/lib/database.js'
import { PrismaClient } from '@prisma/client'

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = 'postgresql://likeli:password@localhost:5432/likeli_test_db'
  process.env.RPC_URL = 'https://rpc.ankr.com/eth_sepolia'
  process.env.MARKET_FACTORY_ADDRESS = '0x0000000000000000000000000000000000000000'
  
  // Setup test database
  const prisma = getPrisma()
  await prisma.$executeRaw`DROP DATABASE IF EXISTS likeli_test_db`
  await prisma.$executeRaw`CREATE DATABASE likeli_test_db`
})

afterAll(async () => {
  // Cleanup test database
  const prisma = getPrisma()
  await prisma.$executeRaw`DROP DATABASE IF EXISTS likeli_test_db`
  await prisma.$disconnect()
})

beforeEach(async () => {
  // Reset database state between tests
  const prisma = getPrisma()
  
  // Clear all tables
  const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `
  
  for (const { tablename } of tablenames) {
    if (tablename !== '_prisma_migrations') {
      await prisma.$executeRaw`TRUNCATE TABLE ${tablename} CASCADE`
    }
  }
})

afterEach(async () => {
  // Clean up after each test
  const prisma = getPrisma()
  await prisma.$disconnect()
})
