"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

// --- Types ---

export type MarketType = "yes_no" | "multiple_choice";
export type MarketStatus = "active" | "resolved" | "void";

export interface Market {
    id: string;
    question: string;
    category: string;
    type: MarketType;
    status: MarketStatus;
    resolutionDate: string;
    image?: string;

    // Liquidity & Volume
    liquidity: number;
    volume: number;

    // Outcomes (for yes_no: 0=YES, 1=NO)
    outcomes: {
        id: string;
        name: string;
        price: number; // 0.0 to 1.0
    }[];

    // Graduation
    isGraduated: boolean;
    creatorId: string;

    // Resolution
    // Resolution
    resolutionResult?: string; // outcomeId that won

    // Sandbox Extensions
    phase?: "sandbox_curve" | "main_clob";
    rules?: string;
    curve?: {
        yes: { supply: number; reserve: number; minPrice: number; maxPrice: number; maxSupply: number };
        no: { supply: number; reserve: number; minPrice: number; maxPrice: number; maxSupply: number };
    };

    // History
    probabilityHistory: ProbabilityTick[];
    priceHistory: { t: number; yesPrice: number; noPrice: number }[];
    orderBook?: OrderBook; // Optional for sandbox
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

export interface Order {
    id: string;
    marketId: string;
    outcome: 'YES' | 'NO';
    side: OrderSide;
    type: OrderType;
    price: number; // 0.00 to 1.00
    size: number; // Shares
    createdAt: number;
    ownerId: string;
}

export type OrderBookRow = { price: number; size: number; total: number; };
export type OrderBookSide = OrderBookRow[];

// The Store's internal OrderBook structure (Source of Truth)
export interface OrderBook {
    marketId: string;
    bids: Order[]; // sorted high -> low
    asks: Order[]; // sorted low -> high
    lastTradePriceYes?: number;
    lastTradeAt?: number;
}

export type ProbabilityTick = {
    timestamp: number;
    yesPrice: number | null;
    noPrice: number | null;
};

export type Outcome = 'YES' | 'NO';

export interface Position {
    marketId: string;
    outcome: Outcome;
    shares: number;
    avgPrice: number;
    realizedPnl: number;
}

export interface ParlayLeg {
    marketId: string;
    outcomeId: string; // e.g. "yes"
    outcomeName: string; // e.g. "YES"
    marketQuestion: string;
    prob: number; // Implied prob at time of bet
}

export interface ParlayBet {
    id: string;
    legs: ParlayLeg[];
    stake: number;
    multiplier: number;
    potentialPayout: number;
    status: "open" | "won" | "lost" | "void";
    createdAt: number;
}

export type TradeKind = "single" | "parlay" | "perp";

export interface EquityPoint {
    ts: number;
    equity: number;
    pnl: number;
}

export interface TradeHistoryItem {
    id: string;
    ts: number;
    kind: TradeKind;
    marketId: string | null;
    description: string;
    side: string;
    size: number;
    leverage?: number | null;
    entryPrice?: number | null;
    exitPrice?: number | null;
    status: "open" | "closed" | "settled" | "void";
    realizedPnl: number;
    potentialPayout?: number | null;
}

export interface User {
    id: string;
    balance: number;
    positions: Position[];
    parlays: ParlayBet[];
    perps: any[]; // Placeholder for now
    history: TradeHistoryItem[];
    equityHistory: EquityPoint[];
}

interface StoreContextType {
    currentUser: User;
    markets: Market[];
    buy: (marketId: string, outcomeId: string, amountUSD: number) => void;
    sell: (marketId: string, outcomeId: string, amountShares: number) => void;
    placeMarketOrder: (marketId: string, outcomeId: string, side: OrderSide, size: number) => void;
    placeLimitOrder: (marketId: string, side: OrderSide, price: number, size: number) => void;
    createMarket: (data: Partial<Market>) => void;
    placeParlay: (legs: { marketId: string; outcomeId: string }[], stake: number) => void;
    resolveMarket: (marketId: string, winningOutcomeId: string) => void;
    getMarketPrice: (market: Market) => number;
    loading: boolean;
}

// --- Mock Data ---

const createMockOrder = (marketId: string, outcome: 'YES' | 'NO', side: OrderSide, price: number, size: number): Order => ({
    id: Math.random().toString(36).substr(2, 9),
    marketId,
    outcome,
    side,
    type: 'LIMIT',
    price,
    size,
    createdAt: Date.now(),
    ownerId: 'system'
});

const INITIAL_MARKETS: Market[] = [
    {
        id: "m1",
        question: "Will Bitcoin hit $100k by 2025?",
        category: "Crypto",
        type: "yes_no",
        status: "active",
        resolutionDate: "2024-12-31",
        liquidity: 50000,
        volume: 125000,
        isGraduated: true,
        creatorId: "system",
        outcomes: [
            { id: "yes", name: "Yes", price: 0.65 },
            { id: "no", name: "No", price: 0.35 },
        ],
        probabilityHistory: [
            { timestamp: Date.now() - 86400000 * 4, yesPrice: 0.55, noPrice: 0.45 },
            { timestamp: Date.now() - 86400000 * 3, yesPrice: 0.58, noPrice: 0.42 },
            { timestamp: Date.now() - 86400000 * 2, yesPrice: 0.62, noPrice: 0.38 },
            { timestamp: Date.now() - 86400000, yesPrice: 0.60, noPrice: 0.40 },
            { timestamp: Date.now() - 43200000, yesPrice: 0.63, noPrice: 0.37 },
            { timestamp: Date.now(), yesPrice: 0.65, noPrice: 0.35 },
        ],
        priceHistory: [
            { t: Date.now() - 86400000 * 4, yesPrice: 0.55, noPrice: 0.45 },
            { t: Date.now() - 86400000 * 3, yesPrice: 0.58, noPrice: 0.42 },
            { t: Date.now() - 86400000 * 2, yesPrice: 0.62, noPrice: 0.38 },
            { t: Date.now() - 86400000, yesPrice: 0.60, noPrice: 0.40 },
            { t: Date.now() - 43200000, yesPrice: 0.63, noPrice: 0.37 },
            { t: Date.now(), yesPrice: 0.65, noPrice: 0.35 },
        ],
        orderBook: {
            marketId: "m1",
            bids: [
                createMockOrder("m1", "YES", "BUY", 0.64, 5000),
                createMockOrder("m1", "YES", "BUY", 0.63, 2500),
                createMockOrder("m1", "YES", "BUY", 0.62, 10000),
            ],
            asks: [
                createMockOrder("m1", "YES", "SELL", 0.66, 4000),
                createMockOrder("m1", "YES", "SELL", 0.67, 1500),
                createMockOrder("m1", "YES", "SELL", 0.68, 8000),
            ],
            lastTradePriceYes: 0.65,
            lastTradeAt: Date.now()
        }
    },
    {
        id: "m2",
        question: "Will the Fed cut rates in December?",
        category: "Politics",
        type: "yes_no",
        status: "active",
        resolutionDate: "2024-12-18",
        liquidity: 20000,
        volume: 45000,
        isGraduated: true,
        creatorId: "system",
        outcomes: [
            { id: "yes", name: "Yes", price: 0.40 },
            { id: "no", name: "No", price: 0.60 },
        ],
        probabilityHistory: [
            { timestamp: Date.now() - 86400000 * 4, yesPrice: 0.30, noPrice: 0.70 },
            { timestamp: Date.now() - 86400000 * 3, yesPrice: 0.35, noPrice: 0.65 },
            { timestamp: Date.now() - 86400000 * 2, yesPrice: 0.28, noPrice: 0.72 },
            { timestamp: Date.now() - 86400000, yesPrice: 0.40, noPrice: 0.60 },
            { timestamp: Date.now() - 43200000, yesPrice: 0.38, noPrice: 0.62 },
            { timestamp: Date.now(), yesPrice: 0.40, noPrice: 0.60 },
        ],
        priceHistory: [
            { t: Date.now() - 86400000 * 4, yesPrice: 0.30, noPrice: 0.70 },
            { t: Date.now() - 86400000 * 3, yesPrice: 0.35, noPrice: 0.65 },
            { t: Date.now() - 86400000 * 2, yesPrice: 0.28, noPrice: 0.72 },
            { t: Date.now() - 86400000, yesPrice: 0.40, noPrice: 0.60 },
            { t: Date.now() - 43200000, yesPrice: 0.38, noPrice: 0.62 },
            { t: Date.now(), yesPrice: 0.40, noPrice: 0.60 },
        ],
        orderBook: {
            marketId: "m2",
            bids: [
                createMockOrder("m2", "YES", "BUY", 0.39, 2000),
                createMockOrder("m2", "YES", "BUY", 0.38, 5000),
            ],
            asks: [
                createMockOrder("m2", "YES", "SELL", 0.41, 3000),
                createMockOrder("m2", "YES", "SELL", 0.42, 1000),
            ],
            lastTradePriceYes: 0.40,
            lastTradeAt: Date.now()
        }
    },
    {
        id: "m3",
        question: "Will 'Dune: Part 3' be announced this month?",
        category: "Movies",
        type: "yes_no",
        status: "active",
        resolutionDate: "2024-11-30",
        liquidity: 1000,
        volume: 500,
        isGraduated: false, // Sandbox market
        creatorId: "user123",
        outcomes: [
            { id: "yes", name: "Yes", price: 0.20 },
            { id: "no", name: "No", price: 0.80 },
        ],
        probabilityHistory: [
            { timestamp: Date.now() - 86400000 * 2, yesPrice: 0.15, noPrice: 0.85 },
            { timestamp: Date.now() - 86400000, yesPrice: 0.18, noPrice: 0.82 },
            { timestamp: Date.now(), yesPrice: 0.20, noPrice: 0.80 },
        ],
        priceHistory: [
            { t: Date.now() - 86400000 * 2, yesPrice: 0.15, noPrice: 0.85 },
            { t: Date.now() - 86400000, yesPrice: 0.18, noPrice: 0.82 },
            { t: Date.now(), yesPrice: 0.20, noPrice: 0.80 },
        ],
        orderBook: {
            marketId: "m3",
            bids: [
                createMockOrder("m3", "YES", "BUY", 0.19, 100),
            ],
            asks: [
                createMockOrder("m3", "YES", "SELL", 0.21, 200),
            ],
            lastTradePriceYes: 0.20,
            lastTradeAt: Date.now()
        }
    },
];

const INITIAL_USER: User = {
    id: "u1",
    balance: 10000, // $10k starting balance
    positions: [],
    parlays: [],
    perps: [],
    history: [],
    equityHistory: [],
};

// --- Store Implementation ---

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
    const { accountId } = useAuth();
    const [usersById, setUsersById] = useState<Record<string, User>>({});
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [markets, setMarkets] = useState<Market[]>(INITIAL_MARKETS);
    const [loading, setLoading] = useState(true);

