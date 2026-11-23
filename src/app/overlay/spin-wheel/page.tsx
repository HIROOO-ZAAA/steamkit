"use client";

import React, { use, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nextSpinWheelRotation } from "@/lib/overlay/spin-wheel-rotation";
import styles from "./spin-wheel.module.css";

type Slice = { label: string; color?: string };

/**
 * Placeholder only, shown until the database answers.
 *
 * Previously this was a hardcoded list the overlay both drew from *and* chose
 * the winner from, which meant the rendered wheel and the recorded result had
 * no necessary relationship. Now the server returns the slices with the draw,
 * and this is replaced before anything can spin.
 */
const PLACEHOLDER_SLICES: Slice[] = [
  { label: "Loading…" },
];

export default function SpinWheelOverlay({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = use(searchParams);
  const token = params.token ?? "";
  const [slices, setSlices] = useState<Slice[]>(PLACEHOLDER_SLICES);
  const [wheelTitle, setWheelTitle] = useState("Donation Wheel");
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());
  const spinningRef = useRef(false);

  // The wheel is rendered from whatever the server last spoke about, so the
  // slice under the pointer is always the slice the audit trail recorded.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase.rpc("streamkit_spin_wheel_config", {
        p_token: token,
      });
      if (cancelled || error) return;
      const rows = data as { slices?: unknown }[] | null;
      const config = rows?.[0] as { slices?: unknown; wheel_title?: string } | undefined;
      const parsed = Array.isArray(config?.slices)
        ? (config.slices as Slice[])
        : [];
      if (!cancelled && parsed.length > 0) setSlices(parsed);
      if (!cancelled && config?.wheel_title) setWheelTitle(config.wheel_title);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, token]);

  const triggerSpin = useCallback(
    async (tipId: string, tipperName: string) => {
      if (spinningRef.current) return;
      spinningRef.current = true;
      setSpinning(true);
      setWinner(null);

      try {
        const { data, error } = await supabase.rpc("streamkit_spin_wheel", {
          p_token: token,
          p_tip_id: tipId,
        });

        const row = (
          data as
            | {
                picked_index: number | null;
                picked_label: string | null;
                should_spin: boolean;
                slices: Slice[] | null;
              }[]
            | null
        )?.[0];

        // A sub-threshold tip or one already spun comes back as should_spin
        // false, which is a normal outcome and not an error worth showing.
        if (error || !row?.should_spin || row.picked_index === null) {
          setSpinning(false);
          spinningRef.current = false;
          return;
        }

        // Adopt the server's slice list before animating so the index maps to
        // the label on screen.
        if (Array.isArray(row.slices) && row.slices.length > 0) {
          setSlices(row.slices);
        }

        const count = row.slices?.length ?? slices.length;
        setRotation((current) => nextSpinWheelRotation(current, row.picked_index!, count));

        await new Promise<void>((resolve) => {
          window.setTimeout(() => {
            setSpinning(false);
            spinningRef.current = false;
            setWinner(`${tipperName} landed on: ${row.picked_label}!`);
            resolve();
          }, 4000);
        });
      } catch {
        setSpinning(false);
        spinningRef.current = false;
      }
    },
    [supabase, token, slices.length],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let polling = false;
    let since = new Date().toISOString();

    async function pollRecentTips() {
      if (cancelled || polling) return;
      polling = true;
      try {
        const { data, error } = await supabase.rpc("streamkit_recent_spin_tips", {
          p_token: token,
          p_since: since,
        });
        if (cancelled || error || !Array.isArray(data)) return;

        const tips = data as {
          id: string;
          tipper_name?: string;
          payment_status?: string;
          created_at: string;
        }[];
        for (const tip of tips) {
          if (tip.created_at > since) since = tip.created_at;
          if (tip.payment_status !== "successful" && tip.payment_status !== "test") continue;
          await triggerSpin(tip.id, tip.tipper_name ?? "Someone");
          if (cancelled) return;
        }
      } finally {
        polling = false;
      }
    }

    void pollRecentTips();
    const interval = window.setInterval(() => void pollRecentTips(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [supabase, token, triggerSpin]);

  const wheelBackground = `conic-gradient(${slices.map((slice, index) => {
    const start = (index / slices.length) * 360;
    const end = ((index + 1) / slices.length) * 360;
    const fallback = ["#10b981", "#0891b2", "#f59e0b", "#7c3aed"];
    return `${slice.color ?? fallback[index % fallback.length]} ${start}deg ${end}deg`;
  }).join(", ")})`;

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{wheelTitle}</h1>
      <div className={styles.pointer} />
      <div
        className={styles.wheel}
        style={{ transform: `rotate(${rotation}deg)`, background: wheelBackground }}
        aria-hidden="true"
      >
        {slices.map((slice, i) => (
          <span
            key={slice.label}
            className={styles.slice}
            style={{ transform: `rotate(${i * (360 / slices.length)}deg)` }}
          >
            {slice.label}
          </span>
        ))}
        <span className={styles.hub} />
      </div>

      {/* Screen-reader announcement so the spin result is not visual-only, and
          a live region so a late-loading overlay still reads the winner. */}
      <div role="status" aria-live="polite" className={styles.announcer}>
        {spinning ? "Spinning…" : (winner ?? "")}
      </div>

      {winner && <div className={styles.winner}>{winner}</div>}
    </div>
  );
}
