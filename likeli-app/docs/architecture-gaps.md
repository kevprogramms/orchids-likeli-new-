# Likeli: Architecture Gap Analysis

**Document Version:** 1.0  
**Date:** December 2024  
**Status:** Current Audit of MVP Demo Implementation

---

## Executive Summary

Likeli is a **proof-of-concept prediction market platform** built with Next.js 16, React 19, and TypeScript. The current implementation uses **in-memory data stores, localStorage persistence, and mock wallet connectors** to demonstrate core trading flows (CLOB order books, bonding curve sandbox markets, parlays, and portfolio tracking). 

This document audits the delta between the current demo architecture and production/testnet requirements. The platform requires substantial backend infrastructure, smart contract integration, database migration, and security hardening before supporting real asset trading.

---

## 1. Architecture Overview

### 1.1 Current Stack

| Layer | Component | Status |
|-------|-----------|--------|
| **Frontend** | Next.js 16 App Router, React 19, TypeScript, CSS Modules + Tailwind | ✅ Production-ready |
| **Charts & Viz** | VisX (orderbook), Recharts (portfolios), lightweight-charts | ✅ Production-ready |
| **State Management** | React Context (AuthContext, StoreProvider), localStorage | ⚠️ Demo-only |
| **API Layer** | Next.js API routes (`/app/api/**`) | ⚠️ In-memory handlers |
| **Order Engine** | `lib/orderbook.ts` (CLOB matching, in-memory) | ⚠️ Demo-only |
| **Sandbox Markets** | `lib/sandbox.ts` (bonding curve, in-memory) | ⚠️ Demo-only |
| **Auth** | Mock wallet connectors (Metamask, Phantom stubs) | ❌ Non-functional |
| **Persistence** | localStorage only (single-browser, no sync) | ❌ Inadequate |
| **Database** | None | ❌ Critical gap |
| **Smart Contracts** | None | ❌ Critical gap |

### 1.2 Key Modules

```
likeli-app/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── markets/[id]/{orderbook,price-history,orders,positions}/route.ts
│   │   │   └── sandbox/markets/{route.ts,[id]/trade/route.ts}
│   │   ├── [pages]/              # Client pages: home, market/[id], portfolio, vaults, history
│   │   ├── layout.tsx            # Root: AuthProvider + StoreProvider
│   │   └── globals.css
│   ├── components/
│   │   ├── auth/                 # WalletSelectModal, UsernameModal
│   │   ├── markets/              # MarketsGrid, StatsStrip, CreateMarketModal
│   │   ├── trade/                # ChartContainer, TradePanel, OrderBook, ParlayBuilder
│   │   └── ...
│   ├── context/
│   │   └── AuthContext.tsx       # Mock wallet + session management
│   └── lib/
│       ├── store.tsx             # Global store (markets, users, positions, parlays)
│       ├── orderbook.ts          # CLOB engine (submitLimitOrder, getOrderbook, getPriceHistory)
│       └── sandbox.ts            # Bonding curve math (buyCost, sellPayout, probability)
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── ...
```

---

## 2. Frontend Architecture Assessment

### 2.1 Page Structure (src/app)

| Page | Route | Purpose | Data Source | Auth Gating |
|------|-------|---------|-------------|-------------|
| Home/Markets | `/` | Market hub, tabs (Main/Sandbox) | Store + `/api/sandbox/markets` GET | ❌ None |
| Market Detail | `/market/[id]` | Order book, chart, trade panel | `/api/markets/[id]/*` or sandbox API | ❌ None |
| Portfolio | `/portfolio` | Positions, balances, PnL | Store (userId-keyed) | ⚠️ Redirect if no wallet |
| History | `/history` | Trade log, equity curve | Store | ⚠️ Redirect if no wallet |
| Vaults | `/vaults` | Managed strategies (UI only) | Mock data | ⚠️ Redirect if no wallet |
| Vault Detail | `/vaults/[id]` | Vault leaderboard, chat (UI only) | Mock data | ⚠️ Redirect if no wallet |
| Community | `/community` | Social feed (UI only) | Mock data | ❌ None |
| Settings | `/settings` | Account settings (stub) | Mock data | ❌ None |

**Gaps:**
- ❌ **No real auth**: Wallet connection is mocked (MetaMask/Phantom libraries are called but responses are simulated)
- ❌ **No server-side session**: Auth state lives in localStorage + React context only
- ❌ **No permission checks**: Pages show portfolio/history to anyone with a localStorage ID, no wallet signature verification
- ⚠️ **No data fetching from persistent store**: All data comes from in-memory stores that reset on server restart

### 2.2 Component Hierarchy

**Root Layout** (`src/app/layout.tsx`):
```typescript
<AuthProvider>
  <StoreProvider>
    {children}
  </StoreProvider>
</AuthProvider>
```

**AuthContext** (`src/context/AuthContext.tsx`):
- **connectMetamask()**: Calls `window.ethereum.request({method: "eth_requestAccounts"})` → **currently fails silently** if MetaMask not installed or network unreachable
- **connectPhantom()**: Calls `window.solana.connect()` → **non-functional without Phantom wallet**
- **accountId**: Derived as `"${walletType}:${address}"` → unique per wallet+chain
- **Persistence**: localStorage keys `likeli_last_wallet`, `likeli_accounts`
- **Username flow**: Modal asks for username → stored in localStorage → no server validation

