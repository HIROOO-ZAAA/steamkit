"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type GoalData = {
  title: string;
  target_amount: number;
  current_amount: number;
  bar_color: string;
  widget?: {
    stylePreset?: string;
    progressDisplay?: string;
    fontChoice?: string;
    textSize?: number;
    strokeColor?: string;
    strokeWidth?: number;
    shineFx?: boolean;
    palette?: Record<string, string>;
  };
};

export default function GoalWidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [supabase] = useState(() => createClient());
  const [goal, setGoal] = useState<GoalData | null>(null);
  const [error, setError] = useState(false);
  // Derived rather than stored: setting state synchronously inside the effect
  // causes an extra render pass on every mount.
  const missingToken = !token;

  useEffect(() => {
    if (missingToken) return;
    let disposed = false;

    async function load() {
      const { data, error: rpcError } = await supabase.rpc(
        "streamkit_get_goal_widget",
        { p_token: token },
      );
      if (disposed) return;
      if (rpcError) {
        setError(true);
        return;
      }
      setGoal((data as GoalData[] | null)?.[0] ?? null);
    }

    void load();
    const t = window.setInterval(load, 5000);
    return () => {
      disposed = true;
      window.clearInterval(t);
    };
  }, [supabase, token, missingToken]);

  if (missingToken || error) {
    return (
      <div style={{ padding: 20, color: "#f59e0b", fontFamily: "sans-serif", fontSize: 14 }}>
        Invalid or missing token. Use /overlay/goals?token=YOUR_TOKEN
      </div>
    );
  }

  if (!goal) return null;

  const target = Math.max(Number(goal.target_amount) || 0, 0.01);
  const current = Number(goal.current_amount) || 0;
  const pct = Math.min(100, Math.round((current / target) * 100));

  const w = goal.widget ?? {};
  const palette = w.palette ?? {};
  const cardBg = palette.card || "rgba(10, 15, 26, 0.88)";
  const barColor = palette.bar || goal.bar_color;
  const textColor = palette.text || "#fff";
  const numberColor = palette.numbers || barColor;
  const fontFamily = w.fontChoice ? `'${w.fontChoice}', sans-serif` : "'Inter', sans-serif";
  const textSize = w.textSize ?? 13;
  const stroke = w.strokeWidth ? `${w.strokeWidth}px ${w.strokeColor || "#000"}` : undefined;
  const preset = w.stylePreset ?? "Bubble (Card)";
  const display = w.progressDisplay ?? "$25.00 / $100.00";

  const presetStyle: React.CSSProperties =
    preset === "Premium (Glow)"
      ? { borderRadius: 18, border: "1px solid #10B981", boxShadow: `0 0 32px ${barColor}55` }
      : preset === "Cyberpunk (Matrix)"
        ? { borderRadius: 4, border: `1px solid ${barColor}` }
        : preset === "Glass (Frosted)"
          ? { borderRadius: 16, background: "rgba(248,250,252,0.08)", backdropFilter: "blur(10px)", border: "1px solid rgba(248,250,252,0.2)" }
          : preset === "Easy (Minimal)"
            ? { borderRadius: 0, background: "transparent", border: "none", boxShadow: "none", padding: 0 }
            : preset === "SteamKit (Tech)"
              ? { borderRadius: 10, border: "1px solid #1E3350", borderLeft: `3px solid ${barColor}` }
              : preset === "Valor (Sharp)"
                ? { borderRadius: 0, border: "2px solid rgba(248,250,252,0.25)", boxShadow: `6px 6px 0 ${barColor}59` }
                : { borderRadius: 16 };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        padding: 24,
        background: "transparent",
        fontFamily,
      }}
    >
      <div
        style={{
          width: 480,
          background: cardBg,
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "16px 18px",
          color: textColor,
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          ...presetStyle,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 10,
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily,
              fontWeight: 700,
              fontSize: (w.textSize ?? 18) + 2,
              letterSpacing: 1,
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              WebkitTextStroke: stroke,
            }}
          >
            {goal.title}
          </span>
          <span style={{ fontWeight: 800, fontSize: 16, color: numberColor, flexShrink: 0 }}>
            {pct}%
          </span>
        </div>

        <div
          style={{
            height: 14,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: barColor,
              borderRadius: 999,
              transition: "width 0.8s ease",
              boxShadow: `0 0 14px ${barColor}`,
            }}
          />
        </div>

        {display !== "Hide Progress" && (
          <div style={{ marginTop: 8, fontSize: textSize, color: "rgba(255,255,255,0.75)", display: "flex", justifyContent: "space-between" }}>
            {display === "$25.00 / $100.00" && (
              <>
                <strong style={{ color: numberColor }}>${current.toFixed(2)}</strong>
                <strong style={{ color: textColor }}>/ ${target.toFixed(2)}</strong>
              </>
            )}
            {display === "25% of $100.00" && (
              <>
                <strong style={{ color: numberColor }}>{pct}%</strong>
                <strong style={{ color: textColor }}>of ${target.toFixed(2)}</strong>
              </>
            )}
            {display === "25%" && <strong style={{ color: numberColor }}>{pct}%</strong>}
            {display === "$25.00 Saved" && <strong style={{ color: numberColor }}>${current.toFixed(2)} Saved</strong>}
          </div>
        )}
      </div>
    </div>
  );
}