    // Load from localStorage
    useEffect(() => {
        const savedUsers = localStorage.getItem("likeli_demo_users");
        const savedMarkets = localStorage.getItem("likeli_markets");

        if (savedUsers) {
            try {
                const parsedUsers = JSON.parse(savedUsers);
                // Migration: Ensure all users have new fields
                Object.keys(parsedUsers).forEach(uid => {
                    const u = parsedUsers[uid];
                    if (!u.history) u.history = [];
                    if (!u.equityHistory) u.equityHistory = [];
                    if (!u.perps) u.perps = [];
                    if (!u.parlays) u.parlays = [];
                    if (!u.positions) u.positions = [];
                });
                setUsersById(parsedUsers);
            } catch (e) {
                console.error("Failed to parse users from local storage", e);
            }
        }
        if (savedMarkets) {
            try {
                const parsedMarkets = JSON.parse(savedMarkets);
                // Migration: Ensure markets have probabilityHistory
                const migratedMarkets = parsedMarkets.map((m: any) => {
                    // Convert legacy history if present
                    let history = m.probabilityHistory;
                    if (history && history.length > 0) {
                        // Check if first item has 'ts' instead of 'timestamp'
                        if (history[0].ts !== undefined) {
                            history = history.map((h: any) => ({
                                timestamp: h.ts,
                                yesPrice: h.prob,
                                noPrice: 1 - h.prob
                            }));
                        }
                    }

                    // If history is missing OR has too few points (flat line issue), regenerate it
                    if (!history || history.length < 5) {
                        // Try to find initial mock data for this market
                        const initial = INITIAL_MARKETS.find(im => im.id === m.id);
                        if (initial && initial.probabilityHistory && initial.probabilityHistory.length >= 5) {
                            return { ...m, probabilityHistory: initial.probabilityHistory };
                        }
                        // Fallback: generate some history ending at current price
                        const currentPrice = m.outcomes.find((o: any) => o.id === "yes")?.price || 0.5;
                        return {
                            ...m,
                            probabilityHistory: [
                                { timestamp: Date.now() - 86400000 * 4, yesPrice: currentPrice * 0.9, noPrice: 1 - (currentPrice * 0.9) },
                                { timestamp: Date.now() - 86400000 * 3, yesPrice: currentPrice * 1.1, noPrice: 1 - (currentPrice * 1.1) },
                                { timestamp: Date.now() - 86400000 * 2, yesPrice: currentPrice * 0.95, noPrice: 1 - (currentPrice * 0.95) },
                                { timestamp: Date.now() - 86400000, yesPrice: currentPrice * 1.05, noPrice: 1 - (currentPrice * 1.05) },
                                { timestamp: Date.now(), yesPrice: currentPrice, noPrice: 1 - currentPrice },
                            ]
                        };
                    }
                    // Migration: Ensure priceHistory exists
                    let priceHistory = m.priceHistory;
                    if (!priceHistory || priceHistory.length === 0) {
                        // Try to find initial mock data
                        const initial = INITIAL_MARKETS.find(im => im.id === m.id);
                        if (initial && initial.priceHistory && initial.priceHistory.length > 0) {
                            priceHistory = initial.priceHistory;
                        } else {
                            // Fallback: generate from probabilityHistory or current price
                            const currentPrice = m.outcomes.find((o: any) => o.id === "yes")?.price || 0.5;
                            priceHistory = [
                                { t: Date.now() - 86400000 * 4, yesPrice: currentPrice * 0.9, noPrice: 1 - (currentPrice * 0.9) },
                                { t: Date.now() - 86400000 * 3, yesPrice: currentPrice * 1.1, noPrice: 1 - (currentPrice * 1.1) },
                                { t: Date.now() - 86400000 * 2, yesPrice: currentPrice * 0.95, noPrice: 1 - (currentPrice * 0.95) },
                                { t: Date.now() - 86400000, yesPrice: currentPrice * 1.05, noPrice: 1 - (currentPrice * 1.05) },
                                { t: Date.now(), yesPrice: currentPrice, noPrice: 1 - currentPrice },
                            ];
                        }
                    }

                    // Migration: Ensure orderBook exists
                    let orderBook = m.orderBook;
                    if (!orderBook) {
                        const initial = INITIAL_MARKETS.find(im => im.id === m.id);
                        if (initial && initial.orderBook) {
                            orderBook = initial.orderBook;
                        } else {
                            orderBook = { bids: [], asks: [], orders: [] };
                        }
                    }

                    return { ...m, probabilityHistory: history, priceHistory, orderBook };
                });
                setMarkets(migratedMarkets);
            } catch (e) {
                console.error("Failed to parse markets from local storage", e);
                setMarkets(INITIAL_MARKETS);
            }
        } else {
            // No saved markets, use initial
            setMarkets(INITIAL_MARKETS);
        }
        setLoading(false);
    }, []);

