"use client";

import { useEffect, useState } from "react";
import ChartContainer from "@/components/trade/ChartContainer";
import TradePanel from "@/components/trade/TradePanel";
import styles from "@/components/trade/trade.module.css";
import { useParams } from "next/navigation";
import OrderBook from "@/components/trade/OrderBook";
import { MarketOrderbook, PricePoint } from "@/lib/orderbook";

export default function MarketPage() {
    const params = useParams();
    const id = params?.id as string;
    const mode = "simple";

    // State for Real Data
    const [orderbook, setOrderbook] = useState<MarketOrderbook | null>(null);
    const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
    const [loading, setLoading] = useState(true);

    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [marketDataFull, setMarketDataFull] = useState<any>(null);

    const fetchData = async () => {
        try {
            if (id.startsWith("sb_")) {
                // Sandbox Mode
                const res = await fetch(`/api/sandbox/markets/${id}`);
                if (!res.ok) return; // Handle 404
                const marketData = await res.json();

                // Map sandbox data to UI state
                // Mock orderbook structure for UI compatibility or pass data differently?
                // The UI uses 'orderbook?.yes.bids' etc. 
                // We should probably adapt sandbox data to look like 'orderbook' for now, 
                // or update the UI to handle a different data shape.
                // Adapting is easiest to keep "existing UI/Styling exactly as it is".

                const prob = (marketData.priceHistory[marketData.priceHistory.length - 1]?.yesPrice || 0.5) * 100;

                setOrderbook({
                    marketId: marketData.id,
                    yes: { bids: [], asks: [], bestAsk: prob / 100, bestBid: prob / 100 }, // Mock empty book but set price
                    no: { bids: [], asks: [], bestAsk: 1 - prob / 100, bestBid: 1 - prob / 100 },
                    probability: prob,
                    lastTradePrice: prob / 100
                } as any);

                // Chart data - pass raw history, chart component handles transformation
                if (marketData.priceHistory) {
                    setPriceHistory(marketData.priceHistory);
                }

                // We also need to pass the "phase" to TradePanel. 
                // The TradePanel receives "market" prop. 
                // In the render: `market={{ id: id, question: marketMeta.question, status: "open" } as any}`
                // We need to update that mock object in the render or state.

                // Let's store the full market object
                setMarketDataFull(marketData);

            } else {
                // Regular Mode
                const obRes = await fetch(`/api/markets/${id}/orderbook`);
                const obData = await obRes.json();
                if (obData) setOrderbook(obData);

                const histRes = await fetch(`/api/markets/${id}/price-history`);
                const histData = await histRes.json();
                if (histData.points) setPriceHistory(histData.points);
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) fetchData();
    }, [id, refreshTrigger]);

    // Auto-refresh every 5s
    useEffect(() => {
        const i = setInterval(() => setRefreshTrigger(n => n + 1), 5000);
        return () => clearInterval(i);
    }, []);

    const handleOrderPlaced = () => {
        // Force refresh to get new price history and positions
        setRefreshTrigger(n => n + 1);
        fetchData();
    };

    if (loading) return <div className="p-10 text-center">Loading market data...</div>;

    // Mock Market metadata for display or use Real Data
    const marketMeta = marketDataFull || {
        question: "Will this event happen?",
        category: "Tech",
        resolutionDate: "Dec 31, 2024",
        status: "OPEN"
    };

    // Extract Data
    const bids = orderbook?.yes.bids.map(b => ({ price: b.price, size: b.qty })) || [];
    const asks = orderbook?.yes.asks.map(a => ({ price: a.price, size: a.qty })) || [];

    // Probability / Prices
    const probability = orderbook?.probability || 50;
    const yesPrice = probability / 100;
    const bestAsk = orderbook?.yes.bestAsk; // Could be undefined

    const isSandbox = marketDataFull?.phase === "sandbox_curve";

    return (
        <div className={styles.container}>
            <div className={styles.leftColumn}>
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>{marketMeta.question}</h1>
                        <div className={styles.tags}>
                            <span className={styles.tag}>{marketMeta.category}</span>
                            <span className={styles.tag}>{marketMeta.resolutionDate}</span>
                            <span className={styles.tag} style={{ color: "var(--color-success)", borderColor: "var(--color-success)" }}>
                                {marketMeta.status || "active"}
                            </span>
                            {isSandbox && (
                                <span className={styles.tag} style={{ color: "#a855f7", borderColor: "#a855f7" }}>
                                    Sandbox
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <ChartContainer
                    mode={mode}
                    setMode={() => { }}
                    priceHistory={priceHistory}
                />
            </div>

            <div className={styles.rightColumn}>
                <TradePanel
                    mode={mode}
                    market={marketDataFull || { id: id, question: marketMeta.question, status: "open" } as any}
                    onOrderPlaced={handleOrderPlaced}
                    currentPrice={yesPrice}
                    bestAsk={bestAsk}
                />
                {!isSandbox ? (
                    <OrderBook
                        bids={bids}
                        asks={asks}
                        lastTrade={undefined}
                    />
                ) : (
                    <div className="p-4 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)] text-center text-sm text-[var(--text-secondary)]">
                        <p>Sandbox Market – trading is via bonding curve (no orderbook yet).</p>
                    </div>
                )}
            </div>
        </div>
    );
}