**StoreProvider** (`src/lib/store.tsx`):
- **State**: `markets: Market[]`, `usersById: Record<string, User>`, `currentUserId`
- **Actions**: `buy()`, `sell()`, `placeMarketOrder()`, `placeLimitOrder()`, `createMarket()`, `placeParlay()`, `resolveMarket()`
- **Persistence**: localStorage keys `likeli_demo_users`, `likeli_markets`
- **Initialization**: Loads from localStorage, falls back to `INITIAL_MARKETS` mock data
- **Lifecycle**: Auto-saves on any user/market change

**Gaps:**
- ❌ **No API calls for auth**: User data never syncs to a backend
- ❌ **No nonce/signature verification**: Wallet address is accepted at face value
- ❌ **No RBAC**: Any user can resolve markets, create markets, edit positions
- ❌ **No audit trail**: No server-side logs of who did what and when
- ⚠️ **Broken migrations**: Market data migrations try to rebuild price history from partial data (lines 355–421 in store.tsx)

---

## 3. State Management & Persistence

### 3.1 Current Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    React Context                            │
│  ┌───────────────┐         ┌─────────────────────────────┐  │
│  │  AuthContext  │         │   StoreProvider             │  │
│  │               │         │   ┌─────────────────────┐   │  │
│  │ · walletAddr  │         │   │ markets: Market[]   │   │  │
│  │ · username    │         │   │ usersById: Record   │   │  │
│  │ · accountId   │         │   │ currentUserId       │   │  │
│  └───────────────┘         │   └─────────────────────┘   │  │
│         ↓                   │           ↓ ↑               │  │
│      localStorage           │      localStorage           │  │
│  (likeli_accounts,      │  (likeli_demo_users,       │  │
│   likeli_last_wallet)   │   likeli_markets)           │  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               In-Memory Singletons                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ lib/orderbook.ts (global store)                     │   │
│  │ · orders: Order[]                                   │   │
│  │ · trades: Trade[]                                   │   │
│  │ · positions: OutcomePosition[]                      │   │
│  │ · priceHistory: PricePoint[]                        │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ lib/sandbox.ts (global store)                       │   │
│  │ · sandboxMarkets: Map<id, SandboxMarket>            │   │
│  │ · sandboxUsers: Map<id, SandboxUser>                │   │
│  └──────────────────────────────────────────────────────┘   │
│  ⚠️ Live only while server is running; reset on restart     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Data Models

**Market** (src/lib/store.tsx, lines 11–51):
```typescript
interface Market {
  id: string;                    // e.g. "m1", "sb_xxx"
  question: string;
  category: string;
  type: "yes_no" | "multiple_choice";
  status: "active" | "resolved" | "void";
  resolutionDate: string;
  outcomes: { id: string; name: string; price: number }[];
  liquidity: number;             // ⚠️ Calculated on-the-fly in prod?
  volume: number;                // ⚠️ Calculated on-the-fly in prod?
  isGraduated: boolean;          // ⚠️ No governance logic
  creatorId: string;             // ⚠️ Not verified on-chain
  phase?: "sandbox_curve" | "main_clob";
  curve?: { yes: {...}; no: {...} };  // Bonding curve state
  probabilityHistory: PricePoint[];
  priceHistory: { t: number; yesPrice: number; noPrice: number }[];
  orderBook?: OrderBook;
}
```

**Gaps:**
- ❌ **No market creation contract**: `creatorId` is any string, no proof of ownership
- ❌ **No settlement data**: No field for oracle result, no settlement TX hash
- ❌ **No fees tracked**: No creator fee, platform fee, or resolution fee fields
- ❌ **No supply cap**: `volume` and `liquidity` can be arbitrarily large with no on-chain constraint
- ⚠️ **Conflicting histories**: Both `probabilityHistory` and `priceHistory` exist; unclear which is canonical

**User** (src/lib/store.tsx, lines 138–146):
```typescript
interface User {
  id: string;                    // accountId from AuthContext
  balance: number;               // In USD, no asset type specified
  positions: Position[];         // Outcome positions
  parlays: ParlayBet[];
  perps: any[];                  // Placeholder, not implemented
  history: TradeHistoryItem[];
  equityHistory: EquityPoint[];
}
```

**Gaps:**
- ❌ **No blockchain settlement**: Balance is a number, not a smart contract state
- ❌ **No multi-asset support**: Only USD balance; can't hold stablecoins, native tokens, or LP shares
- ❌ **No withdrawal mechanism**: No way to move balance to an external wallet
- ❌ **No custody model**: Not clear if balances are escrowed in a contract or held by the protocol

### 3.3 Persistence Limitations

| Aspect | Current | Production Requirement |
|--------|---------|------------------------|
| **Scope** | Single browser's localStorage | Multi-device sync via DB |
| **Sync** | Manual page refresh only | Real-time WebSocket or polling |
| **Backup** | Lost if browser cache cleared | Cloud DB with replication |
| **Querying** | Brute-force search in JS arrays | Indexed SQL queries |
| **Transactions** | No ACID guarantees | DB transaction support |
| **Audit** | No history, data mutations not logged | Append-only event log |
| **Scalability** | ~5–10 MB localStorage limit | Unlimited (cloud DB) |

**Immediate Risk:** A user clears browser cache → loses all balances and positions → **protocol insolvency**.

---

## 4. In-Memory Order Engine (lib/orderbook.ts)

### 4.1 Current Implementation

