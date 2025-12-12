# Frontend Integration Plan

## Overview

This document outlines the evolution of Likeli's Next.js client from its current mocked state to a production-ready application that integrates with live backend services and smart contracts. The plan provides a concrete roadmap for replacing localStorage-based state management with real-time data from backend APIs and blockchain contracts.

## Current State Analysis

### Existing Data Flow Architecture

The application currently operates with a **hybrid approach**:

1. **Main Markets**: Use centralized order book (`lib/orderbook.ts`) with API endpoints at `/api/markets/[id]/**`
2. **Sandbox Markets**: Use bonding curve pricing via `/api/sandbox/**` with data stored in `lib/sandbox.ts`
3. **Authentication**: Mock wallet connection through `AuthContext` with localStorage persistence
4. **State Management**: Global store (`lib/store.tsx`) persisting all user data locally

### Current Key Files Structure

```typescript
// Primary Pages
app/page.tsx                 // Markets hub with main/sandbox tabs
app/market/[id]/page.tsx     // Individual market detail with charts
app/portfolio/page.tsx       // Account overview and history

// Core Components  
components/trade/TradePanel.tsx      // Trading interface for both engines
components/portfolio/AccountOverview.tsx  // Portfolio summary
components/portfolio/PositionsAndHistory.tsx // Positions tracking

// State Management
context/AuthContext.tsx      // Mock wallet authentication
lib/store.tsx               // Centralized store with localStorage
lib/orderbook.ts           // In-memory CLOB simulation
lib/sandbox.ts             // Bonding curve implementation
```

## Integration Roadmap

### Phase 1: Backend API Client Layer

#### 1.1 Create API Client Infrastructure

**New File: `lib/api-client.ts`**

```typescript
interface APIConfig {
  baseURL: string;
  headers: Record<string, string>;
  timeout: number;
}

class APIClient {
  private config: APIConfig;
  private authToken: string | null = null;

  constructor(config: APIConfig) {
    this.config = config;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Implement authenticated requests with retry logic
    // Handle network errors gracefully
    // Add request/response interceptors for logging
  }
}

// Market Data Endpoints
export const marketAPI = {
  getMarket: (id: string) => client.request(`/markets/${id}`),
  getOrderbook: (id: string) => client.request(`/markets/${id}/orderbook`),
  getPriceHistory: (id: string, params: HistoryParams) => 
    client.request(`/markets/${id}/price-history`, { params }),
  getPositions: (userId: string) => client.request(`/users/${userId}/positions`),
  placeOrder: (marketId: string, order: OrderRequest) => 
    client.request(`/markets/${marketId}/orders`, { method: 'POST', body: JSON.stringify(order) }),
};

// User Management
export const userAPI = {
  getProfile: (userId: string) => client.request(`/users/${userId}`),
  getPortfolio: (userId: string) => client.request(`/users/${userId}/portfolio`),
  getHistory: (userId: string, filters: HistoryFilters) => 
    client.request(`/users/${userId}/history`, { params: filters }),
};
```

#### 1.2 Environment Configuration

**New File: `lib/config.ts`**

```typescript
interface Config {
  environment: 'development' | 'staging' | 'production';
  apiBaseURL: string;
  wsURL: string;
  contractAddresses: {
    main: Record<string, string>;
    testnet: Record<string, string>;
  };
  featureFlags: {
    useRealContracts: boolean;
    enableWebSocket: boolean;
    enableAdvancedFeatures: boolean;
  };
}

export const config: Config = {
  environment: process.env.NODE_ENV as any,
  apiBaseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  wsURL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000',
  contractAddresses: {
    main: {
      marketRegistry: process.env.NEXT_PUBLIC_MAIN_MARKET_REGISTRY || '',
      orderBook: process.env.NEXT_PUBLIC_MAIN_ORDERBOOK || '',
    },
    testnet: {
      marketRegistry: process.env.NEXT_PUBLIC_TESTNET_MARKET_REGISTRY || '',
      orderBook: process.env.NEXT_PUBLIC_TESTNET_ORDERBOOK || '',
    }
  },
  featureFlags: {
    useRealContracts: process.env.NEXT_PUBLIC_USE_CONTRACTS === 'true',
    enableWebSocket: process.env.NEXT_PUBLIC_ENABLE_WS === 'true',
    enableAdvancedFeatures: process.env.NEXT_PUBLIC_ENABLE_ADVANCED === 'true',
  }
};
```

