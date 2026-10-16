"use client";

import React, { use, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const supabase = createClient();
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
      const parsed = Array.isArray(rows?.[0]?.slices)
        ? (rows[0].slices as Slice[])
        : [];
      if (!cancelled && parsed.length > 0) setSlices(parsed);
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

      // Adopt the server's slice list before animating so the index maps to the
      // label on screen.
      if (Array.isArray(row.slices) && row.slices.length > 0) {
        setSlices(row.slices);
      }

      const count = row.slices?.length ?? slices.length;
      const sliceDegrees = 360 / Math.max(count, 1);
      const targetDeg = 360 * 5 + (360 - row.picked_index * sliceDegrees);
      setRotation(targetDeg);

      setTimeout(() => {
        setSpinning(false);
        spinningRef.current = false;
        setWinner(`${tipperName} landed on: ${row.picked_label}!`);
      }, 4000);
    },
    [supabase, token, slices.length],
  );

  useEffect(() => {
    const channel = supabase
      .channel("spin_wheel_events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tips" },
        (payload) => {
          const newTip = payload.new as {
            id: string;
            tipper_name?: string;
          };
          void triggerSpin(newTip.id, newTip.tipper_name ?? "Someone");
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, triggerSpin]);

  return (
    <div className={styles.screen}>
      <div className={styles.pointer} />
      <div
        className={styles.wheel}
        style={{ transform: `rotate(${rotation}deg)` }}
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