```typescript
// Global singletons (reset on server restart)
const globalStore = {
  likeli_markets: Record<string, Market>,
  likeli_orders: Order[],
  likeli_trades: Trade[],
  likeli_positions: OutcomePosition[],
  likeli_priceHistory: PricePoint[]
};

// CLOB Logic
submitLimitOrder(input: NewOrderInput): SubmitOrderResult {
  // 1. Validate price in [0,1] with 0.01 tick
  // 2. Check no-shorting: user can't sell more than they hold
  // 3. Iterate through opposite-side orders sorted by price + time
  // 4. Fill matches, update positions, record trades
  // 5. Push unfilled to order book
}

getOrderbook(marketId): MarketOrderbook {
  // Aggregate open orders into bid/ask levels
  // Compute mid price from best bid/ask, last trade, or 0.5 default
}
```

### 4.2 Functional Assessment

**What Works:**
- ✅ Order matching logic (FIFO within price level)
- ✅ Position accounting (FIFO cost basis, realized PnL)
- ✅ Price history recording (timestamp + probability snapshot)
- ✅ No shorting enforcement (simple qty check)

**Gaps:**
- ❌ **No persistence**: Orders/trades exist only in-memory, lost on server restart
- ❌ **No order types**: Only limit orders; no stop-loss, take-profit, or IOC
- ❌ **No settlement**: No custody contract, positions are local state
- ❌ **No circuit breakers**: No max price movement halt, no liquidity checks
- ❌ **No fairness primitives**: No order randomization, can be MEV'd
- ❌ **No liquidation logic**: Perps are stubbed but not implemented
- ❌ **No cross-market margin**: Can't collateralize across markets
- ❌ **Race conditions**: Concurrent order submissions not serialized (Node.js is single-threaded but bad for production)

**Code Issues:**
- Line 159: No-shorting check has floating-point epsilon (`pos.qty + 1e-8 < qty`) → risky for large orders
- Line 189–195: Sort order depends on side type within same price level → confusing (should always sort by time)
- Line 305–323: `getLastYesTradePrice()` returns `undefined` for markets with no trades → must default to 0.5 (works, but fragile)

### 4.3 API Endpoints

| Endpoint | Method | Purpose | Data Source | Gaps |
|----------|--------|---------|-------------|------|
| `/api/markets/[id]/orderbook` | GET | Fetch current orderbook | In-memory | ❌ No polling; manual refresh only |
| `/api/markets/[id]/orders` | GET/POST | Fetch/submit orders | In-memory | ❌ No auth; anyone can submit as any user |
| `/api/markets/[id]/price-history` | GET | Fetch price history | In-memory | ❌ No auth; unbounded data size |
| `/api/markets/[id]/positions` | GET | Fetch user positions | In-memory + StoreProvider | ❌ No auth |

---

## 5. Sandbox Bonding Curve (lib/sandbox.ts)

### 5.1 Current Implementation

**Curve Formula** (lines 72–76):
```typescript
function priceAtSupply(outcome: OutcomeCurve, supply: number): number {
  const t = Math.min(Math.max(supply / maxSupply, 0), 1);
  return minPrice + (maxPrice - minPrice) * t;
}
```
Linear interpolation from `minPrice` (0.10) to `maxPrice` (0.90) as supply fills `maxSupply`.

**Market Creation** (src/app/page.tsx, CreateMarketModal):
- User posts to `/api/sandbox/markets` with `{ question, category, resolutionDate, initialLiquidityUsd, rules }`
- Server creates market with `curve = { yes: {...}, no: {...} }` (separate curves per outcome)
- Initial price = `(minPrice + maxPrice) / 2` = 0.5 (50/50)

**Trade Execution** (/api/sandbox/markets/[id]/trade):
- Client sends `{ side: "BUY"|"SELL", outcome: "YES"|"NO", amountUsd, qty, userId }`
- Server computes delta (shares) to buy/sell within budget
- Updates curve supply and reserve, records price snapshot
- Returns updated market + user positions

### 5.2 Functional Assessment

**What Works:**
- ✅ Bonding curve pricing (supply-sensitive, moves prices on trades)
- ✅ Budget-constrained buying (user specifies USD, server finds max shares for that USD)
- ✅ Quantity-based selling (user can sell up to their holdings)
- ✅ Probability derivation (treat YES and NO as separate pools, price = `yesPrice / (yesPrice + noPrice)`)

**Gaps:**
- ❌ **No persistence**: Markets/users exist only in-memory, lost on server restart
- ❌ **No creator rights**: Creator can't govern or withdraw fees
- ❌ **No graduation logic**: No path for sandbox markets to graduate to main CLOB
- ❌ **No volume caps**: Curve can be bought/sold to arbitrary levels, potentially causing arithmetic issues
- ⚠️ **Ambiguous settlement**: No clear path to resolving outcome; `phase: "sandbox_curve"` is just a flag
- ⚠️ **Separate YES/NO curves**: Prices are decoupled per outcome, not constrained to sum to 1.0
- ⚠️ **Reserve depletion**: If reserve goes negative, math breaks (line 120: `curve.reserve -= payout`)

**Code Issues:**
- Line 38–70: BUY delta calculation uses granularity of `step = 100` (fixed) → unfriendly UX, can't buy small positions
- Line 117: `if (payout > curve.reserve) payout = curve.reserve;` → silently clamps payout, user gets less than expected
- No field validation: User can send negative amountUsd, non-string outcome, etc.

### 5.3 API Endpoints

