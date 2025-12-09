"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { X } from "lucide-react";
import styles from "./markets.module.css";

interface CreateMarketModalProps {
    onClose: () => void;
}

export default function CreateMarketModal({ onClose }: CreateMarketModalProps) {
    const { currentUser } = useStore();
    const router = useRouter(); // Import useRouter
    const { isAuthenticated } = useAuth();
    const [question, setQuestion] = useState("");
    const [category, setCategory] = useState("General");
    const [date, setDate] = useState("");
    const [liquidity, setLiquidity] = useState("100");
    const [rules, setRules] = useState("");

    const handleSubmit = async () => {
        if (!question || !date || !rules) {
            alert("Please fill all fields");
            return;
        }

        const liqNum = parseFloat(liquidity);
        if (liqNum < 100) {
            alert("Minimum liquidity is $100");
            return;
        }

        try {
            const res = await fetch("/api/sandbox/markets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question,
                    category,
                    resolutionDate: date,
                    initialLiquidityUsd: liqNum,
                    rules
                })
            });

            if (res.ok) {
                const market = await res.json();
                onClose();
                router.push(`/market/${market.id}`);
            } else {
                alert("Failed to create market");
            }
        } catch (e) {
            console.error(e);
            alert("Error creating market");
        }
    };

    const totalCost = parseFloat(liquidity || "0") + 50;
    const canAfford = currentUser?.balance >= totalCost && isAuthenticated;

    return (
        <div className={styles.backdrop}>
            <div className={styles.modalCard}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>Create Sandbox Market</h2>
                        <p className={styles.subtitle}>Launch a new market in the community sandbox.</p>
                    </div>
                    <button onClick={onClose} className={styles.close}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {/* Left Column: Form Fields */}
                    <div className={styles.left}>
                        {/* Question Input */}
                        <div className={styles.field}>
                            <label className={styles.label}>Market Question</label>
                            <input
                                className={styles.input}
                                placeholder="e.g. Will Bitcoin hit $100k by 2025?"
                                value={question}
                                onChange={e => setQuestion(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Category */}
                            <div className={styles.field}>
                                <label className={styles.label}>Category</label>
                                <select
                                    className={styles.select}
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                >
                                    <option>General</option>
                                    <option>Crypto</option>
                                    <option>Politics</option>
                                    <option>Sports</option>
                                    <option>Tech</option>
                                    <option>Culture</option>
                                </select>
                            </div>

                            {/* Date */}
                            <div className={styles.field}>
                                <label className={styles.label}>Resolution Date</label>
                                <input
                                    type="date"
                                    className={styles.input}
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Rules */}
                        <div className={styles.field}>
                            <label className={styles.label}>Resolution Rules</label>
                            <textarea
                                className={`${styles.input} min-h-[80px]`}
                                placeholder="Define exact resolution conditions..."
                                value={rules}
                                onChange={e => setRules(e.target.value)}
                            />
                        </div>

                        {/* Liquidity Section */}
                        <div className={styles.field}>
                            <div className="flex justify-between">
                                <label className={styles.label}>Initial Liquidity</label>
                                <span className="text-xs text-gray-400">Min: $100</span>
                            </div>

                            <input
                                type="number"
                                className={styles.input}
                                value={liquidity}
                                onChange={e => setLiquidity(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Right Column: Summary & Actions */}
                    <div className={styles.right}>
                        <div className={styles.summaryBox}>
                            <div className={styles.summaryContent}>
                                <h3 className={styles.label} style={{ marginBottom: "16px" }}>Cost Summary</h3>

                                <div className={styles.summaryRow}>
                                    <span>Liquidity Deposit</span>
                                    <span className="font-mono">${parseFloat(liquidity || "0").toFixed(2)}</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>Creation Fee</span>
                                    <span className="font-mono">$50.00</span>
                                </div>

                                <div className={styles.summaryTotal}>
                                    <span>Total Cost</span>
                                    <span style={{ color: canAfford ? "inherit" : "#ef4444" }}>
                                        ${totalCost.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.actions}>
                                <button
                                    className={`${styles.btn} ${styles.btnOutline}`}
                                    onClick={onClose}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    disabled={!canAfford || !question || !date || !rules}
                                    onClick={handleSubmit}
                                >
                                    {!isAuthenticated ? "Connect Wallet" : canAfford ? "Create Market" : "Insufficient Balance"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