### Phase 2: Smart Contract Integration

#### 2.1 Web3 Provider Setup

**New File: `lib/contracts/index.ts`**

```typescript
import { ethers } from 'ethers';

// Contract ABIs (will be generated from compiled contracts)
import MarketRegistryABI from './abis/MarketRegistry.json';
import OrderBookABI from './abis/OrderBook.json';
import ERC20ABI from './abis/ERC20.json';

export class ContractClient {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  public marketRegistry: ethers.Contract | null = null;
  public orderBook: ethers.Contract | null = null;

  async initialize(walletAddress: string) {
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    
    const network = await this.provider.getNetwork();
    const contractConfig = config.contractAddresses[network.chainId === 1 ? 'main' : 'testnet'];
    
    this.marketRegistry = new ethers.Contract(
      contractConfig.marketRegistry, 
      MarketRegistryABI, 
      this.signer
    );
    
    this.orderBook = new ethers.Contract(
      contractConfig.orderBook,
      OrderBookABI,
      this.signer
    );
  }

  // Market operations
  async createMarket(marketData: MarketCreationData): Promise<string> {
    const tx = await this.marketRegistry.createMarket(marketData);
    const receipt = await tx.wait();
    return receipt.events.find((e: any) => e.event === 'MarketCreated').args.marketId;
  }

  async placeOrder(marketId: string, order: OrderData): Promise<string> {
    const tx = await this.orderBook.placeOrder(marketId, order);
    return tx.hash;
  }

  async cancelOrder(orderId: string): Promise<string> {
    const tx = await this.orderBook.cancelOrder(orderId);
    return tx.hash;
  }

  // Position and balance queries
  async getPositions(walletAddress: string): Promise<Position[]> {
    const positions = await this.orderBook.getUserPositions(walletAddress);
    return this.formatPositions(positions);
  }

  async getAllowance(tokenAddress: string, owner: string, spender: string): Promise<BigNumber> {
    const token = new ethers.Contract(tokenAddress, ERC20ABI, this.provider);
    return await token.allowance(owner, spender);
  }
}
```

#### 2.2 Enhanced AuthContext Integration

**Update: `context/AuthContext.tsx`**

```typescript
interface AuthContextType {
  // Existing props...
  contractClient: ContractClient | null;
  network: NetworkInfo | null;
  isCorrectNetwork: boolean;
  switchNetwork: (chainId: number) => Promise<void>;
  approveToken: (token: string, amount: BigNumber) => Promise<void>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [contractClient, setContractClient] = useState<ContractClient | null>(null);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);

  // Enhanced wallet connection
  const connectWallet = async (walletType: WalletType) => {
    try {
      const client = new ContractClient();
      await client.initialize(walletAddress);
      
      // Verify network
      const networkInfo = await client.getNetworkInfo();
      const correct = verifyNetwork(networkInfo);
      
      setContractClient(client);
      setNetwork(networkInfo);
      setIsCorrectNetwork(correct);
      
      if (!correct) {
        await switchToCorrectNetwork();
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
    }
  };
}
```

### Phase 3: State Management Evolution

#### 3.1 Replace useStore with Remote Queries

**New File: `lib/queries/useMarketData.ts`**

```typescript
export function useMarketData(marketId: string) {
  const { contractClient } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarket = async () => {
      try {
        setLoading(true);
        const data = await marketAPI.getMarket(marketId);
        setMarket(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (marketId) fetchMarket();
  }, [marketId]);

  return { market, loading, error, refetch: () => {} };
}

export function useOrderbook(marketId: string) {
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null);
  const { contractClient } = useAuth();

  // Real-time updates via WebSocket or polling
  useEffect(() => {
    if (!contractClient) return;

    const fetchOrderbook = async () => {
      const ob = await contractClient.getOrderbook(marketId);
      setOrderbook(ob);
    };

    fetchOrderbook();
    
    // Set up real-time subscription
    const subscription = setupOrderbookSubscription(marketId, (update) => {
      setOrderbook(update);
    });

    return () => subscription?.unsubscribe();
  }, [marketId, contractClient]);

  return orderbook;
}
```