| Endpoint | Method | Purpose | Data Source | Gaps |
|----------|--------|---------|-------------|------|
| `/api/sandbox/markets` | GET/POST | List/create markets | In-memory | ❌ No pagination; no auth |
| `/api/sandbox/markets/[id]` | GET | Fetch market | In-memory | ❌ No auth |
| `/api/sandbox/markets/[id]/trade` | POST | Execute trade | In-memory | ❌ No auth; anyone can trade as any user |

---

## 6. Authentication & Authorization

### 6.1 Current Implementation (AuthContext.tsx)

```typescript
connectMetamask() {
  const ethereum = (window as any).ethereum;
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts[0].toLowerCase();
  setWalletAddress(address);
  // ... no server verification
}

accountId = `${walletType}:${address}`; // e.g. "metamask:0x123..."
```

**Session Management:**
- localStorage `likeli_last_wallet` → `{ walletAddress, walletType }`
- localStorage `likeli_accounts` → Array of `{ walletAddress, walletType, username }`
- **No server-side session**: Backend never sees auth data, can't verify user identity

### 6.2 Authorization Gaps

| Action | Current | Required |
|--------|---------|----------|
| **Create market** | Any user with accountId | On-chain governance role + collateral |
| **Place order** | Any user with accountId | Signed message to prevent account takeover |
| **Resolve market** | Any user (calls `resolveMarket()` in store) | ❌ No oracle integration |
| **Withdraw balance** | ❌ Not implemented | Smart contract + signed TX |
| **List user history** | Anyone can fetch `/portfolio` | ❌ No permission check |
| **Admin actions** | ❌ No admin role | Role-based access control (RBAC) |

**Immediate Risks:**
- ❌ **Account takeover**: Attacker can fabricate any accountId string in localStorage → impersonate user
- ❌ **Replay attacks**: No nonce; attacker can replay old market creation/trade orders
- ❌ **CSRF**: No CSRF token on API calls
- ❌ **XSS vulnerable balance display**: If user balance comes from untrusted source, XSS in market question strings could drain account

---

## 7. Asset Model & Settlement

### 7.1 Current Asset Handling

**On Frontend:**
- `User.balance: number` → USD equivalent, no asset type
- Position shares stored as `{ marketId, outcome, shares }` → shares per outcome, not per contract
- No on-chain tokens

**On Backend:**
- No smart contracts
- No custody mechanism
- No bridge to real stablecoins (USDC, DAI, etc.)
- No LP token minting for liquidity provision

### 7.2 Settlement Pipeline Gaps

**Current State:**
```
User places order in UI
  ↓
Frontend updates StoreProvider + in-memory order book
  ↓
Position stored in localStorage
  ↓
(End — no settlement)
```

**Required State** (for production):
```
User signs order message
  ↓
Frontend submits to server with signature
  ↓
Server verifies signature, applies order to order book
  ↓
Order book state synced to smart contract (CLOB executor contract)
  ↓
Smart contract moves assets from user vault to counterparty
  ↓
Contract emits event
  ↓
Server reads event, updates DB, broadcasts to client
  ↓
Client receives updated position + balance
```

**Gaps:**
- ❌ **No order signatures**: Orders are created by frontend, submitted unsigned
- ❌ **No contract executor**: No smart contract to settle trades
- ❌ **No asset escrow**: Balances not held in contract, arbitrary mutations possible
- ❌ **No proof of settlement**: No blockchain TX hash, orders can't be referenced externally
- ❌ **No margin/leverage**: Perps are stubbed, no funding rates or liquidation

---

## 8. Architectural Gap Summary Table

### 8.1 Frontend Gaps

| Gap | Severity | Impact | Remediation |
|-----|----------|--------|-------------|
| No real wallet integration | **CRITICAL** | Users can't trade with real assets; anyone can impersonate | Implement EIP-191 sign + verify on backend |
| No server-side auth session | **CRITICAL** | No user tracking across devices, sessions forgeable | Add JWT/session tokens, verify on every API call |
| No API permission checks | **CRITICAL** | Any user can view/edit others' portfolios | Add auth middleware, verify user owns resource |
| No multi-device sync | **HIGH** | Balances don't carry across devices | Move state to backend DB, add real-time sync |
| No error recovery | **MEDIUM** | Trades can fail silently, balances get out of sync | Add idempotency keys, transaction rollback |
| Stub Vaults/Community pages | **LOW** | UX incomplete but doesn't block core trading | Implement post-MVP |

### 8.2 Backend Gaps

| Gap | Severity | Impact | Remediation |
|-----|----------|--------|-------------|
| No persistent database | **CRITICAL** | All data lost on server restart, no audit trail | Migrate to PostgreSQL + migrations, add logging |
| No contract integration | **CRITICAL** | Can't settle trades, no real asset custody | Deploy CLOB + settlement contracts, integrate contract ABIs |
| No order settlement | **CRITICAL** | Trades are local state, can't be finalized | Build settlement executor, listen to contract events |
| No balance verification | **CRITICAL** | Users can have negative balance (overspending) | Add balance checks before order acceptance |
| No API rate limiting | **HIGH** | Vulnerable to DOS, order spam | Add rate limiter middleware |
| No input validation | **HIGH** | Can crash with invalid data (e.g., NaN prices) | Add Zod/io-ts schema validation |
| No event sourcing | **MEDIUM** | No audit trail of who did what | Add event log table, emit events on trade/creation |
| No order types | **MEDIUM** | Only limit orders; no stop-loss or IOC | Build order type handlers in matching engine |

### 8.3 Smart Contract Gaps

