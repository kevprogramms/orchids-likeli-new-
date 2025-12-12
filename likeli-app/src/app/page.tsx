"use client";

import { useState, useEffect } from "react";
import StatsStrip from "@/components/markets/StatsStrip";
import MarketsGrid from "@/components/markets/MarketsGrid";
import { useStore } from "@/lib/store";
import CreateMarketModal from "@/components/markets/CreateMarketModal";
import ParlayBuilder from "@/components/trade/ParlayBuilder";
import styles from "./page.module.css";
import { Search } from "lucide-react";
import clsx from "clsx";

const CATEGORIES = ["For you", "Crypto", "Macro", "Politics", "Sports", "Culture", "Technology", "Entertainment"];

export default function Home() {
  const { markets } = useStore();
  const [activeTab, setActiveTab] = useState<"main" | "sandbox">("main");
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isParlayOpen, setIsParlayOpen] = useState(false);

  // Sandbox State
  const [sandboxMarketsList, setSandboxMarketsList] = useState<any[]>([]);

  // Fetch sandbox markets when tab changes
  useEffect(() => {
    if (activeTab === "sandbox") {
      fetch("/api/sandbox/markets")
        .then((res) => res.json())
        .then((data) => {
          // Map to UI format
          // SandboxMarket: { id, question, category, curve: { yes: { minPrice, maxPrice, supply... } } }
          // UI Market: { id, question, category, outcomes: [...] }
          // MarketsGrid expects 'market' prop.
          // Let's adapt it.

          if (Array.isArray(data)) {

            const mapped = data.map((m: any) => {
              const prob = (m.priceHistory && m.priceHistory.length > 0)
                ? (m.priceHistory[m.priceHistory.length - 1].yesPrice || 0.5)
                : 0.5;

              return {
                id: m.id,
                question: m.question,
                category: m.category || "General",
                resolutionDate: m.resolutionDate,
                volume: 0, // TODO: calculate from curve or track
                outcomes: [
                  { id: "yes", name: "Yes", price: prob },
                  { id: "no", name: "No", price: 1 - prob }
                ],
                phase: "sandbox_curve",
                image: "/placeholder-icon.png" // Mock
              };
            });
            setSandboxMarketsList(mapped);
          }
        })
        .catch(console.error);
    }
  }, [activeTab]);


  const visibleMarkets = (activeTab === "main" ? markets : sandboxMarketsList).filter(m => {
    // For main, use graduation filter? User said "sandbox markets" logic is separate.
    // If activeTab is sandbox, we show everything returned by API.
    // If activeTab is main, we show store markets.
    // The previous logic filters 'markets' which is only main data.

    // Main Tab Logic:
    // const matchesTab = activeTab === "main" ? m.isGraduated : !m.isGraduated; 
    // ^ This was old logic assuming shared store. Now we have separate sources.

    const matchesCategory = activeCategory === "All" || m.category === activeCategory;
    const matchesSearch = m.question.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-col" style={{ gap: "var(--space-6)" }}>
      <StatsStrip />

      <div className={styles.controlsRow}>
        <div className={styles.controlsLeft}>
          {/* Tabs */}
          <div className={styles.tabGroup}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "main" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("main")}
            >
              Main Markets
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "sandbox" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("sandbox")}
            >
              Sandbox Markets
            </button>
          </div>

          {/* Search */}
          <div className={styles.searchBar}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search markets..."
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Header Actions */}
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => setIsParlayOpen(true)}
          >
            Parlay Builder
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setIsCreateOpen(true)}
          >
            Create Market
          </button>
        </div>
      </div>

      {/* Kalshi-style Horizontal Category Filter */}
      <div className={styles.categoryFilterWrapper}>
        <div className={styles.categoryFilterScroller}>
          <div className={styles.categoryFilterInner}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={clsx(
                  styles.categoryButton,
                  activeCategory === cat && styles.categoryButtonActive
                )}
                onClick={() => setActiveCategory(cat === "For you" ? "All" : cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <MarketsGrid markets={visibleMarkets} />

      {isCreateOpen && (
        <CreateMarketModal onClose={() => setIsCreateOpen(false)} />
      )}

      {isParlayOpen && (
        <ParlayBuilder onClose={() => setIsParlayOpen(false)} />
      )}
    </div>
  );
}