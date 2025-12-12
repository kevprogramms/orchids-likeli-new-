# Likeli Smart Contract Architecture Plan

## Executive Summary

This document outlines the on-chain architecture for Likeli's prediction market platform, covering market creation, trading, resolution, and settlement. The design supports two market types: **Sandbox Markets** (bonding curve AMM) and **Main Markets** (Central Limit Order Book), with a graduation path between them.

The architecture is designed to be implemented on EVM-compatible chains and integrate seamlessly with the existing Next.js UI flows.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Contracts](#core-contracts)
3. [Storage Layouts](#storage-layouts)
4. [Market Lifecycle](#market-lifecycle)
5. [UI Integration](#ui-integration)
6. [Security Considerations](#security-considerations)
7. [Migration Strategy](#migration-strategy)
8. [Testnet Deployment Plan](#testnet-deployment-plan)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Likeli Frontend                      │
│        (CreateMarketModal, TradePanel, etc.)           │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Smart Contracts                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ MarketFactory│  │ Collateral   │  │ Resolution   │  │
│  │              │  │ Vault        │  │ Oracle       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         ▼                 ▼                 ▼           │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Market Instances                         │  │
│  │  ┌────────────────┐    ┌────────────────┐       │  │
│  │  │ SandboxMarket  │    │  MainMarket    │       │  │
│  │  │ (Bonding Curve)│    │  (Order Book)  │       │  │
│  │  └────────────────┘    └────────────────┘       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ Position     │  │ Parlay       │                    │
│  │ Manager      │  │ Manager      │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Modularity**: Separate concerns (trading, collateral, resolution) into distinct contracts
2. **Upgradeability**: Use proxy patterns for core contracts to allow bug fixes and feature additions
3. **Gas Efficiency**: Optimize for common operations (placing orders, trading)
4. **Security**: Implement comprehensive checks and invariants
5. **Compatibility**: Design for integration with existing UI flows

---

## Core Contracts

### 1. MarketFactory

**Purpose**: Factory pattern for creating and managing markets. Maintains registry of all markets.

**Key Responsibilities**:
- Create new markets (sandbox or main)
- Track all active markets
- Enforce creation requirements (fees, minimum liquidity)
- Manage market graduation (sandbox → main)
- Set market parameters (fee rates, tick sizes)

**Storage Layout**:

```solidity
contract MarketFactory {
    // Market registry
    mapping(uint256 => address) public markets;
    mapping(address => bool) public isValidMarket;
    uint256 public marketCount;
    
    // Configuration
    address public collateralVault;
    address public resolutionOracle;
    address public positionManager;
    uint256 public creationFee; // e.g., 50 USDC
    uint256 public minInitialLiquidity; // e.g., 100 USDC
    
    // Fee structure
    uint256 public makerFeeBps; // e.g., 10 bps (0.1%)
    uint256 public takerFeeBps; // e.g., 20 bps (0.2%)
    
    // Graduation criteria
    uint256 public graduationVolumeThreshold; // e.g., 10,000 USDC
    uint256 public graduationLiquidityThreshold; // e.g., 5,000 USDC
    
    // Access control
    address public admin;
    mapping(address => bool) public marketCreators;
}
```

**Key Functions**:

```solidity
// Market creation
function createSandboxMarket(
    string memory question,
    string memory category,
    uint256 resolutionDate,
    string memory rules,
    uint256 initialLiquidity
) external payable returns (address marketAddress);

function createMainMarket(
    string memory question,
    string memory category,
    uint256 resolutionDate,
    string memory rules,
    uint256 initialLiquidity
) external payable returns (address marketAddress);

// Graduation
function graduateMarket(uint256 marketId) external;

// Configuration
function setCreationFee(uint256 newFee) external onlyAdmin;
function setFeeStructure(uint256 makerBps, uint256 takerBps) external onlyAdmin;
function setGraduationCriteria(uint256 volume, uint256 liquidity) external onlyAdmin;

// Queries
function getMarket(uint256 marketId) external view returns (address);
function getActiveMarkets() external view returns (address[] memory);
function getMarketsByCategory(string memory category) external view returns (address[] memory);
```

**Events**:

```solidity
event MarketCreated(
    uint256 indexed marketId,
    address indexed marketAddress,
    address indexed creator,
    string question,
    uint8 marketType, // 0 = Sandbox, 1 = Main
    uint256 resolutionDate
);

event MarketGraduated(
    uint256 indexed marketId,
    address indexed oldAddress,
    address indexed newAddress,
    uint256 timestamp
);

event CreationFeeUpdated(uint256 oldFee, uint256 newFee);
```

---

### 2. SandboxMarket (Bonding Curve AMM)

**Purpose**: Implements automated market making using a linear bonding curve. Provides instant liquidity for community-created markets.

**Key Responsibilities**:
- Accept buy/sell orders with instant execution
- Maintain bonding curve parameters (supply, reserve, price range)
- Calculate prices dynamically based on supply
- Track price history for charting
- Manage creator liquidity provision

**Storage Layout**:

```solidity
contract SandboxMarket {
    // Market metadata
    uint256 public marketId;
    string public question;
    string public category;
    uint256 public resolutionDate;
    string public rules;
    address public creator;
    
    // Market state
    enum MarketStatus { ACTIVE, RESOLVED, VOID, GRADUATED }
    MarketStatus public status;
    uint8 public winningOutcome; // 0 = YES, 1 = NO, 2 = VOID
    
    // Bonding curve parameters
    struct Curve {
        uint256 supply;           // Current token supply
        uint256 reserve;          // USD reserve backing
        uint256 minPrice;         // e.g., 0.10 (10 cents)
        uint256 maxPrice;         // e.g., 0.90 (90 cents)
        uint256 maxSupply;        // Maximum supply before curve flattens
    }
    
    Curve public yesCurve;
    Curve public noCurve;
    
    // Curve configuration
    uint256 public constant CURVE_DEPTH_USD = 1000e6; // 1000 USDC in 6 decimals
    uint256 public constant PRICE_PRECISION = 1e18;
    
    // Trading statistics
    uint256 public totalVolume;
    uint256 public tradeCount;
    
    // Price history (for charting)
    struct PriceSnapshot {
        uint256 timestamp;
        uint256 yesPrice;
        uint256 noPrice;
        uint256 yesProbability;
        uint256 noProbability;
    }
    PriceSnapshot[] public priceHistory;
    
    // References
    address public factory;
    address public collateralVault;
    address public positionManager;
}
```

**Key Functions**:

```solidity
// Trading
function buy(
    uint8 outcome,      // 0 = YES, 1 = NO
    uint256 amountUsd   // Amount in USDC
) external returns (uint256 sharesPurchased);

function sell(
    uint8 outcome,
    uint256 shares
) external returns (uint256 usdReceived);

// Curve calculations
function getBuyCost(uint8 outcome, uint256 shares) public view returns (uint256 cost);
function getSellPayout(uint8 outcome, uint256 shares) public view returns (uint256 payout);
function getCurrentPrice(uint8 outcome) public view returns (uint256 price);
function getProbabilities() public view returns (uint256 yesProb, uint256 noProb);

// Liquidity
function addLiquidity(uint256 amountUsd) external;
function removeLiquidity(uint256 shares) external returns (uint256 usdReceived);

// Price history
function recordPriceSnapshot() internal;
function getPriceHistory(uint256 fromTime, uint256 toTime) external view returns (PriceSnapshot[] memory);

// Resolution
function resolve(uint8 outcome) external onlyOracle;
function claimPayout() external;

// Graduation
function graduateToMain() external returns (address newMarket);
```

**Bonding Curve Math**:

```solidity
// Linear bonding curve implementation
// Price = minPrice + (maxPrice - minPrice) * (supply / maxSupply)

function priceAtSupply(Curve memory curve, uint256 supply) internal pure returns (uint256) {
    if (supply >= curve.maxSupply) {
        return curve.maxPrice;
    }
    
    uint256 priceRange = curve.maxPrice - curve.minPrice;
    uint256 priceIncrease = (priceRange * supply) / curve.maxSupply;
    
    return curve.minPrice + priceIncrease;
}

// Cost to buy 'delta' shares (area under curve)
function buyCost(Curve memory curve, uint256 delta) internal pure returns (uint256) {
    uint256 startSupply = curve.supply;
    uint256 endSupply = startSupply + delta;
    
    uint256 startPrice = priceAtSupply(curve, startSupply);
    uint256 endPrice = priceAtSupply(curve, endSupply);
    
    // Trapezoidal integration
    return ((startPrice + endPrice) * delta) / (2 * PRICE_PRECISION);
}

// Payout for selling 'delta' shares
function sellPayout(Curve memory curve, uint256 delta) internal pure returns (uint256) {
    uint256 startSupply = curve.supply;
    uint256 endSupply = startSupply - delta;
    
    uint256 startPrice = priceAtSupply(curve, startSupply);
    uint256 endPrice = priceAtSupply(curve, endSupply);
    
    return ((startPrice + endPrice) * delta) / (2 * PRICE_PRECISION);
}
```

**Events**:

```solidity
event Trade(
    address indexed user,
    uint8 indexed outcome,
    bool isBuy,
    uint256 shares,
    uint256 cost,
    uint256 newPrice,
    uint256 timestamp
);

event LiquidityAdded(address indexed provider, uint256 amount);
event LiquidityRemoved(address indexed provider, uint256 amount);
event PriceUpdate(uint256 yesPrice, uint256 noPrice, uint256 yesProb, uint256 noProb);
event MarketResolved(uint8 winningOutcome, uint256 timestamp);
event PayoutClaimed(address indexed user, uint256 amount);
```

---

### 3. MainMarket (Central Limit Order Book)

**Purpose**: Implements a fully-featured CLOB with limit and market orders. Provides deep liquidity and price discovery for graduated markets.

**Key Responsibilities**:
- Accept and manage limit orders
- Execute market orders against the order book
- Match orders using price-time priority
- Track individual positions per user
- Manage order cancellations
- Calculate mid-market prices

**Storage Layout**:

```solidity
contract MainMarket {
    // Market metadata (same as SandboxMarket)
    uint256 public marketId;
    string public question;
    string public category;
    uint256 public resolutionDate;
    string public rules;
    
    enum MarketStatus { ACTIVE, RESOLVED, VOID }
    MarketStatus public status;
    uint8 public winningOutcome;
    
    // Order book structure
    struct Order {
        uint256 orderId;
        address user;
        uint8 outcome;        // 0 = YES, 1 = NO
        bool isBid;           // true = Buy, false = Sell
        uint256 price;        // Price in PRICE_PRECISION units (0.01 to 0.99)
        uint256 size;         // Shares (original)
        uint256 remainingSize; // Shares (unfilled)
        uint256 timestamp;
        bool cancelled;
    }
    
    // Order storage
    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId;
    
    // Order book indexes (for efficient matching)
    // outcome => price => orderId[]
    mapping(uint8 => mapping(uint256 => uint256[])) public bidsByPrice;
    mapping(uint8 => mapping(uint256 => uint256[])) public asksByPrice;
    
    // Sorted price levels (for iteration)
    mapping(uint8 => uint256[]) public bidPriceLevels;
    mapping(uint8 => uint256[]) public askPriceLevels;
    
    // User orders
    mapping(address => uint256[]) public userOrders;
    
    // Trading statistics
    uint256 public totalVolume;
    uint256 public totalTrades;
    uint256 public lastTradePrice;
    uint256 public lastTradeTime;
    
    // Fee structure
    uint256 public makerFeeBps;
    uint256 public takerFeeBps;
    
    // Price constraints
    uint256 public constant TICK_SIZE = 0.01e18; // 1 cent
    uint256 public constant MIN_PRICE = 0.01e18;
    uint256 public constant MAX_PRICE = 0.99e18;
    
    // References
    address public factory;
    address public collateralVault;
    address public positionManager;
}
```

**Key Functions**:

```solidity
// Order placement
function placeLimitOrder(
    uint8 outcome,
    bool isBid,
    uint256 price,
    uint256 size
) external returns (uint256 orderId);

function placeMarketOrder(
    uint8 outcome,
    bool isBuy,
    uint256 size
) external returns (uint256[] memory filledOrderIds);

// Order management
function cancelOrder(uint256 orderId) external;
function cancelAllOrders() external;

// Order matching (internal)
function matchOrder(
    Order memory takerOrder
) internal returns (uint256[] memory makerOrderIds, uint256 filledSize);

// Order book queries
function getBids(uint8 outcome, uint256 limit) external view returns (Order[] memory);
function getAsks(uint8 outcome, uint256 limit) external view returns (Order[] memory);
function getOrderBook(uint8 outcome) external view returns (
    uint256[] memory bidPrices,
    uint256[] memory bidSizes,
    uint256[] memory askPrices,
    uint256[] memory askSizes
);

function getBestBid(uint8 outcome) public view returns (uint256 price, uint256 size);
function getBestAsk(uint8 outcome) public view returns (uint256 price, uint256 size);
function getMidPrice(uint8 outcome) public view returns (uint256);

// User queries
function getUserOrders(address user) external view returns (Order[] memory);
function getActiveOrders(address user) external view returns (Order[] memory);

// Resolution
function resolve(uint8 outcome) external onlyOracle;
function claimPayout() external;
```

**Order Matching Algorithm**:

```solidity
// Price-Time Priority Matching
function matchOrder(Order memory taker) internal returns (uint256 filledSize) {
    uint8 outcome = taker.outcome;
    uint256[] storage priceLevel;
    
    if (taker.isBid) {
        // Buy order: match against asks (ascending price)
        priceLevel = askPriceLevels[outcome];
    } else {
        // Sell order: match against bids (descending price)
        priceLevel = bidPriceLevels[outcome];
    }
    
    filledSize = 0;
    
    for (uint i = 0; i < priceLevel.length && taker.remainingSize > 0; i++) {
        uint256 price = priceLevel[i];
        
        // Check if price is acceptable
        bool priceMatches = taker.isBid 
            ? price <= taker.price 
            : price >= taker.price;
        
        if (!priceMatches) break;
        
        // Get orders at this price level (FIFO)
        uint256[] storage orderIds = taker.isBid 
            ? asksByPrice[outcome][price] 
            : bidsByPrice[outcome][price];
        
        for (uint j = 0; j < orderIds.length && taker.remainingSize > 0; j++) {
            Order storage maker = orders[orderIds[j]];
            
            if (maker.cancelled || maker.remainingSize == 0) continue;
            
            uint256 matchSize = min(taker.remainingSize, maker.remainingSize);
            
            // Execute trade
            executeTrade(taker, maker, price, matchSize);
            
            taker.remainingSize -= matchSize;
            maker.remainingSize -= matchSize;
            filledSize += matchSize;
        }
    }
    
    return filledSize;
}

function executeTrade(
    Order memory taker,
    Order storage maker,
    uint256 price,
    uint256 size
) internal {
    // Calculate fees
    uint256 makerFee = (size * price * makerFeeBps) / 10000;
    uint256 takerFee = (size * price * takerFeeBps) / 10000;
    
    // Update positions via PositionManager
    IPositionManager(positionManager).updatePosition(
        taker.user,
        marketId,
        taker.outcome,
        taker.isBid,
        size,
        price,
        takerFee
    );
    
    IPositionManager(positionManager).updatePosition(
        maker.user,
        marketId,
        maker.outcome,
        maker.isBid,
        size,
        price,
        makerFee
    );
    
    // Update statistics
    totalVolume += size * price;
    totalTrades++;
    lastTradePrice = price;
    lastTradeTime = block.timestamp;
    
    emit TradeExecuted(
        taker.user,
        maker.user,
        taker.outcome,
        price,
        size,
        makerFee,
        takerFee,
        block.timestamp
    );
}
```

**Events**:

```solidity
event OrderPlaced(
    uint256 indexed orderId,
    address indexed user,
    uint8 indexed outcome,
    bool isBid,
    uint256 price,
    uint256 size,
    uint256 timestamp
);

event OrderCancelled(uint256 indexed orderId, address indexed user);

event TradeExecuted(
    address indexed taker,
    address indexed maker,
    uint8 indexed outcome,
    uint256 price,
    uint256 size,
    uint256 makerFee,
    uint256 takerFee,
    uint256 timestamp
);

event MarketResolved(uint8 winningOutcome, uint256 timestamp);
event PayoutClaimed(address indexed user, uint256 amount);
```

---

### 4. CollateralVault

**Purpose**: Central treasury that holds all user deposits, manages collateralization, and handles payouts.

**Key Responsibilities**:
- Accept user deposits (USDC or other stablecoins)
- Track user balances
- Lock collateral for open positions/orders
- Release collateral when positions close
- Process withdrawals
- Handle market settlements
- Enforce solvency constraints

**Storage Layout**:

```solidity
contract CollateralVault {
    // Supported collateral token (e.g., USDC)
    IERC20 public collateralToken;
    
    // User balances
    mapping(address => uint256) public balance;        // Total balance
    mapping(address => uint256) public lockedBalance;  // Locked for positions/orders
    
    // Global statistics
    uint256 public totalDeposits;
    uint256 public totalWithdrawn;
    uint256 public totalLocked;
    
    // Market allowances (which contracts can lock/unlock funds)
    mapping(address => bool) public authorizedMarkets;
    
    // Withdrawal delays (for security)
    struct WithdrawalRequest {
        uint256 amount;
        uint256 unlockTime;
    }
    mapping(address => WithdrawalRequest) public pendingWithdrawals;
    uint256 public withdrawalDelay; // e.g., 1 hour
    
    // Access control
    address public admin;
    address public factory;
}
```

**Key Functions**:

```solidity
// Deposits & Withdrawals
function deposit(uint256 amount) external;
function requestWithdrawal(uint256 amount) external;
function completeWithdrawal() external;
function cancelWithdrawal() external;

// Balance queries
function getAvailableBalance(address user) external view returns (uint256);
function getLockedBalance(address user) external view returns (uint256);
function getTotalBalance(address user) external view returns (uint256);

// Collateral management (called by markets)
function lockCollateral(address user, uint256 amount) external onlyAuthorizedMarket;
function unlockCollateral(address user, uint256 amount) external onlyAuthorizedMarket;
function transferCollateral(address from, address to, uint256 amount) external onlyAuthorizedMarket;

// Settlement
function processSettlement(
    address[] calldata winners,
    uint256[] calldata amounts
) external onlyAuthorizedMarket;

// Admin functions
function authorizeMarket(address market) external onlyAdmin;
function revokeMarketAuthorization(address market) external onlyAdmin;
function setWithdrawalDelay(uint256 delay) external onlyAdmin;

// Emergency functions
function pause() external onlyAdmin;
function unpause() external onlyAdmin;
function emergencyWithdraw(address token, address to, uint256 amount) external onlyAdmin;
```

**Security Invariants**:

```solidity
// The vault must always be solvent
function checkSolvency() public view returns (bool) {
    uint256 vaultBalance = collateralToken.balanceOf(address(this));
    return vaultBalance >= totalLocked;
}

// No user can withdraw more than their available balance
modifier hasSufficientBalance(address user, uint256 amount) {
    require(balance[user] - lockedBalance[user] >= amount, "Insufficient available balance");
    _;
}
```

**Events**:

```solidity
event Deposit(address indexed user, uint256 amount);
event WithdrawalRequested(address indexed user, uint256 amount, uint256 unlockTime);
event WithdrawalCompleted(address indexed user, uint256 amount);
event WithdrawalCancelled(address indexed user);
event CollateralLocked(address indexed user, uint256 amount, address indexed market);
event CollateralUnlocked(address indexed user, uint256 amount, address indexed market);
event SettlementProcessed(address indexed market, uint256 totalPayout);
```

---

### 5. ResolutionOracle

**Purpose**: Manages the resolution of markets with a decentralized oracle system.

**Key Responsibilities**:
- Accept resolution proposals
- Manage dispute periods
- Finalize market outcomes
- Handle void/invalid resolutions
- Integrate with external oracles (Chainlink, UMA, etc.)

**Storage Layout**:

```solidity
contract ResolutionOracle {
    // Resolution proposals
    struct ResolutionProposal {
        address proposer;
        uint8 proposedOutcome;  // 0 = YES, 1 = NO, 2 = VOID
        uint256 proposalTime;
        uint256 disputeDeadline;
        bool finalized;
        bool disputed;
    }
    
    mapping(address => ResolutionProposal) public proposals; // market => proposal
    
    // Resolver roles
    mapping(address => bool) public authorizedResolvers;
    mapping(address => bool) public disputeArbitrators;
    
    // Resolution parameters
    uint256 public disputePeriod;       // e.g., 24 hours
    uint256 public minResolutionDelay;  // Time after resolution date
    
    // Dispute bonds
    uint256 public disputeBondAmount;   // e.g., 1000 USDC
    mapping(address => mapping(address => uint256)) public disputeBonds; // market => disputer => bond
    
    // Factory reference
    address public factory;
    address public collateralVault;
}
```

**Key Functions**:

```solidity
// Resolution lifecycle
function proposeResolution(
    address market,
    uint8 outcome
) external onlyAuthorizedResolver;

function disputeResolution(
    address market,
    string memory reason
) external payable;

function finalizeResolution(address market) external;

function resolveDispute(
    address market,
    uint8 finalOutcome
) external onlyArbitrator;

// Resolver management
function addResolver(address resolver) external onlyAdmin;
function removeResolver(address resolver) external onlyAdmin;
function addArbitrator(address arbitrator) external onlyAdmin;

// Configuration
function setDisputePeriod(uint256 period) external onlyAdmin;
function setDisputeBond(uint256 amount) external onlyAdmin;

// Queries
function getProposal(address market) external view returns (ResolutionProposal memory);
function isInDisputePeriod(address market) public view returns (bool);
function canFinalize(address market) public view returns (bool);
```

**Resolution Flow**:

```
1. Market reaches resolution date
2. Authorized resolver proposes outcome (+ dispute period starts)
3. Anyone can dispute with bond
4. If no dispute after dispute period → auto-finalize
5. If disputed → arbitrator reviews and resolves
6. Losing disputer forfeits bond to winner
```

**Events**:

```solidity
event ResolutionProposed(
    address indexed market,
    address indexed proposer,
    uint8 outcome,
    uint256 disputeDeadline
);

event ResolutionDisputed(
    address indexed market,
    address indexed disputer,
    string reason,
    uint256 bondAmount
);

event ResolutionFinalized(
    address indexed market,
    uint8 finalOutcome,
    uint256 timestamp
);

event DisputeResolved(
    address indexed market,
    uint8 finalOutcome,
    address indexed arbitrator,
    bool disputerWon
);
```

---

### 6. PositionManager

**Purpose**: Tracks user positions across all markets, calculates PnL, and manages position lifecycle.

**Key Responsibilities**:
- Track shares owned per user per market per outcome
- Calculate average entry prices
- Track realized and unrealized PnL
- Handle position updates from trades
- Process settlements and payouts
- Enforce no-shorting rules

**Storage Layout**:

```solidity
contract PositionManager {
    // Position tracking
    struct Position {
        uint256 shares;         // Number of shares held
        uint256 avgPrice;       // Average entry price (weighted)
        uint256 realizedPnl;    // Realized profit/loss
        uint256 totalCost;      // Total cost basis
    }
    
    // user => marketId => outcome => Position
    mapping(address => mapping(uint256 => mapping(uint8 => Position))) public positions;
    
    // User position list (for enumeration)
    mapping(address => uint256[]) public userMarkets;
    
    // References
    address public factory;
    address public collateralVault;
}
```

**Key Functions**:

```solidity
// Position updates (called by markets)
function updatePosition(
    address user,
    uint256 marketId,
    uint8 outcome,
    bool isIncrease,
    uint256 shares,
    uint256 price,
    uint256 fee
) external onlyAuthorizedMarket;

// Position queries
function getPosition(
    address user,
    uint256 marketId,
    uint8 outcome
) external view returns (Position memory);

function getUserPositions(address user) external view returns (
    uint256[] memory marketIds,
    uint8[] memory outcomes,
    Position[] memory positions
);

function getUnrealizedPnl(
    address user,
    uint256 marketId,
    uint8 outcome,
    uint256 currentPrice
) public view returns (int256);

// Settlement
function settlePosition(
    address user,
    uint256 marketId,
    uint8 winningOutcome
) external onlyAuthorizedMarket returns (uint256 payout);

function batchSettleMarket(
    uint256 marketId,
    uint8 winningOutcome,
    address[] calldata users
) external onlyAuthorizedMarket;

// Validation
function canSell(
    address user,
    uint256 marketId,
    uint8 outcome,
    uint256 shares
) public view returns (bool);
```

**Position Update Logic**:

```solidity
function updatePosition(
    address user,
    uint256 marketId,
    uint8 outcome,
    bool isIncrease,
    uint256 shares,
    uint256 price,
    uint256 fee
) external onlyAuthorizedMarket {
    Position storage pos = positions[user][marketId][outcome];
    
    if (isIncrease) {
        // Buying shares
        uint256 cost = shares * price + fee;
        
        // Update average price (weighted)
        uint256 totalCost = pos.totalCost + cost;
        uint256 totalShares = pos.shares + shares;
        
        pos.shares = totalShares;
        pos.avgPrice = totalShares > 0 ? totalCost * 1e18 / totalShares : 0;
        pos.totalCost = totalCost;
        
        // Lock collateral
        ICollateralVault(collateralVault).lockCollateral(user, cost);
        
    } else {
        // Selling shares
        require(pos.shares >= shares, "Insufficient shares");
        
        uint256 proceeds = shares * price - fee;
        uint256 costBasis = (shares * pos.avgPrice) / 1e18;
        
        // Calculate realized PnL
        int256 pnl = int256(proceeds) - int256(costBasis);
        pos.realizedPnl = uint256(int256(pos.realizedPnl) + pnl);
        
        // Update position
        pos.shares -= shares;
        pos.totalCost -= costBasis;
        
        if (pos.shares == 0) {
            pos.avgPrice = 0;
        }
        
        // Unlock and transfer collateral
        ICollateralVault(collateralVault).unlockCollateral(user, costBasis);
        ICollateralVault(collateralVault).transferCollateral(
            address(this),
            user,
            proceeds
        );
    }
    
    emit PositionUpdated(user, marketId, outcome, pos.shares, pos.avgPrice);
}
```

**Settlement Logic**:

```solidity
function settlePosition(
    address user,
    uint256 marketId,
    uint8 winningOutcome
) external onlyAuthorizedMarket returns (uint256 payout) {
    Position storage pos = positions[user][marketId][winningOutcome];
    
    if (pos.shares == 0) return 0;
    
    // Winning shares pay out 1:1
    payout = pos.shares;
    
    // Update realized PnL
    uint256 costBasis = pos.totalCost;
    int256 pnl = int256(payout) - int256(costBasis);
    pos.realizedPnl = uint256(int256(pos.realizedPnl) + pnl);
    
    // Clear position
    pos.shares = 0;
    pos.avgPrice = 0;
    pos.totalCost = 0;
    
    // Process payout via vault
    ICollateralVault(collateralVault).unlockCollateral(user, costBasis);
    ICollateralVault(collateralVault).transferCollateral(
        address(this),
        user,
        payout
    );
    
    emit PositionSettled(user, marketId, winningOutcome, payout, pnl);
    
    return payout;
}
```

**Events**:

```solidity
event PositionUpdated(
    address indexed user,
    uint256 indexed marketId,
    uint8 indexed outcome,
    uint256 shares,
    uint256 avgPrice
);

event PositionSettled(
    address indexed user,
    uint256 indexed marketId,
    uint8 winningOutcome,
    uint256 payout,
    int256 pnl
);
```

---

### 7. ParlayManager (Optional)

**Purpose**: Manages multi-leg parlay bets where users combine multiple market outcomes.

**Key Responsibilities**:
- Accept parlay bet creation
- Lock stake for duration
- Track parlay status across market resolutions
- Calculate payouts based on combined odds
- Handle partial resolutions

**Storage Layout**:

```solidity
contract ParlayManager {
    struct ParlayLeg {
        uint256 marketId;
        uint8 outcome;
        uint256 oddsAtEntry; // Probability at time of bet
    }
    
    struct Parlay {
        uint256 parlayId;
        address user;
        ParlayLeg[] legs;
        uint256 stake;
        uint256 multiplier;
        uint256 potentialPayout;
        uint256 timestamp;
        uint8 status; // 0 = OPEN, 1 = WON, 2 = LOST, 3 = VOID
    }
    
    mapping(uint256 => Parlay) public parlays;
    mapping(address => uint256[]) public userParlays;
    uint256 public nextParlayId;
    
    // Configuration
    uint256 public houseEdge; // e.g., 5% (500 bps)
    uint256 public maxLegs;   // e.g., 10
    uint256 public minLegs;   // e.g., 2
    
    address public factory;
    address public collateralVault;
}
```

**Key Functions**:

```solidity
function createParlay(
    ParlayLeg[] memory legs,
    uint256 stake
) external returns (uint256 parlayId);

function checkParlayStatus(uint256 parlayId) external view returns (uint8 status);
function claimParlayPayout(uint256 parlayId) external;
function getUserParlays(address user) external view returns (Parlay[] memory);
```

---

## Market Lifecycle

### Stage 1: Market Creation

**Frontend Flow** (`CreateMarketModal.tsx`):
```javascript
// User fills form: question, category, resolution date, rules, initial liquidity
const response = await fetch("/api/markets/create", {
    method: "POST",
    body: JSON.stringify({
        question: "Will Bitcoin hit $100k by 2025?",
        category: "Crypto",
        resolutionDate: "2025-12-31",
        rules: "Resolved based on CoinMarketCap price...",
        initialLiquidity: 1000,  // USDC
        marketType: "sandbox"    // or "main"
    })
});
```

**Contract Calls**:
```solidity
// 1. User approves USDC transfer
USDC.approve(collateralVault, totalCost);

// 2. Factory creates market
MarketFactory.createSandboxMarket(
    question,
    category,
    resolutionDate,
    rules,
    initialLiquidity
);
    ↓
// 3. Factory deploys new SandboxMarket contract
SandboxMarket market = new SandboxMarket(...);

// 4. Factory deposits creation fee + initial liquidity
CollateralVault.deposit(creationFee + initialLiquidity);

// 5. Initial liquidity split between YES/NO curves
market.yesCurve.reserve = initialLiquidity / 2;
market.noCurve.reserve = initialLiquidity / 2;

// 6. Emit MarketCreated event
emit MarketCreated(marketId, address(market), msg.sender, question, 0, resolutionDate);
```

**Required Checks**:
- User has sufficient USDC balance
- Resolution date is in the future
- Initial liquidity >= minimum (e.g., 100 USDC)
- Question and rules are not empty
- User paid creation fee

---

### Stage 2: Active Trading

#### Sandbox Market (Bonding Curve)

**Frontend Flow** (`TradePanel.tsx` for sandbox):
```javascript
// User clicks "BUY YES" with $100
const response = await fetch(`/api/markets/${marketId}/trade`, {
    method: "POST",
    body: JSON.stringify({
        outcome: "YES",
        side: "BUY",
        amountUsd: 100
    })
});
```

**Contract Calls**:
```solidity
// 1. Calculate shares for $100
uint256 shares = market.calculateBuyShares(outcome, 100e6);

// 2. User deposits USDC to vault
CollateralVault.deposit(100e6);

// 3. Execute buy on bonding curve
SandboxMarket.buy(outcome=0, amountUsd=100e6);
    ↓
    // Update curve supply
    yesCurve.supply += shares;
    yesCurve.reserve += cost;
    
    // Update position
    PositionManager.updatePosition(user, marketId, 0, true, shares, price, fee);
    
    // Record price snapshot
    recordPriceSnapshot();
    
// 4. Emit Trade event
emit Trade(user, 0, true, shares, 100e6, newPrice, block.timestamp);
```

#### Main Market (Order Book)

**Frontend Flow** (`TradePanel.tsx` for main):
```javascript
// User places limit order: Buy YES @ $0.65, 1000 shares
const response = await fetch(`/api/markets/${marketId}/orders`, {
    method: "POST",
    body: JSON.stringify({
        outcome: "YES",
        side: "BUY",
        type: "LIMIT",
        price: 0.65,
        size: 1000
    })
});
```

**Contract Calls**:
```solidity
// 1. Validate order
require(price >= MIN_PRICE && price <= MAX_PRICE);
require(price % TICK_SIZE == 0);
require(size > 0);

// 2. Calculate max cost (for buy orders)
uint256 maxCost = size * price + fees;

// 3. Lock collateral
CollateralVault.lockCollateral(user, maxCost);

// 4. Place order
MainMarket.placeLimitOrder(outcome=0, isBid=true, price=0.65e18, size=1000);
    ↓
    // Try to match immediately
    uint256 filledSize = matchOrder(newOrder);
    
    if (filledSize < size) {
        // Add remaining to order book
        bidsByPrice[0][0.65e18].push(orderId);
        insertSorted(bidPriceLevels[0], 0.65e18);
    }
    
    // Emit event
    emit OrderPlaced(orderId, user, 0, true, 0.65e18, size, block.timestamp);

// 5. If matched, update positions
if (filledSize > 0) {
    PositionManager.updatePosition(user, marketId, 0, true, filledSize, avgFillPrice, fees);
}
```

**Market Order Execution**:
```solidity
// User: Market Buy YES, 500 shares
MainMarket.placeMarketOrder(outcome=0, isBuy=true, size=500);
    ↓
    // Match against best asks
    uint256 totalCost = 0;
    uint256 filled = 0;
    
    for (price in askPriceLevels[0]) {
        for (orderId in asksByPrice[0][price]) {
            if (filled >= 500) break;
            
            Order storage maker = orders[orderId];
            uint256 matchSize = min(500 - filled, maker.remainingSize);
            
            executeTrade(takerOrder, maker, price, matchSize);
            filled += matchSize;
            totalCost += matchSize * price;
        }
    }
    
    // Emit trades
    emit TradeExecuted(...);
```

---

### Stage 3: Market Graduation

**Trigger Conditions**:
- Volume >= threshold (e.g., 10,000 USDC)
- Liquidity >= threshold (e.g., 5,000 USDC)
- Age >= minimum (e.g., 7 days)
- Admin approval (optional)

**Contract Calls**:
```solidity
// 1. Check graduation criteria
require(market.totalVolume >= graduationVolumeThreshold);
require(market.yesCurve.reserve + market.noCurve.reserve >= graduationLiquidityThreshold);

// 2. Create new MainMarket
address newMarket = factory.createMainMarket(
    market.question,
    market.category,
    market.resolutionDate,
    market.rules,
    0 // No additional liquidity needed
);

// 3. Migrate positions
// Calculate current YES/NO prices from curves
uint256 yesPrice = market.getCurrentPrice(0);
uint256 noPrice = market.getCurrentPrice(1);

// For each user with positions in old market:
for (user in sandboxUsers) {
    Position memory oldPos = positionManager.getPosition(user, oldMarketId, outcome);
    
    // Create equivalent position in new market by:
    // Option A: Seed initial orders at current prices
    mainMarket.placeLimitOrder(outcome, false, yesPrice, oldPos.shares);
    
    // Option B: Direct position transfer (preferred)
    positionManager.transferPosition(user, oldMarketId, newMarketId, outcome, oldPos);
}

// 4. Migrate liquidity
// Transfer reserves from sandbox to main market's initial order book
uint256 totalReserve = market.yesCurve.reserve + market.noCurve.reserve;
collateralVault.transferCollateral(address(sandboxMarket), address(mainMarket), totalReserve);

// 5. Disable sandbox market (no new trades)
sandboxMarket.status = MarketStatus.GRADUATED;

// 6. Emit graduation event
emit MarketGraduated(oldMarketId, address(sandboxMarket), address(mainMarket), block.timestamp);
```

**Migration Strategy**:
- Users' positions are automatically transferred (shares + avg price + realized PnL)
- Existing limit orders at current curve prices seed the new order book
- All price history is preserved
- Users can immediately trade on the new main market

---

### Stage 4: Resolution

**Frontend Flow** (Admin Resolution Tool):
```javascript
// Resolver submits outcome after resolution date
const response = await fetch("/api/markets/resolve", {
    method: "POST",
    body: JSON.stringify({
        marketId: "m1",
        outcome: "YES",
        proof: "https://coinmarketcap.com/..."
    })
});
```

**Contract Calls**:
```solidity
// 1. Validate resolution timing
require(block.timestamp >= market.resolutionDate + minResolutionDelay);
require(market.status == MarketStatus.ACTIVE);

// 2. Oracle proposes resolution
ResolutionOracle.proposeResolution(marketAddress, outcome=0);
    ↓
    proposals[marketAddress] = ResolutionProposal({
        proposer: msg.sender,
        proposedOutcome: 0,
        proposalTime: block.timestamp,
        disputeDeadline: block.timestamp + disputePeriod,
        finalized: false,
        disputed: false
    });
    
    emit ResolutionProposed(marketAddress, msg.sender, 0, disputeDeadline);

// 3. Dispute period (24 hours)
// If disputed:
ResolutionOracle.disputeResolution(marketAddress, "Price source is wrong");
    ↓
    require(msg.value >= disputeBondAmount);
    proposals[marketAddress].disputed = true;
    disputeBonds[marketAddress][msg.sender] = msg.value;
    emit ResolutionDisputed(marketAddress, msg.sender, reason, msg.value);

// 4. Arbitrator resolves dispute (if any)
ResolutionOracle.resolveDispute(marketAddress, finalOutcome=0);
    ↓
    // Determine winner
    if (finalOutcome == proposals[marketAddress].proposedOutcome) {
        // Original proposer was correct, disputer loses bond
        payable(proposals[marketAddress].proposer).transfer(disputeBondAmount);
    } else {
        // Disputer was correct
        payable(disputer).transfer(disputeBondAmount * 2); // Return bond + reward
    }

// 5. Finalize resolution (auto or manual)
ResolutionOracle.finalizeResolution(marketAddress);
    ↓
    require(canFinalize(marketAddress)); // After dispute period or dispute resolved
    
    // Mark market as resolved
    market.resolve(proposals[marketAddress].proposedOutcome);
    proposals[marketAddress].finalized = true;
    
    emit ResolutionFinalized(marketAddress, finalOutcome, block.timestamp);
```

---

### Stage 5: Settlement & Payout

**Frontend Flow** (Automatic or Manual Claim):
```javascript
// User visits market page or portfolio, sees "Claim Payout" button
const response = await fetch(`/api/markets/${marketId}/claim`, {
    method: "POST"
});
```

**Contract Calls**:
```solidity
// Option 1: Individual claim
MainMarket.claimPayout();
    ↓
    require(status == MarketStatus.RESOLVED);
    
    uint8 winningOutcome = market.winningOutcome;
    
    // Get user's position
    Position memory pos = positionManager.getPosition(msg.sender, marketId, winningOutcome);
    require(pos.shares > 0, "No winning shares");
    
    // Calculate payout (1:1 for winning shares)
    uint256 payout = pos.shares;
    
    // Settle position
    positionManager.settlePosition(msg.sender, marketId, winningOutcome);
    
    // Transfer payout
    collateralVault.transferCollateral(address(this), msg.sender, payout);
    
    emit PayoutClaimed(msg.sender, payout);

// Option 2: Batch settlement (gas optimization)
PositionManager.batchSettleMarket(marketId, winningOutcome, [user1, user2, user3, ...]);
    ↓
    for (user in users) {
        Position memory pos = positions[user][marketId][winningOutcome];
        if (pos.shares > 0) {
            uint256 payout = pos.shares;
            // Process settlement
            settlePosition(user, marketId, winningOutcome);
        }
    }
```

**Settlement Accounting**:
```solidity
// Example: Market resolved to YES
// User A: 100 YES shares @ avg price 0.50 = cost 50 USDC
// Payout: 100 USDC (1:1)
// Profit: 100 - 50 = 50 USDC

// User B: 50 NO shares @ avg price 0.40 = cost 20 USDC
// Payout: 0 USDC (wrong outcome)
// Loss: -20 USDC

// Collateral accounting:
// Total locked: 50 + 20 = 70 USDC
// Total payout: 100 USDC
// The 30 USDC difference comes from the losing side's collateral
```

**Void Resolution** (Invalid Market):
```solidity
// Oracle resolves as VOID
ResolutionOracle.finalizeResolution(marketAddress, outcome=2);
    ↓
    market.resolve(2); // VOID
    
    // Return all locked collateral to users (both YES and NO)
    for (user in allUsers) {
        for (outcome in [YES, NO]) {
            Position memory pos = positions[user][marketId][outcome];
            if (pos.shares > 0) {
                // Refund cost basis
                uint256 refund = pos.totalCost;
                collateralVault.unlockCollateral(user, refund);
                collateralVault.transferCollateral(address(this), user, refund);
            }
        }
    }
```

---

## UI Integration

### CreateMarketModal → MarketFactory.createSandboxMarket

**Current Implementation** (`CreateMarketModal.tsx`):
- Collects: question, category, resolutionDate, rules, initialLiquidity
- Posts to `/api/sandbox/markets`
- Deducts balance (creation fee + liquidity)

**Smart Contract Integration**:
```javascript
// New implementation with wallet connection
import { useContractWrite } from 'wagmi';

const { write: createMarket } = useContractWrite({
    address: MARKET_FACTORY_ADDRESS,
    abi: MarketFactoryABI,
    functionName: 'createSandboxMarket',
});

const handleSubmit = async () => {
    // 1. Approve USDC
    await approveUSDC(totalCost);
    
    // 2. Call contract
    const tx = await createMarket({
        args: [
            question,
            category,
            Math.floor(new Date(date).getTime() / 1000), // Unix timestamp
            rules,
            parseUnits(liquidity, 6) // USDC has 6 decimals
        ],
        value: parseEther(creationFee) // If creation fee is in ETH
    });
    
    // 3. Wait for confirmation
    const receipt = await tx.wait();
    
    // 4. Extract marketId from event
    const event = receipt.events?.find(e => e.event === 'MarketCreated');
    const marketId = event?.args?.marketId;
    
    // 5. Navigate to market page
    router.push(`/market/${marketId}`);
};
```

---

### TradePanel → Market Contracts

**Current Implementation** (`TradePanel.tsx`):
- Supports both sandbox (curve) and main (order book) markets
- Handles market and limit orders
- Updates local state with trade results

**Smart Contract Integration**:

#### Sandbox Market Buy:
```javascript
const { write: buySandbox } = useContractWrite({
    address: market.address,
    abi: SandboxMarketABI,
    functionName: 'buy',
});

const handleSandboxBuy = async () => {
    // 1. Approve USDC
    await approveUSDC(amountUsd);
    
    // 2. Execute buy
    const tx = await buySandbox({
        args: [
            outcomeId === 'yes' ? 0 : 1,
            parseUnits(amountUsd, 6)
        ]
    });
    
    const receipt = await tx.wait();
    
    // 3. Extract shares from event
    const event = receipt.events?.find(e => e.event === 'Trade');
    const sharesPurchased = event?.args?.shares;
    
    // 4. Update UI
    setBalance(balance - amountUsd);
    onOrderPlaced();
};
```

#### Main Market Limit Order:
```javascript
const { write: placeLimitOrder } = useContractWrite({
    address: market.address,
    abi: MainMarketABI,
    functionName: 'placeLimitOrder',
});

const handleLimitOrder = async () => {
    const outcomeNum = outcomeId === 'yes' ? 0 : 1;
    const isBid = tradeSide === 'BUY';
    const priceWei = parseUnits(limitPrice, 18);
    const sizeNum = parseFloat(amount);
    
    // 1. Lock collateral (automatic via contract)
    
    // 2. Place order
    const tx = await placeLimitOrder({
        args: [outcomeNum, isBid, priceWei, sizeNum]
    });
    
    const receipt = await tx.wait();
    
    // 3. Get order ID from event
    const event = receipt.events?.find(e => e.event === 'OrderPlaced');
    const orderId = event?.args?.orderId;
    
    // 4. Update UI (show order in "My Orders")
    addOrderToUI(orderId);
    onOrderPlaced();
};
```

#### Main Market Market Order:
```javascript
const { write: placeMarketOrder } = useContractWrite({
    address: market.address,
    abi: MainMarketABI,
    functionName: 'placeMarketOrder',
});

const handleMarketOrder = async () => {
    const tx = await placeMarketOrder({
        args: [
            outcomeId === 'yes' ? 0 : 1,
            tradeSide === 'BUY',
            parseFloat(amount)
        ]
    });
    
    const receipt = await tx.wait();
    
    // Extract fill information from TradeExecuted events
    const trades = receipt.events?.filter(e => e.event === 'TradeExecuted') || [];
    const totalFilled = trades.reduce((sum, t) => sum + t.args.size, 0);
    const avgPrice = trades.reduce((sum, t) => sum + t.args.price * t.args.size, 0) / totalFilled;
    
    // Update UI
    onOrderPlaced();
};
```

---

### Market Page → Price History & Order Book

**Reading Contract State**:
```javascript
import { useContractRead, useContractReads } from 'wagmi';

// Get order book
const { data: orderBook } = useContractRead({
    address: market.address,
    abi: MainMarketABI,
    functionName: 'getOrderBook',
    args: [0], // YES outcome
    watch: true, // Live updates
});

// Get current price
const { data: currentPrice } = useContractRead({
    address: market.address,
    abi: market.isSandbox ? SandboxMarketABI : MainMarketABI,
    functionName: market.isSandbox ? 'getCurrentPrice' : 'getMidPrice',
    args: [0],
    watch: true,
});

// Get price history (via events or The Graph)
const { data: priceHistory } = useQuery(
    ['priceHistory', market.address],
    async () => {
        // Option 1: Query The Graph
        const result = await graphClient.query({
            query: gql`
                query PriceHistory($market: String!) {
                    priceSnapshots(
                        where: { market: $market }
                        orderBy: timestamp
                        orderDirection: asc
                    ) {
                        timestamp
                        yesPrice
                        noPrice
                    }
                }
            `,
            variables: { market: market.address.toLowerCase() }
        });
        return result.data.priceSnapshots;
        
        // Option 2: Query events from RPC
        const filter = market.filters.PriceUpdate();
        const events = await market.queryFilter(filter);
        return events.map(e => ({
            timestamp: e.args.timestamp,
            yesPrice: formatUnits(e.args.yesPrice, 18),
            noPrice: formatUnits(e.args.noPrice, 18)
        }));
    }
);
```

---

### Portfolio Page → User Positions

**Reading User Data**:
```javascript
const { data: userPositions } = useContractRead({
    address: POSITION_MANAGER_ADDRESS,
    abi: PositionManagerABI,
    functionName: 'getUserPositions',
    args: [address], // Connected wallet
    watch: true,
});

const { data: userBalance } = useContractRead({
    address: COLLATERAL_VAULT_ADDRESS,
    abi: CollateralVaultABI,
    functionName: 'getAvailableBalance',
    args: [address],
    watch: true,
});

// Calculate portfolio value
const portfolioValue = useMemo(() => {
    if (!userPositions || !markets) return 0;
    
    let total = userBalance || 0;
    
    userPositions.forEach(pos => {
        const market = markets.find(m => m.id === pos.marketId);
        if (!market || market.status === 'resolved') return;
        
        const currentPrice = market.currentPrice[pos.outcome];
        const unrealizedValue = pos.shares * currentPrice;
        total += unrealizedValue;
    });
    
    return total;
}, [userPositions, userBalance, markets]);
```

---

### Resolution UI → Oracle Contract

**Admin Resolution Tool**:
```javascript
const { write: proposeResolution } = useContractWrite({
    address: RESOLUTION_ORACLE_ADDRESS,
    abi: ResolutionOracleABI,
    functionName: 'proposeResolution',
});

const handleResolve = async () => {
    const outcomeNum = outcome === 'yes' ? 0 : (outcome === 'no' ? 1 : 2);
    
    const tx = await proposeResolution({
        args: [market.address, outcomeNum]
    });
    
    await tx.wait();
    
    alert(`Resolution proposed. Dispute period ends in 24 hours.`);
};
```

**User Dispute**:
```javascript
const { write: disputeResolution } = useContractWrite({
    address: RESOLUTION_ORACLE_ADDRESS,
    abi: ResolutionOracleABI,
    functionName: 'disputeResolution',
});

const handleDispute = async () => {
    const tx = await disputeResolution({
        args: [market.address, disputeReason],
        value: parseEther(disputeBondAmount) // Send dispute bond
    });
    
    await tx.wait();
    
    alert('Dispute submitted. An arbitrator will review.');
};
```

**Claim Payout**:
```javascript
const { write: claimPayout } = useContractWrite({
    address: market.address,
    abi: market.isSandbox ? SandboxMarketABI : MainMarketABI,
    functionName: 'claimPayout',
});

const handleClaim = async () => {
    const tx = await claimPayout();
    const receipt = await tx.wait();
    
    const event = receipt.events?.find(e => e.event === 'PayoutClaimed');
    const payout = formatUnits(event?.args?.amount, 6);
    
    alert(`Claimed ${payout} USDC!`);
};
```

---

## Security Considerations

### Critical Invariants

#### 1. **No Shorting**
```solidity
// Users can only sell shares they own
modifier canSell(address user, uint256 marketId, uint8 outcome, uint256 shares) {
    Position memory pos = positionManager.getPosition(user, marketId, outcome);
    require(pos.shares >= shares, "Insufficient shares to sell");
    _;
}
```

**Test Cases**:
- User with 0 shares tries to sell → Reverts
- User with 50 shares tries to sell 100 → Reverts
- User sells shares, then tries to sell again → Only allowed up to remaining balance

#### 2. **Collateral Solvency**
```solidity
// Vault must always have enough collateral to cover all locked positions
function checkVaultSolvency() public view returns (bool) {
    uint256 vaultBalance = collateralToken.balanceOf(address(this));
    uint256 requiredCollateral = totalLocked;
    return vaultBalance >= requiredCollateral;
}

// This should NEVER be false
modifier maintainSolvency() {
    _;
    require(checkVaultSolvency(), "CRITICAL: Vault insolvency detected");
}
```

**Test Cases**:
- After every trade, vault balance >= total locked
- After settlement, vault balance >= total payouts
- Emergency: If insolvency detected, pause all withdrawals

#### 3. **Price Bounds**
```solidity
// All prices must be between 0 and 1 (exclusive)
modifier validPrice(uint256 price) {
    require(price > 0 && price < PRICE_PRECISION, "Price out of bounds");
    _;
}

// For bonding curves
function validateCurvePrice(uint256 price) internal pure {
    require(price >= 0.01e18 && price <= 0.99e18, "Curve price must be 1-99 cents");
}
```

**Test Cases**:
- Limit order at price 0 → Reverts
- Limit order at price 1.0 → Reverts
- Bonding curve never goes below minPrice or above maxPrice

#### 4. **Conservation of Shares**
```solidity
// In a binary market, total YES shares + total NO shares should equal total liquidity
// This is enforced by the bonding curve or order matching logic

// For CLOB: Every buy has a corresponding sell
function executeTrade(Order memory buy, Order memory sell, uint256 size) internal {
    // Shares are transferred from seller to buyer (net zero)
    positionManager.updatePosition(buy.user, marketId, outcome, true, size, price, buyFee);
    positionManager.updatePosition(sell.user, marketId, outcome, false, size, price, sellFee);
}
```

**Test Cases**:
- Total shares before trade == Total shares after trade
- For bonding curve: reserve = integral(supply * price)

#### 5. **Resolution Finality**
```solidity
// Once resolved, market cannot be re-resolved
modifier notResolved() {
    require(status != MarketStatus.RESOLVED, "Market already resolved");
    _;
}

function resolve(uint8 outcome) external onlyOracle notResolved {
    status = MarketStatus.RESOLVED;
    winningOutcome = outcome;
    emit MarketResolved(outcome, block.timestamp);
}
```

**Test Cases**:
- Attempt to resolve same market twice → Reverts
- Attempt to trade after resolution → Reverts

#### 6. **Time Locks**
```solidity
// Markets cannot be resolved before resolution date
modifier afterResolutionDate(address market) {
    require(block.timestamp >= IMarket(market).resolutionDate(), "Too early to resolve");
    _;
}

// Withdrawals have a delay (prevents flash loan attacks)
function requestWithdrawal(uint256 amount) external {
    pendingWithdrawals[msg.sender] = WithdrawalRequest({
        amount: amount,
        unlockTime: block.timestamp + withdrawalDelay
    });
}
```

**Test Cases**:
- Resolve before resolution date → Reverts
- Withdraw immediately after request → Reverts
- Withdraw after delay → Success

#### 7. **Reentrancy Protection**
```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract CollateralVault is ReentrancyGuard {
    function deposit(uint256 amount) external nonReentrant {
        // Safe from reentrancy
    }
    
    function claimPayout() external nonReentrant {
        // Safe from reentrancy
    }
}
```

#### 8. **Integer Overflow/Underflow**
```solidity
// Use Solidity 0.8+ for automatic overflow checks
pragma solidity ^0.8.0;

// Or explicitly use SafeMath for older versions
using SafeMath for uint256;
```

#### 9. **Access Control**
```solidity
import "@openzeppelin/contracts/access/AccessControl.sol";

contract MarketFactory is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not admin");
        _;
    }
    
    modifier onlyResolver() {
        require(hasRole(RESOLVER_ROLE, msg.sender), "Not authorized resolver");
        _;
    }
}
```

---

### Attack Vectors & Mitigations

#### 1. **Front-Running**
**Risk**: Traders can see pending transactions and front-run large orders.

**Mitigation**:
- Implement order commit-reveal scheme
- Use private mempools (Flashbots, etc.)
- Add slippage protection (max price for buys, min price for sells)

```solidity
function placeMarketOrderWithSlippage(
    uint8 outcome,
    bool isBuy,
    uint256 size,
    uint256 maxSlippage // in bps
) external {
    uint256 expectedPrice = getMidPrice(outcome);
    
    uint256[] memory fills = matchOrder(...);
    
    uint256 actualPrice = calculateAvgPrice(fills);
    uint256 slippage = abs(actualPrice - expectedPrice) * 10000 / expectedPrice;
    
    require(slippage <= maxSlippage, "Slippage too high");
}
```

#### 2. **Oracle Manipulation**
**Risk**: Malicious resolver could resolve markets incorrectly.

**Mitigation**:
- Multi-sig resolver role
- Mandatory dispute period
- Economic incentives (bonds) for correct resolution
- Integration with decentralized oracles (Chainlink, UMA)

```solidity
// Require multiple resolvers to agree
mapping(address => mapping(uint8 => bool)) public resolverVotes;
uint256 public requiredResolverVotes = 3;

function voteResolution(address market, uint8 outcome) external onlyResolver {
    resolverVotes[market][outcome] = true;
    
    if (countVotes(market, outcome) >= requiredResolverVotes) {
        finalizeResolution(market, outcome);
    }
}
```

#### 3. **Flash Loan Attacks**
**Risk**: Attacker could use flash loans to manipulate bonding curve prices.

**Mitigation**:
- Withdrawal delays
- Trade size limits
- Price impact warnings
- Circuit breakers (pause if large price swings)

```solidity
uint256 public maxTradeSize = 10000e6; // 10k USDC per trade
uint256 public maxPriceImpact = 500; // 5% max price impact

function buy(uint8 outcome, uint256 amountUsd) external {
    require(amountUsd <= maxTradeSize, "Trade too large");
    
    uint256 priceBefore = getCurrentPrice(outcome);
    
    // Execute trade
    // ...
    
    uint256 priceAfter = getCurrentPrice(outcome);
    uint256 priceImpact = abs(priceAfter - priceBefore) * 10000 / priceBefore;
    
    require(priceImpact <= maxPriceImpact, "Price impact too high");
}
```

#### 4. **Collateral Drain**
**Risk**: Bug in settlement logic could drain vault.

**Mitigation**:
- Comprehensive testing of settlement accounting
- Audit by multiple firms
- Gradual rollout with withdrawal limits
- Emergency pause mechanism
- Insurance fund for critical bugs

```solidity
function emergencyPause() external onlyAdmin {
    paused = true;
    emit EmergencyPause(msg.sender, block.timestamp);
}

function emergencyWithdraw(address token, address to, uint256 amount) external onlyAdmin {
    require(paused, "Must be paused");
    IERC20(token).transfer(to, amount);
}
```

#### 5. **Griefing Attacks**
**Risk**: Users spam small orders to bloat the order book.

**Mitigation**:
- Minimum order size
- Gas-optimized order book pruning
- Fee for placing orders (refunded on fill)

```solidity
uint256 public minOrderSize = 10e6; // $10 minimum

function placeLimitOrder(...) external {
    require(size * price >= minOrderSize, "Order too small");
    // ...
}
```

---

### Upgrade Strategy

#### Proxy Pattern (Transparent Upgradeable Proxy)

```solidity
// Deploy via OpenZeppelin's proxy pattern
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

// 1. Deploy implementation
MarketFactory implementation = new MarketFactory();

// 2. Deploy proxy
TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
    address(implementation),
    admin,
    ""
);

// 3. Interact via proxy
MarketFactory factory = MarketFactory(address(proxy));

// 4. Upgrade (only admin)
MarketFactory newImplementation = new MarketFactory_V2();
proxy.upgradeTo(address(newImplementation));
```

**Upgradeable Contracts**:
- MarketFactory ✅
- CollateralVault ✅
- ResolutionOracle ✅
- PositionManager ✅

**Non-Upgradeable Contracts** (for security):
- Individual Market instances (SandboxMarket, MainMarket)
  - Reason: Prevents admin from changing market rules after creation
  - If bugs found, migrate to new market via graduation

**Storage Layout Compatibility**:
```solidity
// NEVER change order of storage variables
// NEVER remove storage variables
// ALWAYS append new variables at the end

contract MarketFactory_V1 {
    uint256 public marketCount;      // Slot 0
    address public collateralVault;  // Slot 1
}

contract MarketFactory_V2 {
    uint256 public marketCount;      // Slot 0 - SAME
    address public collateralVault;  // Slot 1 - SAME
    uint256 public newFeature;       // Slot 2 - NEW (OK)
}
```

---

## Migration Strategy

### Phase 1: Parallel Operation (Testnet)

**Week 1-2**: Deploy contracts to testnet (Goerli, Sepolia, Polygon Mumbai)

1. Deploy all core contracts
2. Create sample markets
3. Test trading flows
4. Test resolution & settlement

**Week 3-4**: Integrate with UI

1. Update frontend to support dual mode (mock API + smart contracts)
2. Add feature flag: `USE_SMART_CONTRACTS=true/false`
3. Test all user flows with testnet

```javascript
// config.ts
export const USE_SMART_CONTRACTS = process.env.NEXT_PUBLIC_USE_CONTRACTS === 'true';

// TradePanel.tsx
const handleTrade = async () => {
    if (USE_SMART_CONTRACTS) {
        // Call smart contract
        await contract.buy(...);
    } else {
        // Call mock API
        await fetch('/api/sandbox/markets/...');
    }
};
```

**Week 5-6**: Bug Bounty & Audits

1. Launch bug bounty program (ImmuneFi, Code4rena)
2. Security audit by 2+ firms (OpenZeppelin, Trail of Bits, etc.)
3. Fix identified issues

---

### Phase 2: Mainnet Launch (Gradual Rollout)

**Stage 1: Sandbox Markets Only**

1. Deploy to mainnet (Polygon, Arbitrum, or Optimism for lower gas)
2. Enable only sandbox market creation
3. Set low limits:
   - Max market liquidity: $1,000
   - Max trade size: $100
   - Daily withdrawal limit: $500
4. Monitor for 2 weeks

**Stage 2: Main Markets (CLOB)**

1. Enable main market creation
2. Enable market graduation
3. Increase limits:
   - Max liquidity: $10,000
   - Max trade: $1,000
   - Daily withdrawal: $5,000
4. Monitor for 2 weeks

**Stage 3: Full Launch**

1. Remove limits (or set high limits)
2. Enable all features (parlays, etc.)
3. Marketing push

---

### Phase 3: Data Migration

**Historical Data**:
- Keep mock API running in read-only mode
- Display historical markets from old system with "Legacy" badge
- New markets created on-chain only

**User Balances** (Optional):
- Offer "bridge" to migrate mock balances to real USDC
- E.g., "Convert your $10,000 demo balance to $100 USDC airdrop" (with cap)
- Or start fresh on mainnet

---

## Testnet Deployment Plan

### Pre-Deployment Checklist

**1. Contract Preparation**
- [ ] All contracts written and compiled
- [ ] Unit tests written (>90% coverage)
- [ ] Integration tests written
- [ ] Fuzz testing completed
- [ ] Static analysis (Slither, Mythril) passed
- [ ] Gas optimization complete

**2. Environment Setup**
- [ ] Testnet RPC endpoints configured
- [ ] Testnet wallets funded (ETH/MATIC for gas)
- [ ] Testnet USDC contract deployed or found
- [ ] Deploy scripts written (Hardhat/Foundry)

**3. Documentation**
- [ ] Contract ABIs exported
- [ ] Contract addresses documented
- [ ] Function signatures documented
- [ ] Integration guide for frontend

---

### Deployment Sequence

**Step 1: Deploy Core Infrastructure**

```bash
# Deploy USDC mock (if not using existing testnet USDC)
npx hardhat run scripts/01_deploy_usdc.ts --network goerli

# Deploy CollateralVault (with proxy)
npx hardhat run scripts/02_deploy_vault.ts --network goerli

# Deploy PositionManager (with proxy)
npx hardhat run scripts/03_deploy_position_manager.ts --network goerli

# Deploy ResolutionOracle (with proxy)
npx hardhat run scripts/04_deploy_oracle.ts --network goerli

# Deploy MarketFactory (with proxy)
npx hardhat run scripts/05_deploy_factory.ts --network goerli
```

**Step 2: Configure Contracts**

```bash
# Set up permissions and references
npx hardhat run scripts/06_configure_contracts.ts --network goerli
```

**Configuration Script**:
```javascript
// 06_configure_contracts.ts
async function main() {
    // Get deployed contracts
    const factory = await ethers.getContractAt("MarketFactory", FACTORY_ADDRESS);
    const vault = await ethers.getContractAt("CollateralVault", VAULT_ADDRESS);
    const oracle = await ethers.getContractAt("ResolutionOracle", ORACLE_ADDRESS);
    const positionManager = await ethers.getContractAt("PositionManager", POSITION_MANAGER_ADDRESS);
    
    // 1. Set factory references
    await factory.setCollateralVault(VAULT_ADDRESS);
    await factory.setResolutionOracle(ORACLE_ADDRESS);
    await factory.setPositionManager(POSITION_MANAGER_ADDRESS);
    
    // 2. Authorize factory in vault
    await vault.authorizeMarket(FACTORY_ADDRESS);
    
    // 3. Set creation fee and parameters
    await factory.setCreationFee(ethers.utils.parseUnits("50", 6)); // 50 USDC
    await factory.setFeeStructure(10, 20); // 0.1% maker, 0.2% taker
    
    // 4. Add resolvers to oracle
    await oracle.addResolver(RESOLVER_ADDRESS_1);
    await oracle.addResolver(RESOLVER_ADDRESS_2);
    
    // 5. Set dispute parameters
    await oracle.setDisputePeriod(86400); // 24 hours
    await oracle.setDisputeBond(ethers.utils.parseUnits("1000", 6)); // 1000 USDC
    
    console.log("Configuration complete!");
}
```

**Step 3: Create Test Markets**

```bash
# Create a sample sandbox market
npx hardhat run scripts/07_create_test_markets.ts --network goerli
```

```javascript
// 07_create_test_markets.ts
async function main() {
    const factory = await ethers.getContractAt("MarketFactory", FACTORY_ADDRESS);
    const usdc = await ethers.getContractAt("IERC20", USDC_ADDRESS);
    
    // Approve USDC
    await usdc.approve(VAULT_ADDRESS, ethers.utils.parseUnits("10000", 6));
    
    // Create market
    const tx = await factory.createSandboxMarket(
        "Will ETH reach $5000 by end of 2024?",
        "Crypto",
        Math.floor(new Date("2024-12-31").getTime() / 1000),
        "Resolved based on CoinGecko price at 23:59 UTC",
        ethers.utils.parseUnits("1000", 6), // 1000 USDC initial liquidity
        { value: ethers.utils.parseEther("0.01") } // Creation fee (if in ETH)
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === 'MarketCreated');
    const marketAddress = event.args.marketAddress;
    
    console.log("Market created at:", marketAddress);
}
```

**Step 4: Verify Contracts**

```bash
# Verify on Etherscan
npx hardhat verify --network goerli FACTORY_ADDRESS "constructor args..."
npx hardhat verify --network goerli VAULT_ADDRESS
# ... etc for all contracts
```

---

### Testing Scenarios

#### Test Case 1: End-to-End Sandbox Market

1. User A deposits 1000 USDC
2. User A creates sandbox market (pays 50 USDC fee + 100 USDC liquidity)
3. User B deposits 500 USDC
4. User B buys 200 USDC worth of YES shares
5. User C deposits 300 USDC
6. User C buys 150 USDC worth of NO shares
7. User B sells 50 USDC worth of YES shares
8. Wait until resolution date
9. Resolver proposes YES outcome
10. Wait 24 hours (no dispute)
11. Oracle finalizes resolution
12. User B claims payout
13. Verify User B receives correct amount

**Expected Results**:
- All transactions succeed
- Position balances match expected values
- Vault remains solvent
- Payouts are correct

#### Test Case 2: End-to-End Main Market (CLOB)

1. Create main market
2. User A places limit buy: YES @ 0.50, 1000 shares
3. User B places limit sell: YES @ 0.55, 800 shares
4. User C places market buy: YES, 500 shares → matches 500 @ 0.55
5. User D places market buy: YES, 600 shares → matches 300 @ 0.55, 300 @ 0.50
6. Verify order book updates correctly
7. Verify positions updated correctly
8. Test resolution & settlement

#### Test Case 3: Market Graduation

1. Create sandbox market
2. Execute trades until volume > threshold
3. Call graduateMarket()
4. Verify new main market created
5. Verify positions migrated
6. Verify liquidity migrated
7. Trade on new main market

#### Test Case 4: Dispute Resolution

1. Create and trade on market
2. Resolver proposes incorrect outcome
3. User disputes (pays bond)
4. Arbitrator reviews and corrects outcome
5. User receives bond + reward
6. Verify settlement uses correct outcome

#### Test Case 5: Edge Cases

- Market with 0 volume tries to graduate → Fails
- User tries to withdraw more than balance → Fails
- User tries to sell more shares than owned → Fails
- Resolver tries to resolve before resolution date → Fails
- User tries to trade on resolved market → Fails
- Multiple users claim payout → All succeed

---

### Monitoring & Alerts

**Contract Events to Monitor**:
- MarketCreated (track new markets)
- Trade (track volume, prices)
- OrderPlaced/OrderCancelled (track order book activity)
- MarketResolved (track resolutions)
- PayoutClaimed (track settlements)
- EmergencyPause (CRITICAL alert)
- CollateralLocked/Unlocked (track vault activity)

**Dashboards**:
- Total Value Locked (TVL)
- Active markets count
- 24h trading volume
- User count
- Average trade size
- Gas costs per operation
- Vault solvency ratio

**Alerts**:
- Vault solvency < 100% → CRITICAL
- Large single trade (> $10k) → WARNING
- Rapid price movement (> 10% in 1 block) → WARNING
- Resolution dispute filed → NOTIFICATION
- Failed transaction rate > 5% → WARNING

---

## Gas Optimization

### Estimated Gas Costs (Optimistic Rollup)

| Operation | Gas Units | Cost @ 0.5 Gwei | Cost @ 5 Gwei |
|-----------|-----------|-----------------|---------------|
| Create Sandbox Market | ~500k | ~$0.25 | ~$2.50 |
| Sandbox Buy | ~150k | ~$0.08 | ~$0.75 |
| Sandbox Sell | ~130k | ~$0.07 | ~$0.65 |
| Place Limit Order | ~180k | ~$0.09 | ~$0.90 |
| Place Market Order (1 fill) | ~200k | ~$0.10 | ~$1.00 |
| Cancel Order | ~50k | ~$0.03 | ~$0.25 |
| Claim Payout | ~100k | ~$0.05 | ~$0.50 |

### Optimization Techniques

1. **Batch Operations**: Allow users to place/cancel multiple orders in one transaction
2. **Storage Packing**: Pack multiple small values into single storage slots
3. **Lazy Deletion**: Mark orders as cancelled instead of removing from arrays
4. **Event Indexing**: Use indexed parameters wisely (max 3 per event)
5. **Off-Chain Order Books**: Store order book off-chain, settle on-chain (0x-style)

---

## Conclusion

This smart contract architecture provides a solid foundation for launching Likeli as a fully decentralized prediction market platform. Key strengths:

1. **Dual Market Types**: Supports both bonding curve (instant liquidity) and CLOB (deep liquidity)
2. **Modular Design**: Separates concerns for easier upgrades and maintenance
3. **Security-First**: Comprehensive invariants, access control, and time locks
4. **UI-Friendly**: Direct mapping from existing UI components to contract calls
5. **Gradual Rollout**: Testnet → Limited mainnet → Full launch

### Next Steps for Implementation

1. **Smart Contract Development** (4-6 weeks)
   - Write Solidity contracts
   - Unit and integration tests
   - Gas optimization

2. **Security Audit** (2-3 weeks)
   - Internal review
   - External audit by 2+ firms
   - Bug bounty program

3. **Frontend Integration** (2-3 weeks)
   - Add Web3 wallet support (Wagmi/RainbowKit)
   - Replace mock API calls with contract calls
   - Add transaction status UI

4. **Testnet Deployment** (2 weeks)
   - Deploy to testnet
   - Public testing
   - Bug fixes

5. **Mainnet Launch** (Gradual)
   - Limited launch (low caps)
   - Monitor for 2-4 weeks
   - Full launch

**Total Timeline: 10-14 weeks from start to full mainnet launch**

---

## Appendix: Contract Addresses (Testnet)

To be filled after deployment:

```
Network: Goerli

USDC: 0x...
CollateralVault: 0x...
PositionManager: 0x...
ResolutionOracle: 0x...
MarketFactory: 0x...

Sample Markets:
Market 1 (Sandbox): 0x...
Market 2 (Main): 0x...
```

---

## Appendix: ABI Exports

ABIs will be exported to `/abis/` directory for frontend consumption:

```
/abis/
  MarketFactory.json
  SandboxMarket.json
  MainMarket.json
  CollateralVault.json
  PositionManager.json
  ResolutionOracle.json
  ParlayManager.json
```

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Authors**: Likeli Engineering Team  
**Status**: Ready for Implementation