| Gap | Severity | Impact | Remediation |
|-----|----------|--------|-------------|
| No CLOB contract | **CRITICAL** | No on-chain order matching, no settlement | Deploy CLOB contract (e.g., dYdX-style matching) |
| No market factory | **CRITICAL** | Can't create markets on-chain, no governance | Deploy market factory + ERC-1155 for outcome shares |
| No settlement executor | **CRITICAL** | Can't move assets, trades are worthless | Deploy executor contract (checks orders, transfers assets) |
| No oracle integration | **CRITICAL** | Can't resolve markets, no finality | Integrate Chainlink/Pyth or governance oracle |
| No liquidity mining | **HIGH** | Can't bootstrap liquidity, poor UX for new markets | Implement LP token + rewards contract |
| No withdrawal mechanism | **HIGH** | Users can't cash out, balance is trapped | Deploy bridge to move assets to external wallet |
| No cross-margin collateral | **MEDIUM** | Limited leverage, UX friction for multi-market traders | Build margin pool contract |

### 8.4 Operational Gaps

| Gap | Severity | Impact | Remediation |
|-----|----------|--------|-------------|
| No staging environment | **HIGH** | Can't test before mainnet deployment | Deploy to testnet, add test harness |
| No monitoring/alerting | **HIGH** | Can't detect failures, balance drift detection is manual | Add Datadog/New Relic, alert on order failures |
| No backup/recovery | **HIGH** | Data loss is unrecoverable | Implement DB backups, test restore procedures |
| No contract pause mechanism | **MEDIUM** | Can't halt trading in emergency | Add emergency stop function to contracts |

---

## 9. Immediate Risks & Blockers

### 9.1 Blocker Issues (Prevent Live Trading)

1. **Account Takeover via localStorage (CRITICAL)**
   - **Risk**: User A's browser cache clears, User B opens same browser → User B can impersonate User A
   - **Impact**: Fund theft, unauthorized trades
   - **Blocker**: Must implement server-side session verification before accepting any trade

2. **No Asset Custody (CRITICAL)**
   - **Risk**: Balances are local state, no contract holds actual assets
   - **Impact**: All "balances" are fictional, can't settle real trades
   - **Blocker**: Must deploy smart contract to hold assets before accepting real deposits

3. **No Settlement Finality (CRITICAL)**
   - **Risk**: Trades are local mutations, no on-chain proof they happened
   - **Impact**: Users can dispute trades, no external verification
   - **Blocker**: Must emit settlement events on contract before trades are finalized

4. **Data Loss on Restart (CRITICAL)**
   - **Risk**: Server restarts → all orders/trades lost, balances corrupted
   - **Impact**: Protocol insolvency, users can claim they placed orders that don't exist
   - **Blocker**: Must migrate to persistent DB with replication

5. **No Oracle Resolution (CRITICAL)**
   - **Risk**: Markets can be resolved by any user calling `resolveMarket()`
   - **Impact**: Market creator can resolve in their favor, steal liquidity
   - **Blocker**: Must integrate oracle before any real-money markets live

### 9.2 High-Risk Anti-Patterns

**In-Memory State as Source of Truth:**
- `lib/orderbook.ts` and `lib/sandbox.ts` use global singletons
- No event log, no replayability, no audit trail
- Single server restart wipes state
- **Fix**: Move to event-sourced DB with immutable event log

**No Signed Messages:**
- Frontend fabricates accountId from localStorage
- Backend accepts any user claim without verification
- **Fix**: Use EIP-191 signed messages, verify signature on server

**Flat User Permissions:**
- No RBAC, no admin roles, no oracle roles
- **Fix**: Add role-based access control to all API endpoints

**Price Computation Race Conditions:**
- Order matching and price snapshots are async callbacks
- No transactional guarantee that orderbook state and price history stay in sync
- **Fix**: Make order processing synchronous, use DB transactions

---

## 10. Production Checklist & Dependencies

### 10.1 Phase 1: Backend Infrastructure (Months 1–2)

**Database Setup:**
- [ ] Migrate to PostgreSQL (or Supabase for faster time-to-market)
- [ ] Create schema for `markets`, `orders`, `trades`, `users`, `positions`, `price_history`
- [ ] Add indexes on `(userId, marketId)`, `(marketId, createdAt)`, `(marketId, outcome, side, price)`
- [ ] Implement migrations + schema versioning (Prisma, TypeORM, or raw SQL)
- [ ] Set up automated backups, point-in-time recovery

**API Refactor:**
- [ ] Replace in-memory stores (`lib/orderbook.ts`, `lib/sandbox.ts`) with DB queries
- [ ] Add request validation using Zod (all integer/float fields, enum checks)
- [ ] Implement rate limiting (e.g., 10 req/sec per IP)
- [ ] Add auth middleware to verify JWT on all protected endpoints
- [ ] Add error logging (structured JSON logs to Datadog/CloudWatch)

**Order Engine Refactoring:**
- [ ] Extract order matching logic from `lib/orderbook.ts` into `/lib/matcher` or `/services/matcher`
- [ ] Make matching transactional (wrap in DB transaction)
- [ ] Add test coverage for edge cases (rounding, negative balance, concurrent orders)
- [ ] Benchmark matching latency (target: <10ms for 100 open orders)

### 10.2 Phase 2: Smart Contracts (Months 2–3)

**CLOB & Settlement Contracts:**
- [ ] Deploy CLOB contract (or fork dYdX V4) on testnet
- [ ] Implement order matching executor (matches orders, transfers assets)
- [ ] Deploy outcome token factory (ERC-1155 or ERC-20 for YES/NO shares)
- [ ] Implement market resolution oracle interface (Chainlink VRF, Governance, or custom)
- [ ] Add liquidity bootstrapping mechanism (bonding curve or AMM)