    // Sync currentUserId with AuthContext accountId
    useEffect(() => {
        if (!accountId) {
            setCurrentUserId(null);
            return;
        }

        setCurrentUserId(accountId);

        setUsersById(prev => {
            if (prev[accountId]) return prev;

            // Initialize new user if not exists
            return {
                ...prev,
                [accountId]: {
                    ...INITIAL_USER,
                    id: accountId,
                    balance: 10000, // Fresh balance for new account
                }
            };
        });
    }, [accountId]);

    // Save to localStorage
    useEffect(() => {
        if (!loading) {
            localStorage.setItem("likeli_demo_users", JSON.stringify(usersById));
            localStorage.setItem("likeli_markets", JSON.stringify(markets));
        }
    }, [usersById, markets, loading]);

    // Helper to get current user or default (view-only)

    const currentUser = currentUserId && usersById[currentUserId]
        ? { ...INITIAL_USER, ...usersById[currentUserId] }
        : { ...INITIAL_USER, id: "guest", balance: 0 }; // View-only default

    // --- Actions ---

    // Unified Trade Application Logic
    const applyTrade = (user: User, marketId: string, outcome: 'YES' | 'NO', side: 'BUY' | 'SELL', price: number, size: number): User => {
        const cost = price * size;
        let newBalance = user.balance;

        // Find existing position for this outcome
        let posIndex = user.positions.findIndex(p => p.marketId === marketId && p.outcome === outcome);
        let pos = posIndex >= 0 ? { ...user.positions[posIndex] } : {
            marketId,
            outcome,
            shares: 0,
            avgPrice: 0,
            realizedPnl: 0
        };

        if (side === 'BUY') {
            // Buying Shares
            newBalance -= cost;

            const totalCost = (pos.shares * pos.avgPrice) + cost;
            const totalShares = pos.shares + size;

            pos.shares = totalShares;
            pos.avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
        } else {
            // Selling Shares
            const sellSize = Math.min(size, pos.shares);
            const proceeds = sellSize * price;
            newBalance += proceeds;

            // Calculate Realized PnL
            const costBasisOfSold = sellSize * pos.avgPrice;
            const pnl = proceeds - costBasisOfSold;

            pos.realizedPnl += pnl;
            pos.shares -= sellSize;
        }

        // Update positions array
        let newPositions = [...user.positions];
        if (posIndex >= 0) {
            newPositions[posIndex] = pos;
        } else {
            newPositions.push(pos);
        }

        // Filter out empty positions
        newPositions = newPositions.filter(p => p.shares > 0.0001 || Math.abs(p.realizedPnl) > 0.01);

        return {
            ...user,
            balance: newBalance,
            positions: newPositions
        };
    };