#### 3.2 Portfolio State Management

**New File: `lib/queries/usePortfolio.ts`**

```typescript
export function usePortfolio(userId: string) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<TradeHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const { contractClient } = useAuth();

  useEffect(() => {
    const fetchPortfolio = async () => {
      if (!contractClient || !userId) return;

      try {
        setLoading(true);
        const [portfolioData, positionData, historyData] = await Promise.all([
          userAPI.getPortfolio(userId),
          contractClient.getPositions(userId),
          userAPI.getHistory(userId, {})
        ]);

        setPortfolio(portfolioData);
        setPositions(positionData);
        setHistory(historyData);
      } catch (error) {
        console.error('Failed to fetch portfolio:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolio();

    // Set up real-time position updates
    const subscription = setupPositionUpdates(userId, (update) => {
      setPositions(update);
    });

    return () => subscription?.unsubscribe();
  }, [userId, contractClient]);

  return { portfolio, positions, history, loading };
}
```

### Phase 4: UI Component Updates

#### 4.1 Home Page Evolution

**Update: `app/page.tsx`**

```typescript
export default function Home() {
  const { isAuthenticated, userId } = useAuth();
  const { markets, loading: marketsLoading } = useMainMarkets();
  const { markets: sandboxMarkets, loading: sandboxLoading } = useSandboxMarkets();
  const [activeTab, setActiveTab] = useState<"main" | "sandbox">("main");

  // Replace useStore with remote queries
  const visibleMarkets = (activeTab === "main" ? markets : sandboxMarkets).filter(m => {
    // Add server-side filtering capabilities
    return filterMarkets(m, { category: activeCategory, search });
  });

  // Real-time market updates
  useEffect(() => {
    if (!isAuthenticated) return;

    const subscription = setupMarketSubscription((update) => {
      // Handle real-time market updates
      updateMarketInState(update);
    });

    return () => subscription?.unsubscribe();
  }, [isAuthenticated]);

  // Integration with real Create Market flow
  const handleCreateMarket = async (marketData: CreateMarketData) => {
    if (!contractClient) return;

    try {
      const marketId = await contractClient.createMarket(marketData);
      
      // Show transaction status
      showTransactionStatus(marketId, 'Market Creation');
      
      // Redirect to new market
      router.push(`/market/${marketId}`);
    } catch (error) {
      showError('Failed to create market');
    }
  };
}
```

#### 4.2 Market Page Real-time Updates

**Update: `app/market/[id]/page.tsx`**

```typescript
export default function MarketPage() {
  const { marketId } = useParams();
  const { market, loading: marketLoading } = useMarketData(marketId);
  const orderbook = useOrderbook(marketId);
  const priceHistory = usePriceHistory(marketId);
  const { contractClient } = useAuth();

  const handleOrderPlaced = async (orderData: OrderData) => {
    try {
      if (market?.phase === 'sandbox_curve') {
        // Sandbox trading via API
        const response = await sandboxAPI.placeOrder(marketId, orderData);
        showSuccess('Order placed successfully');
      } else {
        // Main market trading via contract
        const txHash = await contractClient.placeOrder(marketId, orderData);
        showTransactionStatus(txHash, 'Order Placement');
      }
      
      // Refresh data
      refetchOrderbook();
      refetchPositions();
    } catch (error) {
      showError(error.message);
    }
  };

  // Real-time settlement status updates
  useEffect(() => {
    if (!market?.status || market.status !== 'resolved') return;

    const subscription = setupSettlementUpdates(marketId, (settlement) => {
      showSettlementNotification(settlement);
      // Update UI to show settlement results
      updateMarketSettlement(settlement);
    });

    return () => subscription?.unsubscribe();
  }, [market?.status]);
}
```

