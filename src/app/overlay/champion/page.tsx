"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Crown, TrendingUp } from "lucide-react";
import styles from "./champion-overlay.module.css";

type Champion = {
  id: string;
  donor_name: string;
  amount: number;
  currency: string;
  period_start: string;
};

export default function ChampionOverlay({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [champion, setChampion] = useState<Champion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [animate, setAnimate] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    let disposed = false;
    let pollTimer: number | null = null;

    async function init() {
      try {
        const { data: resolved, error: resolveError } = await supabase.rpc(
          "streamkit_resolve_overlay",
          { p_token: token },
        );
        if (resolveError || !resolved) {
          if (!disposed) {
            setError(true);
            setLoading(false);
          }
          return;
        }
        const overlay = Array.isArray(resolved) ? resolved[0] : resolved;
        if (!overlay?.creator_id) {
          if (!disposed) {
            setError(true);
            setLoading(false);
          }
          return;
        }

        async function fetchChampion() {
          try {
            const { data, error: championError } = await supabase
              .from("champion")
              .select("id, donor_name, amount, currency, period_start")
              .eq("creator_id", overlay.creator_id)
              .order("period_start", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (championError || !data) return;

            if (!disposed) {
              setChampion((prev) => {
                if (!prev || prev.id !== data.id) {
                  setAnimate(true);
                  setTimeout(() => setAnimate(false), 2500);
                }
                return data;
              });
            }
          } catch {
            // Poll failure is non-fatal
          }
        }

        await fetchChampion();

        if (!disposed) setLoading(false);

        pollTimer = window.setInterval(fetchChampion, 3000);
      } catch {
        if (!disposed) {
          setError(true);
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      disposed = true;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [supabase, token]);

  if (loading) {
    return (
      <div className={styles.overlay} style={{ background: "transparent" }}>
        <p className={styles.championEmpty}>Loading champion…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.overlay} style={{ background: "transparent" }}>
        <p className={styles.championEmpty}>⚠ Could not load champion. Check overlay token.</p>
      </div>
    );
  }

  if (!champion) {
    return (
      <div className={styles.overlay} style={{ background: "transparent" }}>
        <div className={styles.championEmptyContainer}>
          <Crown size={48} className={styles.championCrown} />
          <p className={styles.championEmpty}>No champion yet. Be the first to donate!</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} style={{ background: "transparent" }}>
      <div
        className={`${styles.championContainer} ${animate ? styles.championPulse : ""}`}
      >
        <div className={styles.championBadge}>
          <Crown size={20} className={styles.championCrownIcon} />
          <span>TOP DONOR</span>
          <TrendingUp size={16} className={styles.championTrending} />
        </div>
        <div className={styles.championName}>{champion.donor_name}</div>
        <div className={styles.championAmount}>
          {champion.amount.toFixed(2)} {champion.currency}
        </div>
      </div>
    </div>
  );
}