    const placeMarketOrder = (marketId: string, outcomeId: string, side: OrderSide, size: number) => {
        if (!currentUserId) return;

        let executionPrice = 0;
        let executedSize = 0;

        setMarkets((prev) =>
            prev.map((m) => {
                if (m.id !== marketId) return m;

                const book = m.orderBook || { marketId: m.id, bids: [], asks: [] };

                // Matching Logic
                // YES BUY -> Match against YES ASKS (Lowest First)
                // YES SELL -> Match against YES BIDS (Highest First)
                // NO BUY -> Match against NO ASKS (Lowest First) - But we only have YES book?
                // The prompt says: "YES market order to BUY: Match against lowest ASK for YES first."
                // "YES market order to SELL: Match against highest BID for YES."
                // And "Buy NO" matches against "Sell NO" if we have them.
                // But our INITIAL_MARKETS only seeded YES orders.
                // If we want to support NO orders, we need to look at outcomeId.

                // For this implementation, I will assume we are matching against the book for the specific outcome.
                // If the book only has YES orders, then NO orders will just sit there or fail to match if we don't have liquidity.
                // However, to make the demo work nicely, I will implement "Buy NO" as "Sell YES" if outcomeId is NO.
                // Wait, the prompt said: "YES market order to BUY... YES market order to SELL...".
                // It didn't explicitly say "Buy NO = Sell YES".
                // BUT, in `INITIAL_MARKETS`, I seeded `outcome: 'YES'`.
                // If I place a NO order, it won't match against YES orders unless I map it.
                // Given the "Simple" nature, I will map NO BUY -> YES SELL and NO SELL -> YES BUY.
                // This unifies liquidity into a single YES book.

                const isYes = outcomeId === 'yes';
                const effectiveSide = isYes ? side : (side === 'BUY' ? 'SELL' : 'BUY');

                // If we are effectively BUYING YES, we match against ASKS.
                // If we are effectively SELLING YES, we match against BIDS.
                const matchAgainst = effectiveSide === "BUY" ? book.asks : book.bids;

                // Sort match candidates
                // Asks: Low -> High
                // Bids: High -> Low
                const sortedMatch = [...matchAgainst].sort((a, b) =>
                    effectiveSide === "BUY" ? a.price - b.price : b.price - a.price
                );

                let remainingSize = size;
                let totalCost = 0;
                let lastPrice = book.lastTradePriceYes || 0.5;

                const newMatchAgainst = [];

                for (const order of sortedMatch) {
                    // Only match orders for YES outcome (since we mapped NO to YES side)
                    if (order.outcome !== 'YES') {
                        newMatchAgainst.push(order);
                        continue;
                    }

                    if (remainingSize <= 0) {
                        newMatchAgainst.push(order);
                        continue;
                    }

                    const matchSize = Math.min(remainingSize, order.size);
                    remainingSize -= matchSize;
                    totalCost += matchSize * order.price;
                    lastPrice = order.price;

                    if (order.size > matchSize) {
                        newMatchAgainst.push({ ...order, size: order.size - matchSize });
                    }
                }

                // Fill remaining (Mock Liquidity)
                if (remainingSize > 0) {
                    // Mock Liquidity Fill
                    const fillPrice = sortedMatch.length > 0 ? sortedMatch[0].price : lastPrice;
                    totalCost += remainingSize * fillPrice;
                    lastPrice = fillPrice;
                }

                executionPrice = size > 0 ? totalCost / size : lastPrice;
                executedSize = size;

                // Reconstruct book
                const newBook = {
                    ...book,
                    bids: effectiveSide === "SELL" ? newMatchAgainst : book.bids,
                    asks: effectiveSide === "BUY" ? newMatchAgainst : book.asks,
                    lastTradePriceYes: lastPrice,
                    lastTradeAt: Date.now()
                };

                // Update Price History with Derived Price
                const tempMarket = { ...m, orderBook: newBook };
                const derivedPrice = getMarketPrice(tempMarket);
                const newHistory = [...m.priceHistory, { t: Date.now(), yesPrice: derivedPrice, noPrice: 1 - derivedPrice }].slice(-100);

                return { ...m, priceHistory: newHistory, orderBook: newBook };
            })
        );

        setUsersById((prev) => {
            const user = prev[currentUserId];
            if (!user) return prev;

            let finalPrice = executionPrice;
            if (outcomeId === 'no') {
                finalPrice = 1 - executionPrice;
            }

            const updatedUser = applyTrade(user, marketId, outcomeId as 'YES' | 'NO', side, finalPrice, executedSize);

            // Add History Item
            const historyItem: TradeHistoryItem = {
                id: Math.random().toString(36).substr(2, 9),
                ts: Date.now(),
                kind: "single",
                marketId,
                description: `${side} ${outcomeId.toUpperCase()}`,
                side: `${side} ${outcomeId.toUpperCase()}`,
                size: executedSize * finalPrice,
                entryPrice: side === 'BUY' ? finalPrice : undefined,
                exitPrice: side === 'SELL' ? finalPrice : undefined,
                status: side === 'BUY' ? "open" : "closed",
                realizedPnl: 0,
            };

            return {
                ...prev,
                [currentUserId]: {
                    ...updatedUser,
                    history: [historyItem, ...updatedUser.history]
                }
            };
        });
    };

