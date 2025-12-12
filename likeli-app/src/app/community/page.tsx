"use client";

import styles from "./community.module.css";
import { Home, MessageCircle, Bookmark, User, FileText, HelpCircle, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

const MOCK_POSTS = [
  {
    id: "1",
    user: {
      name: "quantum.trader",
      avatar: "Q",
      timestamp: "2m"
    },
    content: "Interesting movement on the BTC market. Watch those resistance levels.",
    hasImage: false,
  },
  {
    id: "2",
    user: {
      name: "market.maven",
      avatar: "M",
      timestamp: "15m"
    },
    content: "Just placed a significant position on ETH. The technicals are looking strong.",
    hasImage: false,
  },
  {
    id: "3",
    user: {
      name: "alpha.seeker",
      avatar: "A",
      timestamp: "1h"
    },
    content: "Anyone else seeing this pattern? Could be a major opportunity.",
    hasImage: true,
  },
];

export default function CommunityPage() {
  const [activeTab, setActiveTab] = useState<"ideas" | "trades" | "builder">("ideas");
  const [activeTimeFilter, setActiveTimeFilter] = useState<"now" | "today" | "week" | "month">("now");
  const [postText, setPostText] = useState("");

  return (
    <div className={styles.container}>
      {/* Left Sidebar */}
      <div className={styles.leftSidebar}>
        <div className={styles.sidebarContent}>
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Ideas</h2>
            <p className={styles.sidebarSubtitle}>Serving public conversation</p>
          </div>

          <nav className={styles.sidebarNav}>
            <button className={styles.navItem}>
              <Home size={20} />
              <span>Home</span>
            </button>
            <button className={styles.navItem}>
              <MessageCircle size={20} />
              <span>Replies</span>
            </button>
            <button className={styles.navItem}>
              <Bookmark size={20} />
              <span>Bookmarks</span>
            </button>
            <button className={styles.navItem}>
              <User size={20} />
              <span>Profile</span>
            </button>
            <a href="#" className={styles.navItem}>
              <FileText size={20} />
              <span>Community guidelines</span>
            </a>
            <button className={styles.navItem}>
              <HelpCircle size={20} />
              <span>Support</span>
            </button>
            <a href="#" className={styles.navItem}>
              <HelpCircle size={20} />
              <span>FAQs</span>
            </a>
          </nav>

          <button className={styles.postButton}>Post</button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Top Tabs */}
        <div className={styles.topTabs}>
          <button 
            className={`${styles.topTab} ${activeTab === "ideas" ? styles.topTabActive : ""}`}
            onClick={() => setActiveTab("ideas")}
          >
            Ideas
          </button>
          <button 
            className={`${styles.topTab} ${activeTab === "trades" ? styles.topTabActive : ""}`}
            onClick={() => setActiveTab("trades")}
          >
            Live trades
          </button>
          <button 
            className={`${styles.topTab} ${activeTab === "builder" ? styles.topTabActive : ""}`}
            onClick={() => setActiveTab("builder")}
          >
            Market builder
          </button>
        </div>

        {/* Create Post Section */}
        <div className={styles.createPost}>
          <div className={styles.createPostAvatar}>E</div>
          <div className={styles.createPostContent}>
            <textarea 
              className={styles.createPostInput}
              placeholder="What's happening?"
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
            />
            <div className={styles.createPostActions}>
              <button className={styles.gifButton}>GIF</button>
              <button 
                className={styles.postSubmitButton}
                disabled={!postText.trim()}
              >
                Post
              </button>
            </div>
          </div>
        </div>

        <div className={styles.divider}></div>

        {/* Time Filters */}
        <div className={styles.timeFilters}>
          <button 
            className={`${styles.timeFilter} ${activeTimeFilter === "now" ? styles.timeFilterActive : ""}`}
            onClick={() => setActiveTimeFilter("now")}
          >
            Now
          </button>
          <button 
            className={`${styles.timeFilter} ${activeTimeFilter === "today" ? styles.timeFilterActive : ""}`}
            onClick={() => setActiveTimeFilter("today")}
          >
            Today
          </button>
          <button 
            className={`${styles.timeFilter} ${activeTimeFilter === "week" ? styles.timeFilterActive : ""}`}
            onClick={() => setActiveTimeFilter("week")}
          >
            This Week
          </button>
          <button 
            className={`${styles.timeFilter} ${activeTimeFilter === "month" ? styles.timeFilterActive : ""}`}
            onClick={() => setActiveTimeFilter("month")}
          >
            This Month
          </button>
        </div>

        {/* Posts Feed */}
        <div className={styles.feed}>
          {MOCK_POSTS.map((post) => (
            <div key={post.id} className={styles.post}>
              <div className={styles.postAvatar}>{post.user.avatar}</div>
              <div className={styles.postContent}>
                <div className={styles.postHeader}>
                  <span className={styles.postUsername}>{post.user.name}</span>
                  <span className={styles.postTimestamp}>{post.user.timestamp}</span>
                </div>
                <p className={styles.postText}>{post.content}</p>
                {post.hasImage && (
                  <div className={styles.postImagePlaceholder}>
                    <ImageIcon size={32} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Sidebar - Empty for now, following Kalshi's layout */}
      <div className={styles.rightSidebar}>
        {/* Intentionally empty, matching Kalshi's design */}
      </div>
    </div>
  );
}
