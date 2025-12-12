# Likeli Backend - Indexer API

A high-performance TypeScript backend service that indexes blockchain data from Likeli prediction markets and serves real-time market data via REST APIs.

## 🚀 Features

- **Blockchain Indexing**: Streams and indexes events from MarketFactory, SandboxMarket, and MainMarket contracts
- **Real-time APIs**: REST endpoints for markets, order books, price history, user portfolios, and statistics
- **PostgreSQL + Prisma**: Type-safe database operations with comprehensive schema
- **Fastify**: High-performance HTTP server with OpenAPI documentation
- **Comprehensive Testing**: Vitest test suite with 80%+ coverage
- **Production Ready**: Docker Compose setup, health checks, graceful shutdown

## 🛠 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Fastify 5.x
- **Database**: PostgreSQL 16 + Prisma ORM
- **Blockchain**: Ethers.js 6.x
- **Testing**: Vitest
- **Documentation**: OpenAPI/Swagger
- **Logging**: Pino

## 📋 Prerequisites

- Node.js 18 or higher
- PostgreSQL 16
- pnpm (recommended) or npm

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Setup

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Database
DATABASE_URL="postgresql://likeli:password@localhost:5432/likeli_db?schema=public"

# Blockchain RPC
RPC_URL="https://eth-mainnet.g.alchemy.com/v2/your-api-key"

# Contract Addresses
MARKET_FACTORY_ADDRESS="0x..."
COLLATERAL_VAULT_ADDRESS="0x..."
POSITION_MANAGER_ADDRESS="0x..."
RESOLUTION_ORACLE_ADDRESS="0x..."

# Server
PORT=3001
HOST=0.0.0.0
```

### 3. Start Infrastructure

Start PostgreSQL and Redis using Docker Compose:

```bash
docker-compose -f docker-compose.postgres.yml up -d
```

### 4. Database Setup

Generate Prisma client and run migrations:

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

### 5. Start Development Server

```bash
pnpm dev
```

The API will be available at:
- **API**: http://localhost:3001
- **Documentation**: http://localhost:3001/docs
- **Health Check**: http://localhost:3001/health

## 📖 API Documentation

### Health Endpoints

- `GET /health` - Comprehensive health check with database and indexer status
- `GET /ready` - Kubernetes readiness probe
- `GET /live` - Kubernetes liveness probe

### Market Endpoints

- `GET /markets` - List markets with pagination and filtering
- `GET /markets/:id` - Get specific market details
- `GET /markets/:id/orderbook` - Get order book for a market
- `GET /markets/:id/history` - Get price history for a market

### User Endpoints

- `GET /users/:address/portfolio` - Get user portfolio and positions
- `GET /users/:address/trades` - Get user trade history
- `GET /users/:address/positions` - Get user positions only

### Statistics Endpoints

- `GET /stats` - Platform-wide statistics
- `GET /stats/markets/:id` - Market-specific statistics

## 🗄️ Database Schema

The Prisma schema includes the following models:

### Core Models
- **Market**: Market metadata and state
- **Order**: Limit/market orders in the order book
- **Trade**: Executed trades with full details
- **Position**: User positions per market/outcome

### Supporting Models
- **LiquidityEvent**: Liquidity additions/removals
- **PriceSnapshot**: Historical price data
- **CollateralBalance**: User collateral tracking
- **OracleState**: Oracle feed data
- **MarketFactoryEvent**: Factory event log
- **SyncState**: Indexer synchronization state

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `RPC_URL` | Primary blockchain RPC URL | Required |
| `FALLBACK_RPC_URL` | Backup RPC URL | Optional |
| `MARKET_FACTORY_ADDRESS` | MarketFactory contract address | Required |
| `PORT` | Server port | `3001` |
| `HOST` | Server host | `0.0.0.0` |
| `LOG_LEVEL` | Logging level | `info` |
| `START_BLOCK` | Initial block to start indexing | `18000000` |
| `BATCH_SIZE` | Blocks per indexing batch | `2000` |
| `MAX_CONCURRENT_BLOCKS` | Concurrent block processing | `10` |
| `CACHE_TTL_SECONDS` | Cache TTL | `300` |

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test --watch
```

### Test Structure

- **Unit Tests**: Individual component testing (`tests/unit/`)
- **Integration Tests**: API endpoint testing (`tests/integration/`)
- **Fixtures**: Test data and mocks (`tests/fixtures/`)

## 🐳 Docker Deployment

### Development

```bash
docker-compose -f docker-compose.postgres.yml up -d
pnpm dev
```

### Production

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

## 🔄 Indexer Service

The IndexerService automatically:

1. **Historical Backfill**: Processes all events from `START_BLOCK` to current block
2. **Live Indexing**: Subscribes to new blocks and processes events in real-time
3. **Error Recovery**: Handles RPC failures and retries with exponential backoff
4. **Progress Tracking**: Maintains sync state for resumption after restarts

### Starting the Indexer

The indexer starts automatically when the server starts:

```typescript
const indexerService = new IndexerService()
await indexerService.startIndexing({
  startBlock: 18000000,
  batchSize: 2000,
  maxConcurrent: 10
})
```

## 🏗️ Development

### Project Structure

```
backend/
├── src/
│   ├── config/         # Configuration management
│   ├── lib/           # Core utilities (database, logger)
│   ├── routes/        # API route handlers
│   ├── serializers/   # Response serializers
│   ├── services/      # Business logic services
│   ├── types/         # TypeScript type definitions
│   ├── utils/         # Utility functions
│   └── index.ts       # Server entry point
├── contracts/         # Smart contract ABIs
├── prisma/           # Database schema and migrations
├── tests/            # Test files
└── docker-compose.postgres.yml
```

### Adding New Routes

1. Create route file in `src/routes/`
2. Define Fastify plugin with schema validation
3. Register in `src/index.ts`
4. Add tests in `tests/integration/`

### Database Migrations

```bash
# Create migration
pnpm prisma migrate dev --name migration_name

# Deploy to production
pnpm prisma migrate deploy

# Reset database (development only)
pnpm prisma migrate reset
```

## 🔒 Security

- **Input Validation**: All inputs validated using Fastify schemas
- **CORS**: Configured for production domains
- **Helmet**: Security headers enabled
- **Rate Limiting**: Built into Fastify request logging
- **Error Handling**: Production errors sanitized

## 📊 Monitoring

### Health Checks

- **Database**: Connection and latency monitoring
- **Indexer**: Sync progress and error tracking
- **Memory**: Process memory usage
- **Uptime**: Service availability

### Logging

Structured logging with Pino:
```typescript
logger.info('Market created', {
  marketId: 123,
  creator: '0x...',
  category: 'Crypto'
})
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure tests pass: `pnpm test`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: http://localhost:3001/docs
- **Health Check**: http://localhost:3001/health
- **Issues**: GitHub Issues
- **Email**: dev@likeli.app