    const buy = (marketId: string, outcomeId: string, amountUSD: number) => {
        const market = markets.find(m => m.id === marketId);
        if (!market) return;
        const outcome = market.outcomes.find(o => o.id === outcomeId);
        if (!outcome) return;

        const price = outcome.price;
        const shares = amountUSD / price;

        placeMarketOrder(marketId, outcomeId, 'BUY', shares);
    };

    const sell = (marketId: string, outcomeId: string, amountShares: number) => {
        placeMarketOrder(marketId, outcomeId, 'SELL', amountShares);
    };

    const createMarket = (data: Partial<Market>) => {
        if (!currentUserId) return;

        const creationCost = 50;
        const minLiquidity = 100;

        if (currentUser.balance < creationCost + (data.liquidity || 0)) {
            alert("Insufficient balance for creation fee + liquidity");
            return;
        }

        const newMarket: Market = {
            id: Math.random().toString(36).substr(2, 9),
            question: data.question || "Untitled Market",
            category: data.category || "General",
            type: "yes_no",
            status: "active",
            resolutionDate: data.resolutionDate || "2025-01-01",
            liquidity: data.liquidity || minLiquidity,
            volume: 0,
            isGraduated: false,
            creatorId: currentUser.id,
            outcomes: [
                { id: "yes", name: "Yes", price: 0.5 },
                { id: "no", name: "No", price: 0.5 },
            ],
            probabilityHistory: [{ timestamp: Date.now(), yesPrice: 0.5, noPrice: 0.5 }],
            priceHistory: [{ t: Date.now(), yesPrice: 0.5, noPrice: 0.5 }],
            orderBook: { marketId: Math.random().toString(36).substr(2, 9), bids: [], asks: [] },
            ...data,
        };

        setMarkets((prev) => [...prev, newMarket]);

        setUsersById((prev) => {
            const user = prev[currentUserId];
            if (!user) return prev;

            return {
                ...prev,
                [currentUserId]: {
                    ...user,
                    balance: user.balance - creationCost - (data.liquidity || 0),
                }
            };
        });
    };

