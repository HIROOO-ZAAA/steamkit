"use client";

import { useEffect, useRef, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sword, Zap, Shield, Heart, Star } from "lucide-react";
import styles from "../[token]/overlay.module.css";

const RARITY_COLORS: Record<string, string> = {
  common: "#64748B",
  uncommon: "#22C55E",
  rare: "#3B82F6",
  epic: "#A855F7",
  legendary: "#F59E0B",
};

const STAT_KEYS = ["attack", "defense", "speed", "magic", "hp"];

type Card = {
  id: string;
  name: string;
  rarity: string;
  image_url: string;
  stats: Record<string, unknown>;
};

type BattleState = "idle" | "charging" | "clash" | "resolving" | "victory";

export default function CardBattleOverlay({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [cardA, setCardA] = useState<Card | null>(null);
  const [cardB, setCardB] = useState<Card | null>(null);
  const [state, setState] = useState<BattleState>("idle");
  const [winner, setWinner] = useState<"A" | "B" | "draw" | null>(null);
  const [pool, setPool] = useState<Card[]>([]);
  const animationRef = useRef<number | null>(null);
  const battleLogRef = useRef<HTMLDivElement | null>(null);

  // Fetch card pool on mount
  useEffect(() => {
    async function loadPool() {
      try {
        const res = await fetch(`/api/cards?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.cards)) {
            setPool(data.cards);
          }
        }
      } catch {
        // Pool loading failed silently
      }
    }
    loadPool();
  }, [token]);

  const triggerBattle = async (donationIdA?: string, donationIdB?: string) => {
    if (state !== "idle" || pool.length < 2) return;

    setState("charging");
    setWinner(null);
    setCardA(null);
    setCardB(null);

    try {
      const res = await fetch("/api/overlay/card-battle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overlayToken: token,
          donationIdA,
          donationIdB,
        }),
      });

      if (!res.ok) {
        setState("idle");
        return;
      }

      const data = await res.json();
      const cardAData = data.cardA as Card;
      const cardBData = data.cardB as Card;
      const winnerData = data.winner as "A" | "B" | "draw";

      setCardA(cardAData);
      setCardB(cardBData);

      // Animation sequence
      await playBattleAnimation(winnerData);
      setWinner(winnerData);
      setState("victory");

      // Auto-reset after 5s
      setTimeout(() => {
        setState("idle");
        setCardA(null);
        setCardB(null);
        setWinner(null);
      }, 5000);
    } catch {
      setState("idle");
    }
  };

  const playBattleAnimation = (finalWinner: "A" | "B" | "draw"): Promise<void> => {
    return new Promise((resolve) => {
      const phases: BattleState[] = ["charging", "clash", "resolving"];
      let phaseIndex = 0;

      const nextPhase = () => {
        if (phaseIndex >= phases.length) {
          setTimeout(() => resolve(), 1500);
          return;
        }
        setState(phases[phaseIndex]);
        phaseIndex++;
        animationRef.current = window.setTimeout(nextPhase, 800);
      };

      nextPhase();
    });
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) window.clearTimeout(animationRef.current);
    };
  }, []);

  const cardAColor = cardA ? RARITY_COLORS[cardA.rarity] : RARITY_COLORS.common;
  const cardBColor = cardB ? RARITY_COLORS[cardB.rarity] : RARITY_COLORS.common;

  if (pool.length < 2) {
    return (
      <div className={styles.overlay} style={{ background: "transparent" }}>
        <div className={styles.battleEmpty}>
          <p>Need at least 2 cards in pool for battle.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} style={{ background: "transparent" }}>
      <div
        className={styles.battleContainer}
        style={{
          "--color-a": cardAColor,
          "--color-b": cardBColor,
        } as React.CSSProperties}
      >
        <div className={styles.battleArena}>
          <div
            className={`${styles.battleCard} ${styles.cardA}`}
            style={{
              borderColor: cardAColor,
              boxShadow: `0 0 30px ${cardAColor}80`,
            } as React.CSSProperties}
            data-state={state}
          >
            {cardA ? (
              <>
                <img src={cardA.image_url} alt={cardA.name} className={styles.cardImage} />
                <div className={styles.cardInfo}>
                  <h3 className={styles.cardName}>{cardA.name}</h3>
                  <span className={styles.cardRarity} style={{ background: cardAColor }}>{cardA.rarity.toUpperCase()}</span>
                </div>
                <div className={styles.cardStats}>
                  {STAT_KEYS.map((key) => (
                    <div key={key} className={styles.statRow}>
                      <span className={styles.statLabel}>{key.toUpperCase()}</span>
                      <span className={styles.statValue}>{String(cardA.stats[key] ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.cardBack}><Sword size={48} /></div>
            )}
            {state === "victory" && winner === "A" && <div className={styles.victoryBadge}>VICTORY</div>}
            {state === "victory" && winner === "draw" && <div className={styles.drawBadge}>DRAW</div>}
          </div>

          <div className={styles.vs}>
            <Zap size={32} />
            <span>VS</span>
            <Zap size={32} style={{ transform: "rotate(180deg)" }} />
          </div>

          <div
            className={`${styles.battleCard} ${styles.cardB}`}
            style={{
              borderColor: cardBColor,
              boxShadow: `0 0 30px ${cardBColor}80`,
            } as React.CSSProperties}
            data-state={state}
          >
            {cardB ? (
              <>
                <img src={cardB.image_url} alt={cardB.name} className={styles.cardImage} />
                <div className={styles.cardInfo}>
                  <h3 className={styles.cardName}>{cardB.name}</h3>
                  <span className={styles.cardRarity} style={{ background: cardBColor }}>{cardB.rarity.toUpperCase()}</span>
                </div>
                <div className={styles.cardStats}>
                  {STAT_KEYS.map((key) => (
                    <div key={key} className={styles.statRow}>
                      <span className={styles.statLabel}>{key.toUpperCase()}</span>
                      <span className={styles.statValue}>{String(cardB.stats[key] ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.cardBack}><Shield size={48} /></div>
            )}
            {state === "victory" && winner === "B" && <div className={styles.victoryBadge}>VICTORY</div>}
            {state === "victory" && winner === "draw" && <div className={styles.drawBadge}>DRAW</div>}
          </div>
        </div>

        <div className={styles.battleLog} ref={battleLogRef}>
          {state === "charging" && <p>Charging up...</p>}
          {state === "clash" && <p className={styles.clashText}>CLASH!</p>}
          {state === "resolving" && <p>Calculating winner...</p>}
          {state === "victory" && (
            <p className={styles.winnerText}>
              {winner === "draw" ? "IT'S A DRAW!" : `${winner === "A" ? cardA?.name : cardB?.name} WINS!`}
            </p>
          )}
        </div>

        <button
          className={styles.battleBtn}
          onClick={() => triggerBattle()}
          disabled={state !== "idle" || pool.length < 2}
        >
          {state === "idle" ? "Start Battle" : state === "victory" ? "Next Battle" : "Battling..."}
        </button>
      </div>
    </div>
  );
}