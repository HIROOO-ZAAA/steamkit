"use client";

import { use, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./raffle-overlay.module.css";

type OverlayResolution = { creator_id: string };
type RaffleSnapshot = {
  id: string;
  title: string;
  status: "open" | "closed" | "completed";
  winner_name: string | null;
};
type RaffleEntry = { username: string; display_name: string | null; entries_count: number };

export default function RaffleOverlay({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = use(searchParams);
  const [supabase] = useState(() => createClient());
  const [creatorId, setCreatorId] = useState("");
  const [raffle, setRaffle] = useState<RaffleSnapshot | null>(null);
  const [entries, setEntries] = useState<RaffleEntry[]>([]);
  const [rollingName, setRollingName] = useState("");
  const [winnerName, setWinnerName] = useState("");
  const [wheelRotation, setWheelRotation] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "error">("loading");
  const revealKey = useRef("");
  const timers = useRef<number[]>([]);

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

    async function refreshRaffle() {
      if (cancelled || pending) return;
      pending = true;
      const { data: current, error } = await supabase
        .from("raffles")
        .select("id, title, status, winner_name")
        .eq("user_id", creatorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) {
        pending = false;
        return;
      }
      if (error) {
        setStatus("error");
        pending = false;
        return;
      }
      if (!current) {
        setRaffle(null);
        setEntries([]);
        setWinnerName("");
        setStatus("ready");
        pending = false;
        return;
      }

      const next = current as RaffleSnapshot;
      const { data: rows, error: entriesError } = await supabase
        .from("raffle_entries")
        .select("username, display_name, entries_count")
        .eq("raffle_id", next.id)
        .order("created_at", { ascending: true });
      if (cancelled) {
        pending = false;
        return;
      }
      if (entriesError) {
        setStatus("error");
        pending = false;
        return;
      }

      const nextEntries = (rows ?? []) as RaffleEntry[];
      setRaffle(next);
      setEntries(nextEntries);
      setStatus("ready");

      if (next.status === "completed" && next.winner_name) {
        const key = `${next.id}:${next.winner_name}`;
        if (revealKey.current !== key) {
          revealKey.current = key;
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setRollingName("");
            setWinnerName(next.winner_name);
            pending = false;
            return;
          }
          const entrants = nextEntries.flatMap((entry) =>
            Array(Math.min(20, Math.max(1, entry.entries_count))).fill(
              entry.display_name || entry.username,
            ),
          );
          const winningIndex = Math.max(0, entrants.indexOf(next.winner_name));
          const segmentAngle = 360 / Math.max(entrants.length, 1);
          setWheelRotation((current) => current + 360 * 5 + 360 - ((winningIndex + 0.5) * segmentAngle));
          let index = 0;
          setWinnerName("");
          setRollingName(entrants[0] ?? "Drawing winner…");
          const roll = window.setInterval(() => {
            index = (index + 1) % Math.max(entrants.length, 1);
            setRollingName(entrants[index] ?? "Drawing winner…");
          }, 110);
          const finish = window.setTimeout(() => {
            window.clearInterval(roll);
            setRollingName("");
            setWinnerName(next.winner_name ?? "");
          }, 2800);
          timers.current.push(roll, finish);
        }
      } else if (next.status !== "completed") {
        revealKey.current = "";
        setWinnerName("");
        setRollingName("");
      }
      pending = false;
    }

    void refreshRaffle();
    const poll = window.setInterval(() => void refreshRaffle(), 1800);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      timers.current.forEach((timer) => {
        window.clearInterval(timer);
        window.clearTimeout(timer);
      });
      timers.current = [];
    };
  }, [creatorId, supabase]);

  const ticketCount = entries.reduce((sum, entry) => sum + Math.max(0, entry.entries_count), 0);
  const display = rollingName || winnerName;
  const viewStatus = token ? status : "invalid";
  const wheelNames = entries.flatMap((entry) =>
    Array(Math.min(20, Math.max(1, entry.entries_count))).fill(entry.display_name || entry.username),
  ).slice(0, 16);
  const wheelBackground = wheelNames.length
    ? `conic-gradient(${wheelNames.map((_, index) => {
        const colors = ["#0e5844", "#087e8b", "#166b86", "#7753a6", "#af7a2c"];
        const start = (index / wheelNames.length) * 360;
        const end = ((index + 1) / wheelNames.length) * 360;
        return `${colors[index % colors.length]} ${start}deg ${end}deg`;
      }).join(", ")})`
    : "conic-gradient(#0e5844 0deg 90deg, #087e8b 90deg 180deg, #166b86 180deg 270deg, #7753a6 270deg 360deg)";

  return (
    <main className={styles.screen} aria-label="Raffle winner reveal overlay">
      <div className={styles.backdrop} aria-hidden="true"><i /><i /><i /></div>
      <section className={`${styles.panel} ${winnerName ? styles.winnerPanel : ""}`}>
        <span className={styles.kicker}>STREAMKIT · GIVEAWAY</span>
        <h1>{raffle?.title || "RAFFLE REVEAL"}</h1>
        <div className={styles.wheelStage}>
          <div className={styles.pointer} aria-hidden="true" />
          <div className={`${styles.wheel} ${rollingName ? styles.rolling : ""}`} style={{ background: wheelBackground, transform: `rotate(${wheelRotation}deg)` }}>
            {wheelNames.map((name, index) => (
              <span key={`${name}-${index}`} className={styles.wheelLabel} style={{ transform: `rotate(${(index / wheelNames.length) * 360}deg) translateY(-118px) rotate(90deg)` }}>{name}</span>
            ))}
            <span className={styles.hub} aria-live="polite">{display || (viewStatus === "loading" ? "Loading" : viewStatus === "invalid" ? "Unavailable" : viewStatus === "error" ? "Error" : "READY")}</span>
          </div>
        </div>
        <span className={styles.caption}>{winnerName ? `WINNER · ${winnerName}` : rollingName ? "REVEALING WINNER" : "WAITING FOR DRAW"}</span>
        <div className={styles.footer}>
          <span>{ticketCount} ticket{ticketCount === 1 ? "" : "s"}</span>
          <span className={styles.liveBadge}><i />{raffle?.status === "completed" ? "DRAW COMPLETE" : raffle?.status === "closed" ? "ENTRIES CLOSED" : "ENTRIES OPEN"}</span>
        </div>
      </section>
      <div className={styles.srStatus} role="status" aria-live="polite">
        {winnerName ? `Raffle winner: ${winnerName}` : rollingName ? "Revealing the raffle winner." : "Raffle overlay ready."}
      </div>
    </main>
  );
}