#### 4.3 Enhanced Trade Panel

**Update: `components/trade/TradePanel.tsx`**

```typescript
export default function TradePanel({ market, onOrderPlaced }: TradePanelProps) {
  const { contractClient, isCorrectNetwork } = useAuth();
  const [allowance, setAllowance] = useState<BigNumber>(0);
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Check token allowance for trades
  useEffect(() => {
    const checkAllowance = async () => {
      if (!contractClient || !market?.requiredToken) return;

      const currentAllowance = await contractClient.getAllowance(
        market.requiredToken,
        walletAddress,
        contractAddresses.orderBook
      );
      
      setAllowance(currentAllowance);
      setRequiresApproval(currentAllowance.lt(calculateRequiredAmount()));
    };

    checkAllowance();
  }, [contractClient, market, walletAddress]);

  const handleApprove = async () => {
    try {
      const txHash = await contractClient.approveToken(
        market.requiredToken,
        ethers.constants.MaxUint256
      );
      showTransactionStatus(txHash, 'Token Approval');
    } catch (error) {
      showError('Approval failed');
    }
  };

  const handlePlaceOrder = async () => {
    if (!isCorrectNetwork) {
      await switchToCorrectNetwork();
      return;
    }

    if (requiresApproval) {
      await handleApprove();
      return;
    }

    // Proceed with order placement logic...
  };
}
```

### Phase 5: Error Handling & UX Improvements

#### 5.1 Network Error Handling

**New File: `components/ui/ErrorBoundary.tsx`**

```typescript
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to monitoring service
    console.error('Application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h2>Something went wrong</h2>
          <button onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

#### 5.2 Transaction Status Management

**New File: `components/ui/TransactionStatus.tsx`**

```typescript
export function useTransactionStatus() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const showTransactionStatus = (txHash: string, type: string) => {
    const transaction = {
      id: txHash,
      type,
      status: 'pending',
      timestamp: Date.now(),
    };
    
    setTransactions(prev => [transaction, ...prev]);

    // Monitor transaction confirmation
    monitorTransaction(txHash).then(result => {
      updateTransactionStatus(txHash, result);
    });
  };

  return { transactions, showTransactionStatus };
}
```

### Phase 6: Testnet Configuration

#### 6.1 Environment-Specific Configuration

**New File: `lib/testnet-config.ts`**

```typescript
interface TestnetConfig {
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  contractAddresses: Record<string, string>;
  faucetUrls: {
    eth: string;
    tokens: Record<string, string>;
  };
}

