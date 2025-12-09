
export type MarketPhase = "sandbox_curve" | "main_clob";
export type Outcome = "YES" | "NO";

// Roughly how many USD of *net* buys should move price
// from minPrice to maxPrice on the bonding curve.
const CURVE_DEPTH_USD = 1000; // tweakable – higher = flatter, lower = more reactive

export interface OutcomeCurve {
    supply: number;
    reserve: number;
    minPrice: number;
    maxPrice: number;
    maxSupply: number;
}

export interface SandboxCurveState {
    yes: OutcomeCurve;
    no: OutcomeCurve;
}

export interface SandboxMarket {
    id: string;
    question: string;
    category: string;
    resolutionDate: string;
    rules: string;
    phase: "sandbox_curve" | "main_clob";
    initialLiquidityUsd: number;
    curve: SandboxCurveState;
    priceHistory: Array<{
        timestamp: number;
        yesPrice: number;
        noPrice: number;
        probYes: number;
        probNo: number;
    }>;
    // Optional compatibility fields 
    graduated?: boolean;
    volume?: number;
    creatorId?: string;
}

export interface SandboxUser {
    id: string;
    cash: number;
    positions: Record<string, number>;
}

// Global Singleton Store
declare global {
    var _sandboxMarkets: Map<string, SandboxMarket>;
    var _sandboxUsers: Map<string, SandboxUser>;
}

if (!global._sandboxMarkets) {
    global._sandboxMarkets = new Map<string, SandboxMarket>();
}
if (!global._sandboxUsers) {
    global._sandboxUsers = new Map<string, SandboxUser>();
}

export const sandboxMarkets = global._sandboxMarkets;
export const sandboxUsers = global._sandboxUsers;

// --- Bonding Curve Math ---

export function curvePrice(outcome: OutcomeCurve): number {
    return priceAtSupply(outcome, outcome.supply);
}

export function priceAtSupply(outcome: OutcomeCurve, supply: number): number {
    const { minPrice, maxPrice, maxSupply } = outcome;
    const t = Math.min(Math.max(supply / maxSupply, 0), 1);
    return minPrice + (maxPrice - minPrice) * t;
}

export function buyCost(outcome: OutcomeCurve, delta: number): number {
    const startSupply = outcome.supply;
    const endSupply = startSupply + delta;
    const startPrice = priceAtSupply(outcome, startSupply);
    const endPrice = priceAtSupply(outcome, endSupply);
    return ((startPrice + endPrice) / 2) * delta;
}

export function sellPayout(outcome: OutcomeCurve, delta: number): number {
    const startSupply = outcome.supply;
    const endSupply = startSupply - delta;
    const startPrice = priceAtSupply(outcome, startSupply);
    const endPrice = priceAtSupply(outcome, endSupply);
    return ((startPrice + endPrice) / 2) * delta;
}

export function getProbability(market: SandboxMarket) {
    const yesPrice = curvePrice(market.curve.yes);
    const noPrice = curvePrice(market.curve.no);
    // Avoid div by zero
    const total = (yesPrice + noPrice) || 1;
    const probYes = yesPrice / total;
    const probNo = 1 - probYes;
    return { probYes, probNo, yesPrice, noPrice };
}

// --- Helpers ---

export function createSandboxCurve(initialLiquidityUsd: number): SandboxCurveState {
    const minPrice = 0.10;
    const maxPrice = 0.90;

    // average price over the curve, used for a rough integral
    const avgPrice = (minPrice + maxPrice) / 2;

    // number of tokens that, if bought from supply 0 → maxSupply,
    // would cost about CURVE_DEPTH_USD in total.
    const maxSupply = Math.round(CURVE_DEPTH_USD / avgPrice);

    const base: OutcomeCurve = {
        supply: 0,
        reserve: initialLiquidityUsd / 2, // split between YES / NO
        minPrice,
        maxPrice,
        maxSupply,
    };

    return {
        yes: { ...base },
        no: { ...base },
    };
}

export function recordSandboxPriceSnapshot(market: SandboxMarket) {
    const { probYes, probNo, yesPrice, noPrice } = getProbability(market);

    market.priceHistory.push({
        timestamp: Date.now(),
        yesPrice,
        noPrice,
        probYes,
        probNo
    });
}
