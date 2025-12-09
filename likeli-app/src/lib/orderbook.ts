// lib/orderbook.ts

export type Outcome = "yes" | "no";
export type Side = "buy" | "sell";

export interface Market {
    id: string;
    question: string;
    status: "open" | "resolved";
    outcome?: Outcome;
}

export interface Order {
    id: string;
    marketId: string;
    userId: string;
    outcome: Outcome;
    side: Side;        // buy or sell this outcome
    price: number;     // 0–1
    qty: number;       // original size
    remainingQty: number;
    status: "open" | "partial" | "filled" | "cancelled";
    createdAt: number;
}

export interface Trade {
    id: string;
    marketId: string;
    outcome: Outcome;
    price: number;
    qty: number;
    takerOrderId: string;
    makerOrderId: string;
    takerUserId: string;
    makerUserId: string;
    createdAt: number;
}

// Position per user + market + outcome
export interface OutcomePosition {
    userId: string;
    marketId: string;
    outcome: Outcome;
    qty: number;
    avgPrice: number;
    realizedPnl: number;
}

export interface PricePoint {
    marketId: string;
    timestamp: number;
    yesProb: number;   // 0–1
    noProb: number;    // 0–1
}

// Global singleton to survive hot reloads in dev
const globalStore = global as unknown as {
    likeli_markets: Record<string, Market>;
    likeli_orders: Order[];
    likeli_trades: Trade[];
    likeli_positions: OutcomePosition[];
    likeli_priceHistory: PricePoint[];
};

if (!globalStore.likeli_markets) globalStore.likeli_markets = {};
if (!globalStore.likeli_orders) globalStore.likeli_orders = [];
if (!globalStore.likeli_trades) globalStore.likeli_trades = [];
if (!globalStore.likeli_positions) globalStore.likeli_positions = [];
if (!globalStore.likeli_priceHistory) globalStore.likeli_priceHistory = [];

export const markets = globalStore.likeli_markets;
export const orders = globalStore.likeli_orders;
export const trades = globalStore.likeli_trades;
export const positions = globalStore.likeli_positions;
export const priceHistory = globalStore.likeli_priceHistory;

let idCounter = 1;
function nextId(prefix: string): string {
    return `${prefix}_${idCounter++}`;
}

function getOrCreatePosition(
    userId: string,
    marketId: string,
    outcome: Outcome
): OutcomePosition {
    let pos = positions.find(
        (p) =>
            p.userId === userId &&
            p.marketId === marketId &&
            p.outcome === outcome
    );
    if (!pos) {
        pos = {
            userId,
            marketId,
            outcome,
            qty: 0,
            avgPrice: 0,
            realizedPnl: 0,
        };
        positions.push(pos);
    }
    return pos;
}

export interface NewOrderInput {
    marketId: string;
    userId: string;
    outcome: Outcome;
    side: Side;
    price: number; // 0–1
    qty: number;
}

export type SubmitOrderResult =
    | { ok: true; order: Order; trades: Trade[] }
    | { ok: false; error: string };

// Helper to apply fills to a position
function applyFill(order: Order, price: number, qty: number) {
    const pos = getOrCreatePosition(order.userId, order.marketId, order.outcome);
    const isBuy = order.side === "buy";
    if (isBuy) {
        const prevQty = pos.qty;
        const totalCost = prevQty * pos.avgPrice + qty * price;
        pos.qty = prevQty + qty;
        pos.avgPrice = pos.qty > 0 ? totalCost / pos.qty : 0;
    } else {
        const prevQty = pos.qty;
        const sellQty = Math.min(prevQty, qty);
        const pnl = (price - pos.avgPrice) * sellQty;
        pos.realizedPnl += pnl;
        pos.qty = prevQty - sellQty;
        if (pos.qty <= 0) {
            pos.avgPrice = 0;
        }
    }
}

