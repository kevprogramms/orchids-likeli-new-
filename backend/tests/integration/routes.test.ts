import { describe, it, expect, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { buildServer } from '../../src/index.js'

describe('API Routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await buildServer()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('Health Routes', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.payload)
      expect(data.status).toBe('healthy')
      expect(data.database).toBeDefined()
      expect(data.database.status).toBe('connected')
    })

    it('should return ready status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ready'
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.payload)
      expect(data.ready).toBe(true)
    })

    it('should return live status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/live'
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.payload)
      expect(data.live).toBe(true)
    })
  })

  describe('Market Routes', () => {
    it('should return empty markets list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/markets'
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data).toEqual([])
      expect(data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        hasNext: false,
        hasPrev: false
      })
    })

    it('should return 404 for non-existent market', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/markets/non-existent-id'
      })

      expect(response.statusCode).toBe(404)
      
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Market not found')
    })
  })

  describe('User Routes', () => {
    it('should return empty portfolio for new user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/0x1234567890123456789012345678901234567890/portfolio'
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.user).toBe('0x1234567890123456789012345678901234567890')
      expect(data.data.positions).toEqual([])
      expect(data.data.balances.free).toBe('0')
      expect(data.data.balances.locked).toBe('0')
    })
  })

  describe('Stats Routes', () => {
    it('should return platform statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats'
      })

      expect(response.statusCode).toBe(200)
      
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.totalMarkets).toBe(0)
      expect(data.data.activeMarkets).toBe(0)
      expect(data.data.totalVolume).toBe('0')
      expect(data.data.topCategories).toEqual([])
    })
  })

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown-route'
      })

      expect(response.statusCode).toBe(404)
      
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(false)
      expect(data.error.message).toBe('Route not found')
    })
  })
})