export const TESTNET_CONFIGS: Record<string, TestnetConfig> = {
  sepolia: {
    chainId: 11155111,
    rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC || '',
    explorerUrl: 'https://sepolia.etherscan.io',
    contractAddresses: {
      marketRegistry: process.env.NEXT_PUBLIC_SEPOLIA_MARKET_REGISTRY || '',
      orderBook: process.env.NEXT_PUBLIC_SEPOLIA_ORDERBOOK || '',
    },
    faucetUrls: {
      eth: 'https://sepoliafaucet.com',
      tokens: {
        USDT: 'https://testnet.binance.org/faucet-smart',
      }
    }
  },
  mumbai: {
    chainId: 80001,
    rpcUrl: process.env.NEXT_PUBLIC_MUMBAI_RPC || '',
    explorerUrl: 'https://mumbai.polygonscan.com',
    contractAddresses: {
      marketRegistry: process.env.NEXT_PUBLIC_MUMBAI_MARKET_REGISTRY || '',
      orderBook: process.env.NEXT_PUBLIC_MUMBAI_ORDERBOOK || '',
    },
    faucetUrls: {
      eth: 'https://faucet.polygon.technology',
      tokens: {
        USDT: 'https://faucet.polygon.technology',
      }
    }
  }
};
```

#### 6.2 Network Switcher Component

**New File: `components/ui/NetworkSwitcher.tsx`**

```typescript
export function NetworkSwitcher() {
  const { network, switchNetwork } = useAuth();
  const [availableNetworks] = useState(TESTNET_CONFIGS);

  const handleNetworkChange = async (networkKey: string) => {
    const config = availableNetworks[networkKey];
    await switchNetwork(config.chainId);
  };

  return (
    <div className="network-switcher">
      <select 
        value={network?.chainId} 
        onChange={(e) => handleNetworkChange(e.target.value)}
      >
        {Object.entries(availableNetworks).map(([key, config]) => (
          <option key={key} value={config.chainId}>
            {key} (Chain ID: {config.chainId})
          </option>
        ))}
      </select>
      
      <div className="faucet-links">
        <a href={availableNetworks[network?.name]?.faucetUrls.eth} target="_blank">
          Get Test ETH
        </a>
      </div>
    </div>
  );
}
```

## Implementation Sequence

### Milestone 1: Foundation (Week 1-2)
1. Create API client infrastructure
2. Implement environment configuration
3. Set up basic contract client structure
4. Add error boundaries and basic error handling

### Milestone 2: Authentication Evolution (Week 2-3)
1. Enhance AuthContext with real wallet integration
2. Add network detection and switching
3. Implement contract interaction scaffolding
4. Add transaction status tracking

### Milestone 3: Market Data Integration (Week 3-4)
1. Replace useStore with remote queries for markets
2. Implement real-time data subscriptions
3. Add WebSocket client for live updates
4. Update market pages with live data

### Milestone 4: Trading Flow Implementation (Week 4-5)
1. Implement contract-based order placement
2. Add token approval workflows
3. Update TradePanel with real transaction flows
4. Add settlement status tracking

### Milestone 5: Portfolio Integration (Week 5-6)
1. Replace portfolio store with live data
2. Implement position tracking from contracts
3. Add real portfolio history
4. Update account overview with live balances

### Milestone 6: Production Hardening (Week 6-7)
1. Add comprehensive error handling
2. Implement retry logic and offline support
3. Add performance monitoring
4. Testnet deployment and testing

## API Contract Specifications

### Market Data APIs

```typescript
// GET /api/markets
interface MarketsResponse {
  markets: Market[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

// GET /api/markets/{id}
interface MarketResponse {
  id: string;
  question: string;
  category: string;
  status: MarketStatus;
  outcomes: Outcome[];
  volume: number;
  phase: 'sandbox_curve' | 'main_clob';
  settlement?: {
    result: string;
    timestamp: number;
    contractAddress: string;
  };
}

// POST /api/markets/{id}/orders
interface OrderRequest {
  userId: string;
  side: 'BUY' | 'SELL';
  outcome: 'YES' | 'NO';
  price?: number; // For limit orders
  size: number;
  type: 'MARKET' | 'LIMIT';
}

interface OrderResponse {
  orderId: string;
  status: 'PENDING' | 'FILLED' | 'PARTIAL' | 'CANCELLED';
  transactionHash?: string;
  filledSize: number;
  averagePrice: number;
}
```

### User APIs

```typescript
// GET /api/users/{id}/portfolio
interface PortfolioResponse {
  totalValue: number;
  totalPnL: number;
  positions: Position[];
  availableBalance: number;
  pendingBalance: number;
}

// GET /api/users/{id}/positions
interface PositionsResponse {
  positions: {
    marketId: string;
    marketQuestion: string;
    outcome: string;
    size: number;
    averagePrice: number;
    unrealizedPnL: number;
    realizedPnL: number;
  }[];
}
```

## Testing Strategy

### Unit Tests
- API client functionality
- Contract interaction utilities
- State management hooks
- Error handling components

### Integration Tests
- End-to-end trading flows
- Real-time data synchronization
- Wallet connection workflows
- Network switching scenarios

### Testnet Testing
- Deploy contracts to testnet
- Test with real transactions
- Verify settlement mechanisms
- Performance under load

## Monitoring & Analytics

### Key Metrics
- Transaction success rates
- API response times
- User engagement metrics
- Error rates by component

### Logging
- Transaction events
- User interactions
- Performance metrics
- Error tracking

This integration plan provides a concrete path from the current mock-based system to a production-ready application with real blockchain integration, while maintaining the existing user experience and gradually introducing new capabilities.