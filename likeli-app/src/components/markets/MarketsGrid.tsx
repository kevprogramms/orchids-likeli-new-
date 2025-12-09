"use client";

import styles from "./markets.module.css";
import MarketCard from "./MarketCard";
import { Market } from "@/lib/store";

interface MarketsGridProps {
    markets: Market[];
}

export default function MarketsGrid({ markets }: MarketsGridProps) {
    return (
        <div className={styles.grid}>
            {markets.length === 0 ? (
                <div className="col-span-full text-center text-muted py-10">
                    No markets found.
                </div>
            ) : (
                markets.map((market) => (
                    <MarketCard
                        key={market.id}
                        id={market.id}
                        name={market.question}
                        category={market.category}
                        yes={market.outcomes.find(o => o.id === "yes")?.price || 0.5}
                        no={market.outcomes.find(o => o.id === "no")?.price || 0.5}
                        vol={`$${(market.volume / 1000).toFixed(1)}k`}
                        end={market.resolutionDate}
                        image={market.image}
                    />
                ))
            )}
        </div>
    );
}