**Smart Contract Integration:**
- [ ] Add contract ABIs to `/lib/contracts` or generate from ethers.js
- [ ] Implement contract interaction layer (`/lib/contracts/clob.ts`, `/lib/contracts/settlement.ts`)
- [ ] Add gas cost estimation + warnings in UI
- [ ] Implement contract event listeners (subscribe to order fill, market resolution events)

### 10.3 Phase 3: Auth & Wallet Integration (Weeks 3–4)

**Real Wallet Integration:**
- [ ] Replace mock `connectMetamask()` / `connectPhantom()` with real Web3Modal or Wagmi integration
- [ ] Implement EIP-191 message signing (sign nonce + message to prove wallet ownership)
- [ ] Add server-side signature verification (recover address from signature, compare to claimed address)
- [ ] Implement JWT issuance on successful sign-in
- [ ] Add JWT verification middleware to all protected endpoints
- [ ] Implement logout and token expiration

**Multi-Chain Support:**
- [ ] Add chain selection modal (Ethereum, Polygon, Arbitrum, Base, etc.)
- [ ] Store chain ID in user session
- [ ] Validate contract addresses match selected chain

### 10.4 Phase 4: Real-Time Sync & Subscriptions (Weeks 4–6)

**WebSocket or Server-Sent Events:**
- [ ] Implement order book subscriptions (client subscribes to updates for a market)
- [ ] Implement trade stream (client sees new trades in real-time)
- [ ] Implement position updates (client sees balance changes from contract events)
- [ ] Handle disconnection + re-sync logic

### 10.5 Phase 5: Testing & Audit (Weeks 5–8)

**Test Coverage:**
- [ ] Unit tests for order matching (100+ test cases)
- [ ] Integration tests for API endpoints (user creation, order placement, resolution)
- [ ] Contract tests (unit + integration for CLOB and settlement)
- [ ] Load tests (1000 concurrent users, 100 orders/sec)
- [ ] Security tests (SQL injection, XSS, CSRF, reentrancy)

**External Security Audit:**
- [ ] Engage security firm for smart contract audit
- [ ] Engage security firm for backend API audit
- [ ] Fix all high/critical issues before mainnet

### 10.6 Phase 6: Testnet Launch (Week 8–10)

- [ ] Deploy to testnet (Sepolia, Mumbai, Arbitrum Sepolia, etc.)
- [ ] Open to limited beta users
- [ ] Monitor for crashes, data corruption, slow queries
- [ ] Refine UI based on user feedback
- [ ] Re-audit if major changes made

---

## 11. Files to Modify & Create

### 11.1 Database Schema (New Files)

```sql
-- Create migration files in /migrations or use Prisma schema

CREATE TABLE users (
    id UUID PRIMARY KEY,
    wallet_address VARCHAR(255) NOT NULL,
    wallet_type VARCHAR(50) NOT NULL,  -- 'metamask', 'phantom', etc.
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255),
    balance_usd NUMERIC(18, 8) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(wallet_address, wallet_type)
);

CREATE TABLE markets (
    id VARCHAR(255) PRIMARY KEY,
    question TEXT NOT NULL,
    category VARCHAR(100),
    market_type VARCHAR(50),  -- 'yes_no', 'multiple_choice'
    status VARCHAR(50),  -- 'active', 'resolved', 'void'
    phase VARCHAR(50),  -- 'sandbox_curve', 'main_clob'
    creator_id UUID REFERENCES users(id),
    resolution_date TIMESTAMP,
    resolved_at TIMESTAMP,
    winning_outcome VARCHAR(255),
    liquidity NUMERIC(18, 8) DEFAULT 0,
    volume NUMERIC(18, 8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
    id VARCHAR(255) PRIMARY KEY,
    market_id VARCHAR(255) REFERENCES markets(id),
    user_id UUID REFERENCES users(id),
    outcome VARCHAR(50),  -- 'yes', 'no'
    side VARCHAR(50),  -- 'buy', 'sell'
    price NUMERIC(4, 3),  -- 0.000 to 1.000
    qty NUMERIC(18, 8),
    remaining_qty NUMERIC(18, 8),
    status VARCHAR(50),  -- 'open', 'partial', 'filled', 'cancelled'
    created_at TIMESTAMP DEFAULT NOW(),
    filled_at TIMESTAMP,
    INDEX(market_id, outcome, side, price),
    INDEX(user_id, created_at)
);

CREATE TABLE trades (
    id VARCHAR(255) PRIMARY KEY,
    market_id VARCHAR(255) REFERENCES markets(id),
    outcome VARCHAR(50),
    price NUMERIC(4, 3),
    qty NUMERIC(18, 8),
    taker_order_id VARCHAR(255) REFERENCES orders(id),
    maker_order_id VARCHAR(255) REFERENCES orders(id),
    taker_user_id UUID REFERENCES users(id),
    maker_user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX(market_id, created_at)
);

CREATE TABLE positions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    market_id VARCHAR(255) REFERENCES markets(id),
    outcome VARCHAR(50),
    qty NUMERIC(18, 8),
    avg_price NUMERIC(4, 3),
    realized_pnl NUMERIC(18, 8),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, market_id, outcome)
);

CREATE TABLE price_history (
    id UUID PRIMARY KEY,
    market_id VARCHAR(255) REFERENCES markets(id),
    timestamp TIMESTAMP,
    yes_price NUMERIC(4, 3),
    no_price NUMERIC(4, 3),
    yes_prob NUMERIC(4, 3),
    no_prob NUMERIC(4, 3),
    INDEX(market_id, timestamp)
);
```