    const placeParlay = (legs: { marketId: string; outcomeId: string }[], stake: number) => {
        if (!currentUserId) return;

        if (currentUser.balance < stake) {
            alert("Insufficient balance");
            return;
        }

        if (legs.length !== 2) {
            alert("Only 2-leg parlays supported for now");
            return;
        }

        const parlayLegs: ParlayLeg[] = [];
        let combinedProb = 1;

        for (const leg of legs) {
            const m = markets.find((mk) => mk.id === leg.marketId);
            if (!m) return;
            const o = m.outcomes.find((oc) => oc.id === leg.outcomeId);
            if (!o) return;

            combinedProb *= o.price;
            parlayLegs.push({
                marketId: m.id,
                outcomeId: o.id,
                outcomeName: o.name,
                marketQuestion: m.question,
                prob: o.price,
            });
        }

        const houseEdge = 0.05;
        const multiplier = (1 / combinedProb) * (1 - houseEdge);
        const potentialPayout = stake * multiplier;

        const newParlay: ParlayBet = {
            id: Math.random().toString(36).substr(2, 9),
            legs: parlayLegs,
            stake,
            multiplier,
            potentialPayout,
            status: "open",
            createdAt: Date.now(),
        };

        setUsersById((prev) => {
            const user = prev[currentUserId];
            if (!user) return prev;

            const historyItem: TradeHistoryItem = {
                id: Math.random().toString(36).substr(2, 9),
                ts: Date.now(),
                kind: "parlay",
                marketId: null,
                description: `Parlay (${parlayLegs.length} legs)`,
                side: "Long",
                size: stake,
                status: "open",
                realizedPnl: 0,
                potentialPayout,
            };

            const updatedUser = {
                ...user,
                balance: user.balance - stake,
                parlays: [...user.parlays, newParlay],
                history: [historyItem, ...user.history],
            };

            // Equity Snapshot
            const totalEquity = updatedUser.balance; // Simplified
            const equityPoint: EquityPoint = {
                ts: Date.now(),
                equity: totalEquity,
                pnl: totalEquity - 10000, // Approx
            };

            return {
                ...prev,
                [currentUserId]: {
                    ...updatedUser,
                    equityHistory: [...updatedUser.equityHistory, equityPoint],
                }
            };
        });
    };

