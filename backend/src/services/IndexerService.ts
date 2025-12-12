import { Contract, JsonRpcProvider, Log } from 'ethers'
import { getPrisma } from '../lib/database.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/index.js'
import { MarketFactory__getContract, SandboxMarket__getContract, MainMarket__getContract } from '../utils/contracts.js'
import { parseMarketCreatedEvent, parseTradeEvent, parseLiquidityEvent } from '../utils/event-parsers.js'
import type { IndexingOptions, SyncProgress } from '../types/index.js'

export class IndexerService {
  private provider: JsonRpcProvider
  private prisma = getPrisma()
  private isRunning = false
  private syncProgress: SyncProgress | null = null

  constructor() {
    this.provider = new JsonRpcProvider(config.RPC_URL)
  }

  async startIndexing(options: IndexingOptions = {}): Promise<void> {
    if (this.isRunning) {
      logger.warn('Indexer is already running')
      return
    }

    this.isRunning = true
    logger.info('Starting indexer service', { options })

    try {
      const syncState = await this.getSyncState()
      const startBlock = options.startBlock ?? Number(syncState?.lastProcessedBlock ?? config.START_BLOCK)
      const endBlock = options.endBlock ?? (await this.provider.getBlockNumber())
      
      this.syncProgress = {
        currentBlock: startBlock,
        totalBlocks: endBlock - startBlock,
        processedEvents: Number(syncState?.totalEventsProcessed ?? 0),
        speed: 0
      }

      await this.backfillHistoricalLogs(startBlock, endBlock, options)
      await this.startLiveIndexing()
      
    } catch (error) {
      logger.error('Failed to start indexer:', error)
      this.isRunning = false
      throw error
    }
  }

  async stopIndexing(): Promise<void> {
    logger.info('Stopping indexer service')
    this.isRunning = false
    await this.updateSyncState({ isIndexing: false, lastIndexingEnd: new Date() })
  }

  private async backfillHistoricalLogs(
    startBlock: number, 
    endBlock: number, 
    options: IndexingOptions
  ): Promise<void> {
    const batchSize = options.batchSize ?? config.BATCH_SIZE
    const maxConcurrent = options.maxConcurrent ?? config.MAX_CONCURRENT_BLOCKS
    
    logger.info(`Backfilling logs from block ${startBlock} to ${endBlock}`, { batchSize, maxConcurrent })

    for (let fromBlock = startBlock; fromBlock < endBlock && this.isRunning; fromBlock += batchSize) {
      const toBlock = Math.min(fromBlock + batchSize - 1, endBlock)
      
      try {
        await this.processBlockRange(fromBlock, toBlock)
        
        // Update sync state
        await this.updateSyncState({ 
          lastProcessedBlock: BigInt(toBlock),
          totalEventsProcessed: BigInt(this.syncProgress?.processedEvents ?? 0)
        })

        this.syncProgress!.currentBlock = toBlock
        
        // Progress logging
        const progress = ((toBlock - startBlock) / (endBlock - startBlock)) * 100
        logger.info(`Backfill progress: ${progress.toFixed(2)}%`, {
          currentBlock: toBlock,
          totalBlocks: endBlock,
          processedEvents: this.syncProgress?.processedEvents
        })

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        logger.error(`Failed to process block range ${fromBlock}-${toBlock}:`, error)
        await this.delay(config.RETRY_DELAY)
        fromBlock -= batchSize // Retry this batch
      }
    }
  }

  private async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    const factory = MarketFactory__getContract(config.MARKET_FACTORY_ADDRESS, this.provider)

    // Get MarketFactory events
    const factoryEvents = await factory.queryFilter('*', fromBlock, toBlock)
    
    for (const event of factoryEvents) {
      await this.handleFactoryEvent(event)
    }

    // Get all market-specific events
    const markets = await this.prisma.market.findMany({
      where: { marketAddress: { not: '' } },
      select: { marketAddress: true }
    })

    // Process events for each market in batches
    const marketBatches = this.chunkArray(markets.map(m => m.marketAddress), config.MAX_CONCURRENT_BLOCKS)
    
    for (const batch of marketBatches) {
      await Promise.all(batch.map(marketAddress => this.processMarketEvents(marketAddress, fromBlock, toBlock)))
    }
  }

  private async handleFactoryEvent(event: Log): Promise<void> {
    try {
      const parsedEvent = parseMarketCreatedEvent(event)
      
      if (parsedEvent) {
        // Create or update market record
        await this.prisma.market.upsert({
          where: { marketId: parsedEvent.marketId },
          update: {
            marketAddress: parsedEvent.marketAddress,
            question: parsedEvent.question,
            category: parsedEvent.category,
            resolutionDate: new Date(parsedEvent.resolutionDate * 1000),
            creator: parsedEvent.creator,
            type: parsedEvent.marketType === 0 ? 'SANDBOX' : 'MAIN'
          },
          create: {
            marketId: parsedEvent.marketId,
            marketAddress: parsedEvent.marketAddress,
            question: parsedEvent.question,
            category: parsedEvent.category,
            resolutionDate: new Date(parsedEvent.resolutionDate * 1000),
            creator: parsedEvent.creator,
            type: parsedEvent.marketType === 0 ? 'SANDBOX' : 'MAIN',
            status: 'ACTIVE'
          }
        })

        this.syncProgress!.processedEvents++
      }
    } catch (error) {
      logger.error('Failed to handle factory event:', error)
    }
  }

  private async processMarketEvents(marketAddress: string, fromBlock: number, toBlock: number): Promise<void> {
    try {
      // This would need to be expanded based on actual contract ABIs
      // For now, it's a placeholder for the pattern
      
      const market = await this.prisma.market.findUnique({
        where: { marketAddress }
      })

      if (!market) return

      // Process various market events (Trade, LiquidityAdded, etc.)
      // This would involve querying the actual contract events
      
      this.syncProgress!.processedEvents++
      
    } catch (error) {
      logger.error(`Failed to process market events for ${marketAddress}:`, error)
    }
  }

  private async startLiveIndexing(): Promise<void> {
    logger.info('Starting live indexing...')
    
    // Subscribe to new blocks
    this.provider.on('block', async (blockNumber) => {
      if (!this.isRunning) return

      try {
        await this.processBlockRange(blockNumber, blockNumber)
        this.syncProgress!.currentBlock = blockNumber
      } catch (error) {
        logger.error(`Failed to process new block ${blockNumber}:`, error)
      }
    })
  }

  private async getSyncState() {
    return await this.prisma.syncState.findUnique({
      where: { id: 'singleton' }
    })
  }

  private async updateSyncState(updates: Partial<{
    lastProcessedBlock: bigint
    lastProcessedLogIndex: bigint
    isIndexing: boolean
    lastIndexingStart: Date
    lastIndexingEnd: Date
    totalEventsProcessed: bigint
  }>): Promise<void> {
    await this.prisma.syncState.upsert({
      where: { id: 'singleton' },
      update: updates,
      create: {
        id: 'singleton',
        lastProcessedBlock: BigInt(config.START_BLOCK),
        lastProcessedLogIndex: 0n,
        isIndexing: updates.isIndexing ?? false,
        lastIndexingStart: updates.lastIndexingStart,
        lastIndexingEnd: updates.lastIndexingEnd,
        totalEventsProcessed: updates.totalEventsProcessed ?? 0n
      }
    })
  }

  getProgress(): SyncProgress | null {
    return this.syncProgress
  }

  isIndexing(): boolean {
    return this.isRunning
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }
}