### 11.2 Backend Refactoring (Modified Files)

**`src/lib/store.tsx`:**
- Remove in-memory stores, replace with API calls to persistent DB
- Replace `INITIAL_MARKETS` with server-side market fetch
- Remove localStorage persistence code

**`src/app/api/**` (all routes):**
- Add Zod validation schemas
- Add auth middleware to verify JWT
- Replace in-memory data access with DB queries
- Add structured error responses
- Add transaction support for order placement

**`src/context/AuthContext.tsx`:**
- Replace mock wallet calls with real Web3Modal / Wagmi integration
- Implement EIP-191 message signing
- Call `/api/auth/login` endpoint to exchange signature for JWT
- Store JWT in httpOnly cookie (not localStorage!)

### 11.3 New Files to Create

**Authentication:**
- `src/app/api/auth/login.ts` – Verify signature, issue JWT
- `src/app/api/auth/logout.ts` – Revoke session
- `src/middleware.ts` – JWT verification middleware (Next.js 13+)

**Order Processing:**
- `src/lib/matcher.ts` – Core matching logic (extracted from orderbook.ts)
- `src/lib/settlement.ts` – Contract interaction for settlement
- `src/services/orderService.ts` – DB operations for orders

**Database:**
- `src/lib/db.ts` – Database connection (Prisma or TypeORM)
- `src/lib/schema.ts` – Zod schemas for all API inputs
- `migrations/` – Database migration files

**Smart Contracts:**
- `contracts/CLOB.sol` – Order matching contract
- `contracts/MarketFactory.sol` – Market creation contract
- `contracts/Settlement.sol` – Asset settlement contract
- `src/lib/contracts/clob.ts` – TypeScript interface to CLOB contract

---

## 12. Example Remediation: Order Placement Flow

### Current (Broken)

```typescript
// Frontend (src/lib/store.tsx)
const buy = (marketId: string, outcomeId: string, amountUSD: number) => {
  // 1. Mutate local state
  const user = usersById[currentUserId];
  user.balance -= amountUSD;
  user.positions.push(...);
  
  // 2. Save to localStorage
  setUsersById({...usersById, [currentUserId]: user});
};

// No backend call, no settlement, no verification
```

### Production (Proposed)

```typescript
// Frontend (src/components/trade/TradePanel.tsx)
const handleBuyOrder = async () => {
  const { accountId } = useAuth();
  
  // 1. Get current nonce from backend
  const nonceRes = await fetch('/api/auth/nonce', {
    headers: { Authorization: `Bearer ${jwt}` }
  });
  const { nonce } = await nonceRes.json();
  
  // 2. Sign order intent
  const message = `Place BUY order:\nMarket: ${marketId}\nQty: ${qty}\nPrice: ${price}\nNonce: ${nonce}`;
  const signature = await signer.signMessage(message);
  
  // 3. Submit order with signature
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`
    },
    body: JSON.stringify({
      marketId,
      outcome: 'yes',
      side: 'buy',
      price,
      qty,
      signature,
      nonce
    })
  });
  
  if (res.ok) {
    const { orderId, fills } = await res.json();
    // 4. Listen for contract settlement event
    provider.on({
      address: clob.address,
      event: 'OrderFilled',
      args: { orderId }
    }, (data) => {
      // 5. Update UI with settled position
      setPosition({ qty: data.newQty, avgPrice: data.avgPrice });
    });
  }
};