    const resolveMarket = (marketId: string, winningOutcomeId: string) => {
        setMarkets((prev) =>
            prev.map((m) =>
                m.id === marketId
                    ? { ...m, status: "resolved", resolutionResult: winningOutcomeId }
                    : m
            )
        );

        setTimeout(() => settleForMarket(marketId, winningOutcomeId), 100);
    };

    // Helper to derive price from order book
    const getMarketPrice = (market: Market): number => {
        const book = market.orderBook;
        if (!book) return market.outcomes.find(o => o.id === 'yes')?.price || 0.5;

        // Sort to be safe (though we try to keep them sorted)
        const sortedBids = [...book.bids].sort((a, b) => b.price - a.price); // Descending
        const sortedAsks = [...book.asks].sort((a, b) => a.price - b.price); // Ascending

        const bestBid = sortedBids.length > 0 ? sortedBids[0].price : undefined;
        const bestAsk = sortedAsks.length > 0 ? sortedAsks[0].price : undefined;

        if (bestBid !== undefined && bestAsk !== undefined) {
            const spread = bestAsk - bestBid;
            if (spread <= 0.10) {
                return (bestBid + bestAsk) / 2;
            }
        }

        return book.lastTradePriceYes || 0.5;
    };

    const placeLimitOrder = (marketId: string, side: OrderSide, price: number, size: number) => {
        if (!currentUserId) return;

        setMarkets((prev) =>
            prev.map((m) => {
                if (m.id !== marketId) return m;

                const book = m.orderBook || { marketId: m.id, bids: [], asks: [] };

                // Check for immediate match (marketable)
                // Best Ask (Lowest)
                const sortedAsks = [...book.asks].sort((a, b) => a.price - b.price);
                const bestAsk = sortedAsks.length > 0 ? sortedAsks[0].price : Infinity;

                // Best Bid (Highest)
                const sortedBids = [...book.bids].sort((a, b) => b.price - a.price);
                const bestBid = sortedBids.length > 0 ? sortedBids[0].price : -Infinity;

                if ((side === "BUY" && price >= bestAsk) || (side === "SELL" && price <= bestBid)) {
                    // Treat as market order for now (simplified)
                    // Limit orders currently assume YES token pricing
                    placeMarketOrder(marketId, 'yes', side, size);
                    return m;
                }

                // Add to book as resting order
                const newOrder: Order = {
                    id: Math.random().toString(36).substr(2, 9),
                    marketId,
                    outcome: 'YES', // Default to YES for now
                    side,
                    type: 'LIMIT',
                    price,
                    size,
                    createdAt: Date.now(),
                    ownerId: currentUserId
                };

                let newBids = book.bids;
                let newAsks = book.asks;

                if (side === "BUY") {
                    newBids = [...book.bids, newOrder].sort((a, b) => b.price - a.price);
                } else {
                    newAsks = [...book.asks, newOrder].sort((a, b) => a.price - b.price);
                }

                const newBook = {
                    ...book,
                    bids: newBids,
                    asks: newAsks,
                };

                // Update Price History with Derived Price
                // We need to construct a temporary market object to calculate the new price
                const tempMarket = { ...m, orderBook: newBook };
                const derivedPrice = getMarketPrice(tempMarket);
                const newHistory = [...m.priceHistory, { t: Date.now(), yesPrice: derivedPrice, noPrice: 1 - derivedPrice }].slice(-100);

                return { ...m, orderBook: newBook, priceHistory: newHistory };
            })
        );
    };

