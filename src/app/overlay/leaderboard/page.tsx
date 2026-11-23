"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getNameEffectStyle, getIconEffectStyle, getIconAnimClass, getRankIcons, getVisibleRowCount, ICON_ANIM_CSS } from "@/lib/leaderboard-effects";

type DonorRow = {
  tipper_name: string;
  total_amount: number;
  tip_count: number;
  rank: number;
};


export default function LeaderboardWidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [supabase] = useState(() => createClient());
  const [donors, setDonors] = useState<DonorRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  /**
 * Settings come from `streamkit_get_leaderboard_settings`, whose row shape is
 * dynamic and mixes strings, numbers and booleans depending on which widgets
 * the creator enabled. A per-key interface would need to track the RPC, so the
 * loose type is intentional here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [settings, setSettings] = useState<Record<string, any>>({});
  // Derived rather than stored: avoids a synchronous setState in the effect.
  const missingToken = !token;

  useEffect(() => {
    if (missingToken) return;
    let disposed = false;
    let tipsChannel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const { data, error: rpcError } = await supabase.rpc(
        "streamkit_get_leaderboard_dynamic",
        { p_token: token, p_limit: 50 },
      );
      const { data: settingsData } = await supabase.rpc(
        "streamkit_get_leaderboard_settings",
        { p_token: token },
      );
      if (disposed) return;
      if (rpcError) {
        setError(true);
        return;
      }
      setDonors((data as DonorRow[] | null) ?? []);
      if (settingsData && typeof settingsData === "object") {
        setSettings(settingsData);
      }
      setLoaded(true);
    }

    async function subscribeToTips() {
      const { data } = await supabase.rpc("streamkit_resolve_overlay", { p_token: token });
      if (disposed) return;
      const creatorId = (data as { creator_id: string }[] | null)?.[0]?.creator_id;
      if (!creatorId || disposed) return;
      const filter = `creator_id=eq.${creatorId}`;
      tipsChannel = supabase
        .channel(`streamkit-leaderboard-tips-${creatorId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "tips", filter }, () => void load())
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tips", filter }, () => void load())
        .subscribe();
    }

    void load();
    void subscribeToTips();
    const t = window.setInterval(load, 2000);
    const channel = supabase
      .channel("streamkit-leaderboard-settings")
      .on("broadcast", { event: "updated" }, () => void load())
      .subscribe();
    return () => {
      disposed = true;
      window.clearInterval(t);
      void supabase.removeChannel(channel);
      if (tipsChannel) void supabase.removeChannel(tipsChannel);
    };
  }, [supabase, token, missingToken]);

  if (missingToken || error) {
    return (
      <div style={{ padding: 20, color: "#f59e0b", fontFamily: "sans-serif", fontSize: 14 }}>
        Invalid or missing token. Use /overlay/leaderboard?token=YOUR_TOKEN
      </div>
    );
  }

  if (!loaded || donors.length === 0) return null;

  const s = settings;
  const colors: Record<string, string> = s.colors ?? {};
  const cardBg = s.showBackground === false ? "transparent" : colors.background || "rgba(10, 15, 26, 0.88)";
  const nameColor = colors.name || "#fff";
  const amountColor = colors.amount || "#10B981";
  const borderColor = s.showBorder === false ? "transparent" : colors.border || "rgba(255,255,255,0.08)";
  const titleFont = s.fontFamily ? `'${s.fontFamily}', sans-serif` : "'Orbitron', sans-serif";
  const fontSize = s.fontSize ?? 16;
  const title = s.title || "ក្ដិត";
  const maxRows = s.rows ?? 3;
  const rowGap = s.rowGap ?? 4;
  const maxName = s.maxName ?? 30;
  const showMessage = s.showMessage !== false;
  const showIcon = s.showIcon !== false;
  const enableRanks = s.enableRanks !== false;
  const rankAsBadge = s.rankAsBadge === true;
  const showStreak = s.showStreak === true;
  const nameStyle: string = s.nameStyle ?? "Simple";
  const amountStyle: string = s.amountStyle ?? "Simple";
  const highlight = s.highlightEffect ?? "None";
  const animation: string = s.entryAnimation ?? "Slide Up";
  const animClass = animation === "Drop Down" ? "lbDrop" : animation === "Fade" ? "lbFade" : animation === "Slide In" ? "lbSlide" : animation === "Slide Up" ? "lbSlideUp" : "";

  const rankIcons = getRankIcons(s.iconStyle);
  const topN = s.topN ?? "All";
  const visibleRowCount = getVisibleRowCount(topN, maxRows);
  const rankTextColor = s.rankTextColor ?? amountColor;
  const rankBgColor = s.rankBgColor ?? amountColor;
  const topHighlight = s.topHighlight === true;
  const iconSize = Number(s.iconSize) > 0 ? Number(s.iconSize) : 1.8;
  const nameEffectStyle = getNameEffectStyle(s.nameEffect, colors.amount ?? amountColor);
  const iconAnimClass = getIconAnimClass(s.iconAnimation);
  const iconEffectStyle = getIconEffectStyle(s.iconEffect);

  return (
    <>
      <style>{`
        @keyframes lbDrop { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lbFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lbSlide { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        .lbDrop { animation: lbDrop 0.4s ease both; }
        .lbFade { animation: lbFade 0.4s ease both; }
        .lbSlide { animation: lbSlide 0.4s ease both; }
        @keyframes lbSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .lbSlideUp { animation: lbSlideUp 0.4s ease both; }
        ${ICON_ANIM_CSS}
      `}</style>
      <div style={{ width: "100vw", height: "100vh", padding: 24, background: "transparent", fontFamily: titleFont, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
      <div
        style={{
          width: 360,
          background: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: 14,
          padding: "14px 16px",
          color: nameColor,
          boxShadow: highlight === "Glow" ? `0 0 24px ${amountColor}55` : "0 8px 32px rgba(0,0,0,0.45)",
        }}
      >
        {showMessage && (
        <div
          style={{
            fontFamily: titleFont,
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: amountColor,
            marginBottom: 10,
          }}
        >
          {title}
        </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: rowGap }}>
          {donors.slice(0, visibleRowCount).map((d, i) => (
            <div
              key={`${d.tipper_name}-${i}`}
              className={`${animClass} ${topHighlight && i === 0 ? "topPop" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 8,
                background: s.showBackground === false ? "transparent" : "transparent",
                border: s.showBorder === false ? "1px solid transparent" : `1px solid ${borderColor}`,
                boxShadow: highlight === "Pulse" ? `0 0 10px ${amountColor}66` : undefined,
              }}
            >
              {showIcon && enableRanks && (
                <span style={{ minWidth: 26, textAlign: "center", fontSize: i < 3 ? 17 : 13, fontWeight: 800, color: rankTextColor, flexShrink: 0, background: rankAsBadge ? rankBgColor : undefined, borderRadius: rankAsBadge ? 6 : 0, padding: rankAsBadge ? "2px 6px" : 0 }}>
                  <span className={enableRanks && i === 0 ? iconAnimClass : ""} style={{ display: "inline-block", lineHeight: 1, fontSize: i === 0 ? `${iconSize}em` : undefined, ...(enableRanks && i === 0 ? iconEffectStyle : {}) }}>
                    {topHighlight && i === 0 ? "🔥" : (i === 0 ? (rankIcons[0] ?? "#1") : `#${i + 1}`)}
                  </span>
                </span>
              )}
              <span
                className={enableRanks && i === 0 ? iconAnimClass : ""}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 700,
                  fontSize,
                  color: nameColor,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  WebkitTextStroke: s.strokeW ? `${s.strokeW}px ${s.strokeColor || "#000"}` : undefined,
                  backgroundColor: nameStyle === "Badge" || nameStyle === "Pill" ? (colors.badgeBg || "#EF4444") : undefined,
                  borderRadius: nameStyle === "Pill" ? 999 : nameStyle === "Badge" ? 6 : 0,
                  padding: nameStyle === "Simple" ? 0 : "2px 10px",
                  ...(enableRanks && i === 0 ? nameEffectStyle : {}),
                }}
              >
                {topHighlight && i === 0 && (
                  <span style={{ fontWeight: 800, fontSize, color: nameColor, flexShrink: 0, whiteSpace: "nowrap" }}>Top 1</span>
                )}
                {d.tipper_name.slice(0, maxName)}{showStreak && enableRanks && i === 0 ? " 🔥" : ""}
              </span>
              <span style={{ fontWeight: 800, fontSize, color: amountStyle === "Simple" ? amountColor : "#FFFFFF", flexShrink: 0, backgroundColor: amountStyle === "Simple" ? "transparent" : (colors.badgeBg || "#EF4444"), borderRadius: amountStyle === "Pill" ? 999 : amountStyle === "Badge" ? 8 : 0, padding: amountStyle === "Simple" ? 0 : "4px 12px" }}>
                ${Number(d.total_amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </>
  );
}