// Backend (src/app/api/orders/route.ts)
export async function POST(req: NextRequest) {
  // 1. Verify JWT
  const jwt = req.headers.get('authorization')?.split(' ')[1];
  const { userId } = verifyJWT(jwt);
  
  // 2. Parse & validate input
  const schema = z.object({
    marketId: z.string().min(1),
    outcome: z.enum(['yes', 'no']),
    side: z.enum(['buy', 'sell']),
    price: z.number().min(0).max(1),
    qty: z.number().positive(),
    signature: z.string(),
    nonce: z.string()
  });
  const { marketId, outcome, side, price, qty, signature, nonce } = schema.parse(await req.json());
  
  // 3. Verify signature
  const message = `Place ${side.toUpperCase()} order:\nMarket: ${marketId}\nQty: ${qty}\nPrice: ${price}\nNonce: ${nonce}`;
  const recoveredAddress = ethers.verifyMessage(message, signature);
  const user = db.users.findBy({ wallet_address: recoveredAddress });
  if (user.id !== userId) throw new Error('SIGNATURE_MISMATCH');
  
  // 4. Check nonce (prevent replay)
  if (!(await db.nonces.checkAndConsume(userId, nonce))) {
    throw new Error('NONCE_ALREADY_USED');
  }
  
  // 5. Fetch user balance from DB
  const userBalance = await db.users.getBalance(userId);
  if (side === 'buy' && userBalance < price * qty) {
    throw new Error('INSUFFICIENT_BALANCE');
  }
  
  // 6. Match order against order book in transaction
  const result = db.transaction(() => {
    const market = db.markets.get(marketId);
    if (!market) throw new Error('MARKET_NOT_FOUND');
    
    const order = db.orders.create({
      marketId, userId, outcome, side, price, qty,
      status: 'open', createdAt: Date.now()
    });
    
    const { fills, unfilledQty } = matcher.matchOrder(order);
    
    // 7. Reduce user balance (accounting)
    db.users.updateBalance(userId, -price * fills.reduce((sum, f) => sum + f.qty, 0));
    
    // 8. Record fills as trades
    for (const fill of fills) {
      db.trades.create(fill);
      db.positions.updateFor(userId, marketId, outcome, fill.qty, fill.price);
    }
    
    // 9. Record unmatched order (or return error if not self-execute)
    if (unfilledQty > 0) {
      db.orders.update(order.id, { remainingQty: unfilledQty });
    }
    
    return { orderId: order.id, fills };
  });
  
  // 10. Submit to contract (async, will emit event later)
  const tx = await clob.submitOrder({
    marketId, outcome, side, price, qty,
    userAddress: recoveredAddress,
    fills: result.fills
  });
  
  // 11. Return order ID + filled quantity
  return NextResponse.json(result);
}
```

---

## 13. Known Issues & TODOs

### In store.tsx (src/lib/store.tsx)

| Line | Issue | Severity |
|------|-------|----------|
| 355–388 | `probabilityHistory` migration tries to reconstruct from current price → produces flat/incorrect data | **HIGH** |
| 389–407 | `priceHistory` migration similarly reconstructs incorrectly | **HIGH** |
| 469–470 | Guest user hardcoded with `id: "guest", balance: 0` → can create trades as "guest" | **MEDIUM** |
| 500–510 | Sell side calculates `pnl = (price - avgPrice) * sellQty` → but avgPrice is USD cost, price is per-share → units mismatch | **CRITICAL** |
| 659–680 | `resolveMarket()` allows any user to resolve, no governance check | **CRITICAL** |
| 700–750 | `placeParlay()` has no odds verification, allows impossible parlays | **MEDIUM** |

### In orderbook.ts (src/lib/orderbook.ts)

| Line | Issue | Severity |
|------|-------|----------|
| 65–75 | Global singletons not exported for testing → can't unit test in isolation | **MEDIUM** |
| 159 | Floating-point epsilon (`1e-8`) for no-shorting check → unsafe for rounding errors | **MEDIUM** |
| 189–197 | Sort logic within price level is confusing (sorts by time inside `if (isBuy)` block) | **LOW** |
| 237–238 | Order only added to book if `remainingQty > 0` → but `remainingQty === 0` case not explicitly handled | **LOW** |

### In sandbox.ts (src/lib/sandbox.ts)

| Line | Issue | Severity |
|------|-------|----------|
| 37–70 | BUY delta calculation uses fixed `step = 100` → UX unfriendly, can't buy single share | **MEDIUM** |
| 117 | Silently clamps payout if exceeds reserve → user gets less USD back without error message | **HIGH** |
| No persistence | Markets reset on server restart | **CRITICAL** |

### In routes (src/app/api/**/route.ts)

| File | Issue | Severity |
|------|-------|----------|
| All routes | No authentication check (anyone can POST) | **CRITICAL** |
| All routes | No rate limiting | **HIGH** |
| All routes | No request validation (could receive NaN, negative prices, etc.) | **MEDIUM** |
| orders + positions routes | Missing implementation (routes don't exist yet) | **HIGH** |

---

## 14. References & Further Reading

### Prediction Market Architectures
- [Manifold Markets](https://manifold.markets) – Open-source prediction market, uses Supabase
- [Kalshi](https://kalshi.com) – CLOB + bonding curve hybrid
- [Metaculus](https://metaculus.com) – Oracle-based resolution
- [dYdX V4](https://dydx.trade) – Production orderbook matching engine

### Smart Contract Standards
- [EIP-1155 (Multi-token standard)](https://eips.ethereum.org/EIPS/eip-1155) – For YES/NO outcome tokens
- [EIP-191 (Signed data)](https://eips.ethereum.org/EIPS/eip-191) – For message signing
- [Chainlink VRF](https://docs.chain.link/vrf) – For verifiable randomness in market resolution

### Backend Frameworks
- [Prisma ORM](https://www.prisma.io) – Type-safe DB access
- [tRPC](https://trpc.io) – Type-safe RPC for frontend-backend communication
- [Zod](https://zod.dev) – Schema validation

### Wallet Integration
- [Web3Modal](https://web3modal.com) – Multi-wallet connection UI
- [Wagmi](https://wagmi.sh) – React hooks for Web3
- [ethers.js](https://docs.ethers.org/v6/) – Ethereum library

---

## 15. Conclusion

**Likeli's current implementation is a functional demo showcasing core prediction market mechanics (order matching, bonding curves, portfolio tracking).** However, it is **not production-ready** and has critical architectural flaws that prevent real-money trading:

1. ✅ **What Works**: UI/UX, order matching logic, bonding curve math, localStorage state management
2. ❌ **What's Missing**: Persistent DB, smart contracts, real wallet integration, auth verification, settlement finality
3. ⚠️ **What's Broken**: Account takeover via localStorage, any user can resolve markets, data lost on restart

**Recommended Path Forward:**
1. **Weeks 1–4**: Set up PostgreSQL, refactor API to use DB, implement JWT auth
2. **Weeks 4–8**: Deploy smart contracts (CLOB, market factory, settlement), integrate contract ABIs
3. **Weeks 8–12**: Implement real wallet signing, WebSocket subscriptions, load testing
4. **Weeks 12–16**: External security audit, testnet beta launch, monitoring setup

**Estimated Timeline:** 4 months to production-ready testnet launch.