    const settleForMarket = (marketId: string, winningOutcomeId: string) => {
        setUsersById((prev) => {
            const nextUsers = { ...prev };

            Object.keys(nextUsers).forEach(userId => {
                const user = nextUsers[userId];
                let newBalance = user.balance;

                const newPositions = user.positions.filter((p) => {
                    if (p.marketId !== marketId) return true;

                    // New Position Structure Settlement
                    if (p.outcome === "YES" && winningOutcomeId === "yes") {
                        newBalance += p.shares * 1.0;
                    } else if (p.outcome === "NO" && winningOutcomeId === "no") {
                        newBalance += p.shares * 1.0;
                    }
                    return false; // Remove settled position
                });

                const newParlays = user.parlays.map((parlay) => {
                    if (parlay.status !== "open") return parlay;
                    const hasLeg = parlay.legs.find((l) => l.marketId === marketId);
                    if (!hasLeg) return parlay;

                    if (hasLeg.outcomeId !== winningOutcomeId) {
                        return { ...parlay, status: "lost" as const };
                    }

                    const otherLeg = parlay.legs.find((l) => l.marketId !== marketId);
                    if (!otherLeg) return parlay;

                    const otherMarket = markets.find((m) => m.id === otherLeg.marketId);
                    if (otherMarket?.status === "resolved") {
                        if (otherMarket.resolutionResult === otherLeg.outcomeId) {
                            newBalance += parlay.potentialPayout;
                            return { ...parlay, status: "won" as const };
                        } else {
                            return { ...parlay, status: "lost" as const };
                        }
                    }
                    return parlay;
                });

                // Add settlement history if changed
                let newHistory = user.history;
                if (newBalance !== user.balance) {
                    const pnl = newBalance - user.balance;
                    const historyItem: TradeHistoryItem = {
                        id: Math.random().toString(36).substr(2, 9),
                        ts: Date.now(),
                        kind: "single",
                        marketId,
                        description: `Settlement for ${marketId}`,
                        side: "Settlement",
                        size: 0,
                        status: "settled",
                        realizedPnl: pnl,
                    };
                    newHistory = [historyItem, ...user.history];
                }

                nextUsers[userId] = {
                    ...user,
                    balance: newBalance,
                    positions: newPositions,
                    parlays: newParlays,
                    history: newHistory,
                };
            });

            return nextUsers;
        });
    };

    return (
        <StoreContext.Provider
            value={{
                currentUser,
                markets,
                buy,
                sell,
                placeMarketOrder,
                placeLimitOrder,
                createMarket,
                placeParlay,
                resolveMarket,
                getMarketPrice,
                loading,
            }}
        >
            {children}
        </StoreContext.Provider>
    );
}

export function useStore() {
    const context = useContext(StoreContext);
    if (context === undefined) {
        throw new Error("useStore must be used within a StoreProvider");
    }
    return context;
}
