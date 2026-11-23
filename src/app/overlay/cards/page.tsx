"use client";

import { useEffect, useRef, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shuffle, Sparkles, Star } from "lucide-react";
import styles from "../[token]/overlay.module.css";

const RARITY_COLORS: Record<string, string> = {
  common: "#64748B",
  uncommon: "#22C55E",
  rare: "#3B82F6",
  epic: "#A855F7",
  legendary: "#F59E0B",
};

const RARITY_WEIGHTS: Record<string, number> = {
  common: 50,
  uncommon: 25,
  rare: 15,
  epic: 7,
  legendary: 3,
};

type Card = {
  id: string;
  name: string;
  rarity: string;
  image_url: string;
  stats: Record<string, unknown>;
};

type AnimationFrame = {
  scale: number;
  opacity: number;
  rotate: number;
};

type AnimatedCardModel = Card & {
  _anim: AnimationFrame;
  _isNew?: boolean;
};

export default function CardPullOverlay({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [card, setCard] = useState<AnimatedCardModel | Card | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [pool, setPool] = useState<Card[]>([]);
  const animationRef = useRef<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

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
        // Pool loading failed silently — overlay will show error if empty
      }
    }
    loadPool();
  }, [token]);

  const triggerPull = async (donationId?: string) => {
    if (isAnimating || pool.length === 0) return;

    setIsAnimating(true);
    setClaimError(null);

    try {
      const res = await fetch("/api/overlay/card-pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overlayToken: token,
          donationId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to pull card" }));
        setClaimError(err.error ?? "Could not pull card");
        setIsAnimating(false);
        return;
      }

      const data = await res.json();
      const pulledCard = data.card as Card;
      const isNew = data.isNew as boolean;

      // Animation sequence
      await playPullAnimation(pulledCard, isNew);
    } catch {
      setClaimError("Could not pull card");
    } finally {
      setIsAnimating(false);
    }
  };

  const playPullAnimation = (pulledCard: Card, isNew: boolean): Promise<void> => {
    return new Promise((resolve) => {
      const frames = [
        { scale: 0.5, opacity: 0, rotate: -180 },
        { scale: 1.1, opacity: 1, rotate: 10 },
        { scale: 0.95, opacity: 1, rotate: -5 },
        { scale: 1, opacity: 1, rotate: 0 },
      ];

      let frameIndex = 0;
      const durationPerFrame = 200;
      const holdDuration = 3000;

      const animate = () => {
        if (frameIndex >= frames.length) {
          // Hold on final frame
          setTimeout(() => resolve(), holdDuration);
          return;
        }

        const frame = frames[frameIndex];
        setCard({
          ...pulledCard,
          _anim: frame,
          _isNew: isNew,
        });

        frameIndex++;
        animationRef.current = window.setTimeout(animate, durationPerFrame);
      };

      animate();
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) window.clearTimeout(animationRef.current);
    };
  }, []);

  const animatedCard = card && "_anim" in card ? card : null;
  const rarityColor = RARITY_COLORS[card?.rarity ?? "common"];

  if (pool.length === 0) {
    return (
      <div className={styles.overlay} style={{ background: "transparent" }}>
        <div className={styles.cardPullEmpty}>
          <p>No cards in pool. Creator must add cards first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} style={{ background: "transparent" }}>
      <div
        className={styles.cardPullContainer}
        style={{
          "--rarity-color": rarityColor,
          "--rarity-glow": rarityColor,
        } as React.CSSProperties}
        onClick={() => !isAnimating && triggerPull()}
      >
        {animatedCard ? (
          <AnimatedCard
            card={animatedCard}
            rarityColor={rarityColor}
            isNew={Boolean(animatedCard._isNew)}
          />
        ) : (
          <IdleCard rarityColor={rarityColor} />
        )}

        {claimError && <p className={styles.error} role="alert">{claimError}</p>}
        <p className={styles.hint}>Click to pull a card</p>
      </div>
    </div>
  );
}

function AnimatedCard({
  card,
  rarityColor,
  isNew,
}: {
  card: Card & { _anim: { scale: number; opacity: number; rotate: number } };
  rarityColor: string;
  isNew: boolean;
}) {
  const { _anim, ...cardData } = card;
  return (
    <div
      className={styles.cardPullCard}
      style={{
        transform: `scale(${_anim.scale}) rotate(${_anim.rotate}deg)`,
        opacity: _anim.opacity,
        borderColor: rarityColor,
        boxShadow: `0 0 30px ${rarityColor}80, 0 0 60px ${rarityColor}40`,
      } as React.CSSProperties}
    >
      <img
        src={cardData.image_url}
        alt={cardData.name}
        className={styles.cardImage}
        style={{ borderColor: rarityColor } as React.CSSProperties}
      />
      <div className={styles.cardNameContainer}>
        <h2 className={styles.cardName}>{cardData.name}</h2>
        <span
          className={styles.cardRarity}
          style={{ background: rarityColor } as React.CSSProperties}
        >
          {isNew && <Sparkles className={styles.sparkle} />}
          {cardData.rarity.toUpperCase()}
        </span>
      </div>
      <div className={styles.cardStats}>
        {Object.entries(cardData.stats).map(([key, value]) => (
          <div key={key} className={styles.statRow}>
            <span className={styles.statLabel}>{key}</span>
            <span className={styles.statValue}>{String(value)}</span>
          </div>
        ))}
      </div>
      {isNew && <div className={styles.newBadge}>NEW!</div>}
    </div>
  );
}

function IdleCard({ rarityColor }: { rarityColor: string }) {
  return (
    <div
      className={styles.cardPullCard}
      style={{
        borderColor: rarityColor,
        boxShadow: `0 0 20px ${rarityColor}40`,
      } as React.CSSProperties}
    >
      <div className={styles.cardBack}>
        <Shuffle size={48} style={{ color: rarityColor }} />
      </div>
      <p className={styles.idleText}>Pull a card</p>
    </div>
  );
}
