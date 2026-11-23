"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { selectWidgetSettings } from "@/lib/overlay/widget-settings";

type WidgetSettings = {
  title?: string;
  dataSource?: string;
  rows?: number;
  rowGap?: number;
  maxName?: number;
  colors?: {
    background?: string;
    message?: string;
    badgeBg?: string;
    name?: string;
    amount?: string;
    border?: string;
  };
  showBackground?: boolean;
  showIcon?: boolean;
  showMessage?: boolean;
  showBorder?: boolean;
  fontFamily?: string;
  fontSize?: number;
  strokeW?: number;
  strokeColor?: string;
  entryAnimation?: string;
  highlightEffect?: string;
  amountStyle?: string;
  nameStyle?: string;
  enableRanks?: boolean;
  rankAsBadge?: boolean;
  showStreak?: boolean;
};

type LeaderboardEntry = {
  id: string;
  tipper_name: string;
  total_amount: number;
  currency?: string;
  created_at?: string;
};

export default function WidgetOverlayPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; widget?: string }>;
}) {
  const { token, widget } = use(searchParams);
  const [supabase] = useState(() => createClient());
  const [settings, setSettings] = useState<WidgetSettings>({});
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [widgetMissing, setWidgetMissing] = useState(false);
  // Derived rather than stored: avoids a synchronous setState in the effect.
  const missingToken = !token;

  useEffect(() => {
    if (missingToken) return;
    let disposed = false;

    async function loadSettings() {
      const { data, error: rpcError } = await supabase.rpc(
        "streamkit_get_widget_overlay_settings",
        { p_token: token },
      );
      if (disposed) return;
      if (rpcError) {
        setError(true);
        return;
      }
      const selected = selectWidgetSettings(
        data && typeof data === "object" && !Array.isArray(data)
          ? data as Record<string, unknown>
          : {},
        widget,
      );
      if (!selected) {
        setWidgetMissing(true);
        setLoaded(true);
        return;
      }
      setWidgetMissing(false);
      setSettings(selected as WidgetSettings);
      setLoaded(true);
    }

    async function loadLeaderboard() {
      const { data, error: rpcError } = await supabase.rpc(
        "streamkit_get_widget_leaderboard",
        { p_token: token },
      );
      if (disposed) return;
      if (!rpcError && data) {
        setEntries(data as LeaderboardEntry[]);
      }
    }

    async function load() {
      await loadSettings();
      await loadLeaderboard();
    }

    void load();
    const t = window.setInterval(load, 2000);
    const channel = supabase
      .channel("streamkit-widget-settings")
      .on("broadcast", { event: "updated" }, () => void load())
      .subscribe();
    return () => {
      disposed = true;
      window.clearInterval(t);
      void supabase.removeChannel(channel);
    };
  }, [supabase, token, widget, missingToken]);

  useEffect(() => {
    if (!token) return;
    const id = "lb-fonts-link";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      const fonts = [
        "Press Start 2P", "Orbitron", "Audiowide", "Black Ops One", "Bungee",
        "Quantico", "VT323", "Wallpoet", "Exo 2", "Bebas Neue", "Anton",
        "Bangers", "Carter One", "Fredoka", "Fugaz One", "Lilita One",
        "Passion One", "Paytone One", "Righteous", "Russo One", "Squada One",
        "Teko", "Titan One", "Ultra", "Battambang", "Moul", "Koulen",
        "Hanuman", "Siemreap", "Nokora", "Taprom", "Inter", "Rajdhani",
        "Poppins", "Roboto", "Montserrat", "Lato", "Nunito", "Open Sans",
        "Oswald", "Rubik", "Ubuntu", "Merriweather", "Playfair Display",
        "Lobster", "Pacifico"
      ];
      link.href = `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${encodeURIComponent(f)}:wght@400;700`).join("&")}&display=swap`;
      document.head.appendChild(link);
    }
  }, [token]);

  if (missingToken || error) {
    return (
      <div style={{ padding: 20, color: "#f59e0b", fontFamily: "sans-serif", fontSize: 14 }}>
        Invalid or missing token. Use /overlay/widget?token=YOUR_TOKEN
      </div>
    );
  }

  if (widgetMissing) {
    return (
      <div style={{ padding: 20, color: "#f59e0b", fontFamily: "sans-serif", fontSize: 14 }}>
        This widget no longer exists. Copy its current URL from Widget Overlays.
      </div>
    );
  }

  if (!loaded) return null;

  const {
    title = "ក្ដិត",
    rows = 3,
    rowGap = 4,
    maxName = 30,
    colors: rawColors,
    showBackground = true,
    showIcon = true,
    showMessage = true,
    showBorder = true,
    fontFamily = "Orbitron",
    fontSize = 16,
    strokeW = 0,
    strokeColor = "#000000",
    entryAnimation = "Slide Up",
    highlightEffect = "None",
    amountStyle = "Simple",
    nameStyle = "Simple",
    enableRanks = true,
    rankAsBadge = false,
    showStreak = false,
  } = settings;

  const colors = {
    background: "#0F172A",
    message: "#F8FAFC",
    badgeBg: "#10B981",
    name: "#F8FAFC",
    amount: "#10B981",
    border: "#1E3350",
    ...rawColors,
  };
  const visibleEntries = entries.slice(0, rows);

  const getAnimationClass = () => {
    switch (entryAnimation) {
      case "Drop Down": return "anim-drop";
      case "Fade": return "anim-fade";
      case "Slide In": return "anim-slide";
      case "Slide Up": return "anim-slide-up";
      default: return "";
    }
  };

  const getRowStyle = (_index: number) => {
    const baseStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      padding: "12px 16px",
      fontFamily: `'${fontFamily}', sans-serif`,
      fontSize: `${fontSize}px`,
      color: colors.name,
      background: showBackground ? colors.background : "transparent",
      border: showBorder ? `1px solid ${colors.border}` : "none",
      borderRadius: 10,
      marginBottom: `${rowGap}px`,
      opacity: 1,
      transform: "translateY(0)",
      minWidth: "100%",
      boxSizing: "border-box",
      width: "100%",
      maxWidth: 420,
    };

    if (highlightEffect === "Glow") {
      baseStyle.boxShadow = `0 0 14px ${colors.amount}66`;
    }
    if (highlightEffect === "Pulse") {
      baseStyle.animation = "pulse-glow 1.6s ease-in-out infinite";
    }

    return baseStyle;
  };

  const getRankDisplay = (index: number) => {
    if (!enableRanks) return null;

    if (rankAsBadge) {
      return (
        <span style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: colors.badgeBg,
          color: "#0F172A",
          borderRadius: 999,
          padding: "2px 8px",
          fontSize: `${fontSize * 0.7}px`,
          fontWeight: 700,
          minWidth: 40,
          boxSizing: "border-box",
        }}>
          #{index + 1}
        </span>
      );
    }

    return (
      <span style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        fontWeight: 700,
        color: colors.amount,
        fontSize: `${fontSize * 0.8}px`,
      }}>
        #{index + 1}
      </span>
    );
  };

  const getNameStyle = () => {
    if (nameStyle === "Simple") return { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
    return {
      background: colors.badgeBg,
      borderRadius: nameStyle === "Pill" ? 999 : 6,
      padding: "4px 12px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    };
  };

  const getAmountStyle = () => {
    if (amountStyle === "Simple") return { fontWeight: 700, color: colors.amount, whiteSpace: "nowrap" };
    return {
      fontWeight: 700,
      color: colors.amount,
      background: colors.badgeBg,
      borderRadius: amountStyle === "Pill" ? 999 : 6,
      padding: "4px 12px",
      whiteSpace: "nowrap",
    };
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "transparent",
        fontFamily: `'${fontFamily}', sans-serif`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {showMessage && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            color: colors.message,
            fontWeight: 700,
            fontSize: `${fontSize}px`,
            fontFamily: `'${fontFamily}', sans-serif`,
          }}
        >
          {showIcon && (
            <svg width={fontSize * 0.8} height={fontSize * 0.8} viewBox="0 0 24 24" fill="none" stroke={colors.amount} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
          {title}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: rowGap,
          width: "100%",
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        {visibleEntries.map((entry, i) => (
          <div
            key={entry.id}
            className={getAnimationClass()}
            style={getRowStyle(i)}
          >
            {getRankDisplay(i)}
            <span style={{
              ...getNameStyle(),
              flex: "1 1 auto",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {entry.tipper_name.slice(0, maxName)}
              {showStreak && enableRanks ? " 🔥" : ""}
            </span>
            <strong style={{
              ...getAmountStyle(),
              flexShrink: 0,
              marginLeft: "auto",
              textAlign: "right",
              WebkitTextStroke: strokeW ? `${strokeW}px ${strokeColor}` : undefined,
            }}>
              {entry.currency === "KHR"
                ? `៛${Number(entry.total_amount).toLocaleString()}`
                : `$${Number(entry.total_amount).toFixed(2)}`}
            </strong>
          </div>
        ))}
        {visibleEntries.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 20px",
              color: colors.name,
              fontFamily: `'${fontFamily}', sans-serif`,
              fontSize: `${fontSize}px`,
background: showBackground ? colors.background : "transparent",
 border: showBorder ? `1px solid ${colors.border}` : "none",
              borderRadius: 10,
              width: "100%",
              maxWidth: 420,
              margin: "0 auto",
              boxSizing: "border-box",
            }}
          >
            No donations yet
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes anim-drop {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes anim-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes anim-slide {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .anim-drop { animation: anim-drop 0.4s ease-out forwards; }
        .anim-fade { animation: anim-fade 0.3s ease-out forwards; }
        .anim-slide { animation: anim-slide 0.4s ease-out forwards; }
        @keyframes anim-slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .anim-slide-up { animation: anim-slide-up 0.4s ease-out forwards; }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 6px ${colors.amount}44; }
          50% { box-shadow: 0 0 18px ${colors.amount}AA; }
        }
      `}</style>
    </div>
  );
}
