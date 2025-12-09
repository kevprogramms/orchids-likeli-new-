import styles from "./markets.module.css";
import clsx from "clsx";
import Link from "next/link";

interface MarketCardProps {
    id: string | number;
    name: string;
    category: string;
    yes: number;
    no: number;
    vol: string;
    end: string;
    image?: string;
}

export default function MarketCard({ id, name, category, yes, no, vol, end, image }: MarketCardProps) {
    const prob = (yes * 100).toFixed(0);

    return (
        <Link href={`/market/${id}`} className={styles.marketCard}>
            <div className={styles.cardHeader}>
                <div className={styles.cardImagePlaceholder} />
                <div className={styles.cardCategory}>{category}</div>
            </div>

            <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{name}</h3>

                <div className={styles.cardStats}>
                    <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>Yes</span>
                        <span className={clsx(styles.cardStatValue, "text-success")}>{yes.toFixed(2)}¢</span>
                    </div>
                    <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>No</span>
                        <span className={clsx(styles.cardStatValue, "text-danger")}>{no.toFixed(2)}¢</span>
                    </div>
                </div>

                <div className={styles.cardProbBar}>
                    <div
                        className={styles.probFill}
                        style={{ width: `${prob}%` }}
                    />
                </div>

                <div className="flex-between" style={{ marginTop: "var(--space-2)" }}>
                    <span className={styles.cardProb}>{prob}% Chance</span>
                    <span className={styles.cardVol}>{vol} Vol</span>
                </div>
            </div>
        </Link>
    );
}
