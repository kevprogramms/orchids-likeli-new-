"use client";

import styles from "./community.module.css";
import { Heart, MessageCircle, Share2 } from "lucide-react";

const POSTS = [
    {
        id: 1,
        user: "SatoshiNakamoto",
        handle: "@satoshi",
        content: "Bitcoin breaking $100k seems inevitable given the current macro environment. The institutional flows are just getting started.",
        likes: 1240,
        comments: 45,
        time: "2h ago"
    },
    {
        id: 2,
        user: "VitalikButerin",
        handle: "@vitalik",
        content: "Interesting to see the prediction markets converging on the election outcome. The wisdom of the crowd is powerful.",
        likes: 890,
        comments: 32,
        time: "4h ago"
    },
    {
        id: 3,
        user: "LikeliOfficial",
        handle: "@likeli",
        content: "New Vault Alert: 'Crypto Alpha' managed by DeFi Degen is now live! 🚀",
        likes: 560,
        comments: 12,
        time: "6h ago"
    },
];

export default function CommunityPage() {
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Community</h1>
                <p className={styles.subtitle}>Join the conversation with top traders.</p>
            </div>

            <div className={styles.feed}>
                {POSTS.map((post) => (
                    <div key={post.id} className={styles.postCard}>
                        <div className={styles.postHeader}>
                            <div className={styles.avatar}>{post.user[0]}</div>
                            <div className={styles.userInfo}>
                                <span className={styles.userName}>{post.user}</span>
                                <span className={styles.userHandle}>{post.handle}</span>
                            </div>
                            <span className={styles.postTime}>{post.time}</span>
                        </div>

                        <p className={styles.postContent}>{post.content}</p>

                        <div className={styles.postActions}>
                            <button className={styles.actionBtn}>
                                <Heart size={18} />
                                {post.likes}
                            </button>
                            <button className={styles.actionBtn}>
                                <MessageCircle size={18} />
                                {post.comments}
                            </button>
                            <button className={styles.actionBtn}>
                                <Share2 size={18} />
                                Share
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
