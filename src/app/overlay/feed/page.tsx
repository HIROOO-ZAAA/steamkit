"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, DollarSign, User } from "lucide-react";
import styles from "./feed.module.css";

type FeedItem = {
  id: string;
  tipper_name: string;
  amount: number;
  currency: string;
  message: string | null;
  payment_method?: string | null;
  created_at: string;
};

type TipEvent = FeedItem & { payment_status: string };

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TipTransactionCard({ item, latest }: { item: FeedItem; latest: boolean }) {
  const isKhr = item.currency === "KHR";
  return (
    <div className={`${styles.card} ${latest ? styles.cardActive : ""}`}>
      <div className={styles.topRow}>
        <div className={styles.nameGroup}>
          <span className={styles.amount}>
            {isKhr ? (
              <span className={styles.amountIcon}>៛</span>
            ) : (
              <DollarSign className={styles.amountIcon} />
            )}
            {isKhr
              ? Number(item.amount).toLocaleString()
              : Number(item.amount).toFixed(2)}
          </span>
          <User className={styles.userIcon} />
          <span className={styles.tipperName} title={item.tipper_name}>
            {item.tipper_name}
          </span>
        </div>
        <span className={styles.timestamp}>{formatTimestamp(item.created_at)}</span>
      </div>

      <div className={styles.bottomRow}>
        {item.message && <p className={styles.message}>{item.message}</p>}
        <span className={styles.badge}>
          <span className={styles.badgeDot} />
          {item.payment_method ?? "ABA PAY"}
          <CheckCircle2 className={styles.check} />
        </span>
      </div>
    </div>
  );
}

export default function DonationFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; title?: string; rows?: string }>;
}) {
  const { token, title, rows } = use(searchParams);
  const [supabase] = useState(() => createClient());
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rpcFailed, setRpcFailed] = useState(false);

  const limit = Math.min(Math.max(Number(rows) || 5, 1), 15);
  const feedTitle = title || "LIVE TRANSACTIONS";

  useEffect(() => {
    const id = "nexus-feed-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let tipsChannel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const { data, error: rpcError } = await supabase.rpc(
        "streamkit_get_recent_tips",
        { p_token: token, p_limit: limit },
      );
      if (disposed) return;
      if (rpcError) {
        setRpcFailed(true);
        return;
      }
      setItems((data as FeedItem[] | null) ?? []);
      setRpcFailed(false);
      setLoaded(true);
    }

    async function subscribeToTips() {
      const { data } = await supabase.rpc("streamkit_resolve_overlay", {
        p_token: token,
      });
      if (disposed) return;
      const creatorId = (data as { creator_id: string }[] | null)?.[0]
        ?.creator_id;
      if (!creatorId || disposed) return;
      const filter = `creator_id=eq.${creatorId}`;
      tipsChannel = supabase
        .channel(`streamkit-recent-feed-${creatorId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "tips", filter },
          (payload) => {
            const tip = payload.new as TipEvent;
            if (tip.payment_status !== "successful" && tip.payment_status !== "test") return;
            setItems((prev) =>
              [tip, ...prev.filter((seen) => seen.id !== tip.id)].slice(0, limit),
            );
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "tips", filter },
          () => void load(),
        )
        .subscribe();
    }

    void load();
    void subscribeToTips();
    const t = window.setInterval(load, 5000);
    return () => {
      disposed = true;
      window.clearInterval(t);
      if (tipsChannel) void supabase.removeChannel(tipsChannel);
    };
  }, [supabase, token, limit]);

  if (!token || rpcFailed) {
    return (
      <div style={{ padding: 20, color: "#f59e0b", fontFamily: "sans-serif", fontSize: 14 }}>
        Invalid or missing token. Use /overlay/feed?token=YOUR_TOKEN
      </div>
    );
  }

  if (!loaded || items.length === 0) return null;

  return (
    <div className={styles.feed}>
      <div className={styles.header}>
        <span className={styles.headerDot} />
        {feedTitle}
      </div>
      <div className={styles.list}>
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <TipTransactionCard item={item} latest={index === 0} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}