export function submitLimitOrder(input: NewOrderInput): SubmitOrderResult {
    const { marketId, userId, outcome } = input;
    let { price, qty, side } = input;

    // basic validation
    if (qty <= 0 || !Number.isFinite(qty)) {
        return { ok: false, error: "INVALID_QTY" };
    }
    if (!Number.isFinite(price) || price < 0 || price > 1) {
        return { ok: false, error: "INVALID_PRICE" };
    }

    // tick size = 0.01
    price = Math.round(price * 100) / 100;

    // no shorting: cannot sell more than you own
    if (side === "sell") {
        const pos = getOrCreatePosition(userId, marketId, outcome);
        if (pos.qty + 1e-8 < qty) {
            return { ok: false, error: "INSUFFICIENT_SHARES" };
        }
    }

    const order: Order = {
        id: nextId("order"),
        marketId,
        userId,
        outcome,
        side,
        price,
        qty,
        remainingQty: qty,
        status: "open",
        createdAt: Date.now(),
    };

    const createdTrades: Trade[] = [];
    const isBuy = side === "buy";

    const oppositeOrders = orders
        .filter(
            (o) =>
                o.marketId === marketId &&
                o.outcome === outcome &&
                o.status === "open" &&
                o.side !== side
        )
        .sort((a, b) => {
            if (isBuy) {
                // buy: match lowest asks first
                if (a.price !== b.price) return a.price - b.price;
            } else {
                // sell: match highest bids first
                if (a.price !== b.price) return b.price - a.price;
            }
            return a.createdAt - b.createdAt;
        });

    for (const maker of oppositeOrders) {
        if (order.remainingQty <= 0) break;

        const priceOk = isBuy
            ? maker.price <= order.price
            : maker.price >= order.price;
        if (!priceOk) break;

        const matchQty = Math.min(order.remainingQty, maker.remainingQty);
        const tradePrice = maker.price;

        // update maker
        maker.remainingQty -= matchQty;
        maker.status = maker.remainingQty > 0 ? "partial" : "filled";

        // update taker
        order.remainingQty -= matchQty;
        order.status = order.remainingQty > 0 ? "partial" : "filled";

        const trade: Trade = {
            id: nextId("trade"),
            marketId,
            outcome,
            price: tradePrice,
            qty: matchQty,
            takerOrderId: order.id,
            makerOrderId: maker.id,
            takerUserId: userId,
            makerUserId: maker.userId,
            createdAt: Date.now(),
        };
        trades.push(trade);
        createdTrades.push(trade);

        applyFill(maker, tradePrice, matchQty);
        applyFill(order, tradePrice, matchQty);
    }

    if (order.remainingQty > 0) {
        orders.push(order);
    }

    if (createdTrades.length > 0) {
        recordPriceSnapshot(marketId);
    }

    return { ok: true, order, trades: createdTrades };
}

// ---- ORDERBOOK + PROBABILITY ----

export interface OrderbookLevel {
    price: number;
    qty: number;
}

export interface OutcomeOrderbook {
    bids: OrderbookLevel[];
    asks: OrderbookLevel[];
    bestBid?: number;
    bestAsk?: number;
}

export interface MarketOrderbook {
    yes: OutcomeOrderbook;
    no: OutcomeOrderbook;
    probability: number; // YES probability in %
}

function aggregateSide(
    marketId: string,
    outcome: Outcome,
    side: Side
): OrderbookLevel[] {
    const filtered = orders.filter(
        (o) =>
            o.marketId === marketId &&
            o.outcome === outcome &&
            o.side === side &&
            o.status === "open"
    );
    const map = new Map<number, number>();
    for (const o of filtered) {
        const prev = map.get(o.price) ?? 0;
        map.set(o.price, prev + o.remainingQty);
    }
    const levels: OrderbookLevel[] = Array.from(map.entries()).map(
        ([price, qty]) => ({ price, qty })
    );
    levels.sort((a, b) =>
        side === "buy" ? b.price - a.price : a.price - b.price
    );
    return levels;
}

function buildOutcomeOrderbook(
    marketId: string,
    outcome: Outcome
): OutcomeOrderbook {
    const bids = aggregateSide(marketId, outcome, "buy");
    const asks = aggregateSide(marketId, outcome, "sell");
    const bestBid = bids.length ? bids[0].price : undefined;
    const bestAsk = asks.length ? asks[0].price : undefined;
    return { bids, asks, bestBid, bestAsk };
}

function getLastYesTradePrice(marketId: string): number | undefined {
    const yesTrades = trades.filter(
        (t) => t.marketId === marketId && t.outcome === "yes"
    );
    if (!yesTrades.length) return undefined;
    return yesTrades[yesTrades.length - 1].price;
}

function computeYesMid(marketId: string, yesBook: OutcomeOrderbook): number {
    const { bestBid, bestAsk } = yesBook;
    if (typeof bestBid === "number" && typeof bestAsk === "number") {
        if (bestAsk - bestBid <= 0.1 + 1e-8) {
            return (bestBid + bestAsk) / 2;
        }
    }
    const last = getLastYesTradePrice(marketId);
    if (typeof last === "number") return last;
    return 0.5; // default 50/50
}

export function getOrderbook(marketId: string): MarketOrderbook {
    const yesBook = buildOutcomeOrderbook(marketId, "yes");
    const noBook = buildOutcomeOrderbook(marketId, "no");
    const yesMid = computeYesMid(marketId, yesBook);
    return {
        yes: yesBook,
        no: noBook,
        probability: yesMid * 100,
    };
}

// ---- PRICE HISTORY FOR CHART ----

export function recordPriceSnapshot(marketId: string): void {
    const yesBook = buildOutcomeOrderbook(marketId, "yes");
    const yesProb = computeYesMid(marketId, yesBook);
    const noProb = 1 - yesProb;
    priceHistory.push({
        marketId,
        timestamp: Date.now(),
        yesProb,
        noProb,
    });
}

export function getPriceHistory(marketId: string): PricePoint[] {
    return priceHistory
        .filter((p) => p.marketId === marketId)
        .sort((a, b) => a.timestamp - b.timestamp);
}

export function getUserPositions(userId: string, marketId: string): OutcomePosition[] {
    return positions.filter(p => p.userId === userId && p.marketId === marketId);
}
