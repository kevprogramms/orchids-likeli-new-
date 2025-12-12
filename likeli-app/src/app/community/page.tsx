"use client";

import styles from "./community.module.css";
import { TrendingUp, TrendingDown, MessageCircle, Users, Trophy, ArrowUpRight, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type ActivityType = "trade" | "position" | "prediction" | "comment";

interface Activity {
    id: string;
    type: ActivityType;
    user: {
        name: string;
        handle: string;
        avatar: string;
        stats: {
            winRate: number;
            totalTrades: number;
            pnl: number;
        };
    };
    market: {
        id: string;
        title: string;
        category: string;
    };
    action?: {
        side: "YES" | "NO";
        amount: number;
        price: number;
    };
    prediction?: {
        outcome: "YES" | "NO";
        confidence: number;
        reasoning: string;
    };
    comment?: {
        text: string;
        likes: number;
    };
    timestamp: string;
}

const MOCK_ACTIVITIES: Activity[] = [
    {
        id: "1",
        type: "trade",
        user: {
            name: "QuantKing",
            handle: "@quantking",
            avatar: "Q",
            stats: { winRate: 68, totalTrades: 234, pnl: 12450 }
        },
        market: {
            id: "1",
            title: "Will Bitcoin reach $100k by end of Q1 2025?",
            category: "Crypto"
        },
        action: {
            side: "YES",
            amount: 5000,
            price: 0.72
        },
        timestamp: "2m ago"
    },
    {
        id: "2",
        type: "prediction",
        user: {
            name: "CryptoWhale",
            handle: "@whale",
            avatar: "C",
            stats: { winRate: 74, totalTrades: 567, pnl: 28900 }
        },
        market: {
            id: "2",
            title: "Will Ethereum surpass $5k in 2025?",
            category: "Crypto"
        },
        prediction: {
            outcome: "YES",
            confidence: 85,
            reasoning: "Strong institutional adoption and ETF inflows suggest continued upward momentum. Technical indicators align."
        },
        timestamp: "15m ago"
    },
    {
        id: "3",
        type: "position",
        user: {
            name: "DeFiDegen",
            handle: "@defidegen",
            avatar: "D",
            stats: { winRate: 62, totalTrades: 189, pnl: 8200 }
        },
        market: {
            id: "3",
            title: "Will Tesla stock hit $300 by March?",
            category: "Stocks"
        },
        action: {
            side: "NO",
            amount: 2500,
            price: 0.45
        },
        timestamp: "32m ago"
    },
    {
        id: "4",
        type: "comment",
        user: {
            name: "MarketMaven",
            handle: "@maven",
            avatar: "M",
            stats: { winRate: 71, totalTrades: 412, pnl: 19300 }
        },
        market: {
            id: "1",
            title: "Will Bitcoin reach $100k by end of Q1 2025?",
            category: "Crypto"
        },
        comment: {
            text: "The macro environment is setting up perfectly for this. Watch the ETF flows - that's the real signal here.",
            likes: 24
        },
        timestamp: "1h ago"
    },
    {
        id: "5",
        type: "trade",
        user: {
            name: "AlphaSeeker",
            handle: "@alphaseeker",
            avatar: "A",
            stats: { winRate: 66, totalTrades: 298, pnl: 15600 }
        },
        market: {
            id: "4",
            title: "Will the Fed cut rates in Q1 2025?",
            category: "Politics"
        },
        action: {
            side: "YES",
            amount: 3500,
            price: 0.58
        },
        timestamp: "2h ago"
    },
];

const TOP_TRADERS = [
    { rank: 1, name: "CryptoWhale", handle: "@whale", pnl: 28900, winRate: 74, trades: 567 },
    { rank: 2, name: "MarketMaven", handle: "@maven", pnl: 19300, winRate: 71, trades: 412 },
    { rank: 3, name: "AlphaSeeker", handle: "@alphaseeker", pnl: 15600, winRate: 66, trades: 298 },
    { rank: 4, name: "QuantKing", handle: "@quantking", pnl: 12450, winRate: 68, trades: 234 },
    { rank: 5, name: "DeFiDegen", handle: "@defidegen", pnl: 8200, winRate: 62, trades: 189 },
];

export default function CommunityPage() {
    const [activeTab, setActiveTab] = useState<"all" | "trades" | "predictions">("all");

    const filteredActivities = MOCK_ACTIVITIES.filter(activity => {
        if (activeTab === "all") return true;
        if (activeTab === "trades") return activity.type === "trade" || activity.type === "position";
        if (activeTab === "predictions") return activity.type === "prediction";
        return true;
    });

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Community</h1>
                <p className={styles.subtitle}>Follow top traders and market insights</p>
            </div>

            <div className={styles.layout}>
                <div className={styles.mainContent}>
                    <div className={styles.tabs}>
                        <button 
                            className={`${styles.tab} ${activeTab === "all" ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab("all")}
                        >
                            All Activity
                        </button>
                        <button 
                            className={`${styles.tab} ${activeTab === "trades" ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab("trades")}
                        >
                            Trades
                        </button>
                        <button 
                            className={`${styles.tab} ${activeTab === "predictions" ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab("predictions")}
                        >
                            Predictions
                        </button>
                    </div>

                    <div className={styles.feed}>
                        {filteredActivities.map((activity) => (
                            <ActivityCard key={activity.id} activity={activity} />
                        ))}
                    </div>
                </div>

                <div className={styles.sidebar}>
                    <LeaderboardWidget traders={TOP_TRADERS} />
                </div>
            </div>
        </div>
    );
}

function ActivityCard({ activity }: { activity: Activity }) {
    return (
        <div className={styles.activityCard}>
            <div className={styles.cardHeader}>
                <div className={styles.userSection}>
                    <div className={styles.avatar}>{activity.user.avatar}</div>
                    <div className={styles.userInfo}>
                        <div className={styles.userName}>{activity.user.name}</div>
                        <div className={styles.userMeta}>
                            <span className={styles.userHandle}>{activity.user.handle}</span>
                            <span className={styles.dot}>•</span>
                            <span className={styles.timestamp}>{activity.timestamp}</span>
                        </div>
                    </div>
                </div>
                <UserStats stats={activity.user.stats} />
            </div>

            <Link href={`/market/${activity.market.id}`} className={styles.marketLink}>
                <div className={styles.marketBadge}>{activity.market.category}</div>
                <div className={styles.marketTitle}>{activity.market.title}</div>
            </Link>

            {activity.type === "trade" && activity.action && (
                <div className={styles.actionCard}>
                    <div className={styles.actionHeader}>
                        <div className={`${styles.actionBadge} ${activity.action.side === "YES" ? styles.badgeYes : styles.badgeNo}`}>
                            {activity.action.side === "YES" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            <span>Bought {activity.action.side}</span>
                        </div>
                    </div>
                    <div className={styles.actionDetails}>
                        <div className={styles.actionDetail}>
                            <span className={styles.detailLabel}>Amount</span>
                            <span className={styles.detailValue}>${activity.action.amount.toLocaleString()}</span>
                        </div>
                        <div className={styles.actionDetail}>
                            <span className={styles.detailLabel}>Price</span>
                            <span className={styles.detailValue}>{(activity.action.price * 100).toFixed(0)}¢</span>
                        </div>
                    </div>
                </div>
            )}

            {activity.type === "prediction" && activity.prediction && (
                <div className={styles.predictionCard}>
                    <div className={styles.predictionHeader}>
                        <span className={`${styles.predictionBadge} ${activity.prediction.outcome === "YES" ? styles.badgeYes : styles.badgeNo}`}>
                            Predicts {activity.prediction.outcome}
                        </span>
                        <span className={styles.confidence}>{activity.prediction.confidence}% confident</span>
                    </div>
                    <p className={styles.reasoning}>{activity.prediction.reasoning}</p>
                </div>
            )}

            {activity.type === "comment" && activity.comment && (
                <div className={styles.commentCard}>
                    <p className={styles.commentText}>{activity.comment.text}</p>
                    <div className={styles.commentActions}>
                        <button className={styles.commentAction}>
                            <MessageCircle size={16} />
                            <span>{activity.comment.likes}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function UserStats({ stats }: { stats: { winRate: number; totalTrades: number; pnl: number } }) {
    return (
        <div className={styles.userStats}>
            <div className={styles.stat}>
                <span className={styles.statValue} style={{ color: stats.pnl >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {stats.pnl >= 0 ? '+' : ''}${stats.pnl.toLocaleString()}
                </span>
                <span className={styles.statLabel}>P&L</span>
            </div>
            <div className={styles.stat}>
                <span className={styles.statValue}>{stats.winRate}%</span>
                <span className={styles.statLabel}>Win Rate</span>
            </div>
        </div>
    );
}

function LeaderboardWidget({ traders }: { traders: typeof TOP_TRADERS }) {
    return (
        <div className={styles.leaderboardWidget}>
            <div className={styles.widgetHeader}>
                <Trophy size={18} />
                <h3 className={styles.widgetTitle}>Top Traders</h3>
            </div>
            <div className={styles.leaderboardList}>
                {traders.map((trader) => (
                    <div key={trader.rank} className={styles.leaderboardItem}>
                        <div className={styles.traderRank}>#{trader.rank}</div>
                        <div className={styles.traderInfo}>
                            <div className={styles.traderName}>{trader.name}</div>
                            <div className={styles.traderStats}>
                                <span className={styles.traderPnl} style={{ color: 'var(--color-success)' }}>
                                    +${(trader.pnl / 1000).toFixed(1)}k
                                </span>
                                <span className={styles.dot}>•</span>
                                <span>{trader.winRate}% WR</span>
                            </div>
                        </div>
                        <ArrowUpRight size={16} className={styles.traderIcon} />
                    </div>
                ))}
            </div>
        </div>
    );
}
