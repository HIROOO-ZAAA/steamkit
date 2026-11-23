"use client";

import { use, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./subathon-overlay.module.css";

type TimerSnapshot = {
  remaining_seconds: number;
  is_paused: boolean;
  ends_at: string | null;
};

type OverlayResolution = { creator_id: string };

export default function SubathonOverlay({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = use(searchParams);
  const [supabase] = useState(() => createClient());
  const [creatorId, setCreatorId] = useState("");
  const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(null);
  const [now, setNow] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "error">("loading");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("streamkit_resolve_overlay", {
        p_token: token,
      });
      const resolved = (data as OverlayResolution[] | null)?.[0];
      if (cancelled) return;
      if (error || !resolved?.creator_id) {
        setStatus("invalid");
        return;
      }
      setCreatorId(resolved.creator_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, token]);

  useEffect(() => {
    if (!creatorId) return;
    let cancelled = false;
    let pending = false;

    async function refreshTimer() {
      if (cancelled || pending) return;
      pending = true;
      const { data, error } = await supabase
        .from("subathons")
        .select("remaining_seconds, is_paused, ends_at")
        .eq("user_id", creatorId)
        .maybeSingle();
      if (!cancelled) {
        if (error || !data) {
          setStatus("error");
        } else {
          setSnapshot({
            remaining_seconds: Math.max(0, Number(data.remaining_seconds) || 0),
            is_paused: Boolean(data.is_paused),
            ends_at: typeof data.ends_at === "string" ? data.ends_at : null,
          });
          setStatus("ready");
        }
      }
      pending = false;
    }

    void refreshTimer();
    const poll = window.setInterval(() => void refreshTimer(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [creatorId, supabase]);

  useEffect(() => {
    if (!snapshot || snapshot.is_paused || !snapshot.ends_at) return;
    const tick = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, [snapshot]);

  const seconds = useMemo(() => {
    if (!snapshot) return 0;
    if (snapshot.is_paused || !snapshot.ends_at) return snapshot.remaining_seconds;
    if (now === 0) return snapshot.remaining_seconds;
    return Math.max(0, Math.ceil((new Date(snapshot.ends_at).getTime() - now) / 1000));
  }, [now, snapshot]);

  const formatted = `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor((seconds % 3600) / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const running = Boolean(snapshot && !snapshot.is_paused && seconds > 0);
  const viewStatus = token ? status : "invalid";

  return (
    <main className={styles.screen} aria-label="Subathon timer overlay">
      <div className={styles.orbit} aria-hidden="true"><i /><i /><i /></div>
      <section className={styles.timerCard}>
        <span className={styles.kicker}>STREAMKIT · LIVE COUNTDOWN</span>
        <h1>SUBATHON</h1>
        <output className={styles.clock} aria-live="off">{viewStatus === "ready" ? formatted : "--:--:--"}</output>
        <div className={`${styles.state} ${running ? styles.live : ""}`}>
          <span className={styles.stateDot} />
          {viewStatus === "loading" ? "CONNECTING" : viewStatus === "invalid" ? "LINK UNAVAILABLE" : viewStatus === "error" ? "TIMER UNAVAILABLE" : running ? "COUNTING DOWN" : "PAUSED"}
        </div>
      </section>
      {viewStatus === "invalid" || viewStatus === "error" ? (
        <p className={styles.srStatus} role="status">{viewStatus === "invalid" ? "Subathon overlay link is invalid." : "Subathon timer data is unavailable."}</p>
      ) : null}
    </main>
  );
}
