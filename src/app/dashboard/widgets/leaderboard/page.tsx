"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, Medal, Trophy, RotateCcw, Play, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLeaderboardSettings } from "@/lib/dashboard/leaderboard-settings-adapter";
import { getNameEffectStyle, getIconEffectStyle, getIconAnimClass, getRankIcons, getVisibleRowCount, ICON_ANIM_CSS } from "@/lib/leaderboard-effects";
import { getLeaderboardHistoryState } from "@/lib/leaderboard-history-state";
import PageHeader from "@/components/ui/PageHeader";
import styles from "./leaderboard.module.css";

const LB_FONTS = ['Press Start 2P','Orbitron','Audiowide','Black Ops One','Bungee','Quantico','VT323','Wallpoet','Exo 2','Bebas Neue','Anton','Bangers','Carter One','Fredoka','Fugaz One','Lilita One','Passion One','Paytone One','Righteous','Russo One','Squada One','Teko','Titan One','Ultra','Battambang','Moul','Koulen','Hanuman','Siemreap','Nokora','Taprom','Inter','Rajdhani','Poppins','Roboto','Montserrat','Lato','Nunito','Open Sans','Oswald','Rubik','Ubuntu','Merriweather','Playfair Display','Lobster','Pacifico'];

const widgetTypeLabel = (source: string) =>
  source === "Most Recent (History)" ? "RECENT"
  : source.includes("Weekly") || source.includes("Week") ? "WEEK"
  : source.includes("Monthly") || source.includes("Month") ? "MONTH"
  : source.includes("Session") ? "SESSION"
  : "ALL-TIME";

const sampleRows = [
  { name: "WhaleDonor", amount: "$9.00" },
  { name: "Srey Neth", amount: "$9.00" },
  { name: "NightOwl", amount: "$33.00" },
];

type LeaderboardEntry = {
  tipper_name: string;
  amount: number;
  currency: string;
  tip_count: number;
  last_tip_at: string;
};

export default function LeaderboardPage() {
  const [tips, setTips] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [widgetUrl, setWidgetUrl] = useState("");

  const [supabase] = useState(() => createClient());

  const [widgetTitle, setWidgetTitle] = useState("ក្ដិត");
  const [dataSource, setDataSource] = useState("Top (All Time)");
  const [rows, setRows] = useState(3);
  const [rowGap, setRowGap] = useState(4);
  const [maxName, setMaxName] = useState(30);
  const [colors, setColors] = useState({
    background: "#0F172A", message: "#F8FAFC", badgeBg: "#10B981",
    name: "#F8FAFC", amount: "#10B981", border: "#1E3350",
  });
  const [showBackground, setShowBackground] = useState(true);
  const [showIcon, setShowIcon] = useState(true);
  const [showMessage, setShowMessage] = useState(true);
  const [showBorder, setShowBorder] = useState(true);
  const [fontFamily, setFontFamily] = useState("Orbitron");
  const [fontSize, setFontSize] = useState(20);
  const [strokeW, setStrokeW] = useState(0);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [entryAnimation, setEntryAnimation] = useState("Drop Down");
  const [highlightEffect, setHighlightEffect] = useState("None");
  const [amountStyle, setAmountStyle] = useState("Simple");
  const [nameStyle, setNameStyle] = useState("Simple");
  const [enableRanks, setEnableRanks] = useState(true);
  const [rankAsBadge, setRankAsBadge] = useState(false);
  const [showStreak, setShowStreak] = useState(false);
  const [topN, setTopN] = useState("All");
  const [iconStyle, setIconStyle] = useState("🥇 Medals");
  const [rankTextColor, setRankTextColor] = useState("#F8FAFC");
  const [rankBgColor, setRankBgColor] = useState("#10B981");
  const [topHighlight, setTopHighlight] = useState(false);
  const [nameEffect, setNameEffect] = useState("💎 Diamond");
  const [iconEffect, setIconEffect] = useState("❌ None");
  const [iconAnimation, setIconAnimation] = useState("❌ None");
  const [iconSize, setIconSize] = useState(1.8);
  const [animKey, setAnimKey] = useState(0);
  const [view, setView] = useState<"list" | "create">("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [widgets, setWidgets] = useState<Array<{
    id: number;
    title: string;
    rows: number;
    animation: string;
    type: string;
    colors: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings: Record<string, any>;
  }>>([]);  // populated from DB on mount
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modal, setModal] = useState<{ type: "clear" | "test" | "delete"; goal: { id: number } } | null>(null);
  const showToast = (message: string, isError = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastError(isError);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  };

  useEffect(() => {
    const id = "lb-fonts-link";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?${LB_FONTS.map((f) => `family=${encodeURIComponent(f)}:wght@400;700`).join("&")}&display=swap`;
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    async function fetchToken() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Ensure row exists
      await supabase
        .from("streamkit_overlay_credentials")
        .upsert({ creator_id: user.id }, { onConflict: "creator_id" });
      const { data } = await supabase
        .from("streamkit_overlay_credentials")
        .select("token, leaderboard_widget, widget_settings")
        .eq("creator_id", user.id)
        .single();
      if (data?.token) {
        const base =
          typeof window !== "undefined"
            ? window.location.origin
            : "http://localhost:3000";
        setWidgetUrl(`${base}/overlay/leaderboard?token=${data.token}`);
      }
      const s = getLeaderboardSettings(data ?? {});
      if (s && s.title) {
        setWidgets([{
          id: 1,
          title: s.title || "Widget",
          rows: s.rows ?? 3,
          animation: (s.entryAnimation ?? "Drop Down").toLowerCase().replace(/\s/g, ""),
          type: widgetTypeLabel(s.dataSource ?? ""),
          colors: [
            s.colors?.background ?? "#0F172A",
            s.colors?.border ?? "#1E3350",
            s.colors?.amount ?? "#10B981",
            s.colors?.name ?? "#F8FAFC",
            s.colors?.message ?? "#F8FAFC",
            s.colors?.badgeBg ?? "#10B981",
          ],
          settings: s,
        }]);
      } else {
        setWidgets([]);
      }
    }
    void fetchToken();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      setLoading(true);
      setLoadError(false);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoadError(true);
          return;
        }

        const { data, error } = await supabase.rpc("streamkit_donor_leaderboard", {
          p_since: null,
        });

        if (!cancelled) {
          setLoadError(Boolean(error));
          setTips(data ? (data as LeaderboardEntry[]).slice(0, 20) : []);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLeaderboard();
    return () => { cancelled = true; };
  }, [supabase, refreshKey]);

  async function copyWidgetUrl() {
    if (!widgetUrl) {
      showToast("Widget URL is not ready. Reload this page and try again.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(widgetUrl);
      showToast("Widget URL copied for OBS.");
    } catch {
      showToast("Could not copy the widget URL. Check browser clipboard permissions.", true);
    }
  }

  const historyState = getLeaderboardHistoryState({
    loading,
    failed: loadError,
    entryCount: tips.length,
  });

  if (historyState === "loading") {
    return (
      <div className={styles.container}>
        <div className="skeleton" style={{ height: "300px", width: "100%" }} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageHeader
        eyebrow="Steam Kit // Streaming Widgets"
        title="Leaderboard Widgets"
        description="Manage your stream widgets and overlay parameters."
        actions={view === "list" ? (
          <button
            type="button"
            className={styles.headerAction}
            onClick={() => { setEditingId(null); setView("create"); }}
          >
            + Create widget
          </button>
        ) : undefined}
      />

      <p className={styles.builderNote}>
        This builder uses the legacy leaderboard URL. For the current widget system, open{" "}
        <Link href="/dashboard/widget-overlays">Widget Overlays</Link>.
      </p>

      {view === "list" ? (
        <div className={styles.widgetTable}>
          <div className={styles.widgetHead}>
            <span>TITLE</span>
            <span>CONFIG</span>
            <span>TYPE</span>
            <span>COLORS</span>
            <span className={styles.headActions}>ACTIONS</span>
          </div>
          {widgets.map((w) => (
            <div key={w.id} className={styles.widgetRow}>
              <span className={styles.widgetTitleCell}>
                <strong>{w.title}</strong>
                <small>ID: {w.id}</small>
              </span>
              <span className={styles.configCell}>
                <span className={styles.configChip}>{w.rows} Rows</span>
                <span className={styles.configChip}>{w.animation}</span>
              </span>
              <span><span className={styles.typeBadge}>{w.type}</span></span>
              <span className={styles.colorCell}>
                {w.colors.map((c, i) => (
                  <span key={i} className={styles.colorSwatch} style={{ background: c }} />
                ))}
              </span>
              <span className={styles.actionsCell}>
                <button type="button" className={styles.actClear} onClick={() => setModal({ type: "clear", goal: w })}><RotateCcw size={14} /> Clear</button>
                <button type="button" className={styles.actUnlock} title="Copy widget URL" onClick={() => { void copyWidgetUrl(); }}><Copy size={15} /></button>
                <button type="button" className={`${styles.actIcon} ${styles.actTest}`} title="Send test donation" onClick={() => setModal({ type: "test", goal: w })}><Play size={15} /></button>
                <button type="button" className={styles.actIcon} title="Edit" onClick={() => {
                  const s = w.settings ?? null;
                  if (s) {
                    if (s.title !== undefined) setWidgetTitle(s.title);
                    if (s.dataSource) setDataSource(s.dataSource === "Most Recent (History)" ? "Top (All Time)" : s.dataSource);
                    if (s.rows) setRows(s.rows);
                    if (s.rowGap !== undefined) setRowGap(s.rowGap);
                    if (s.maxName) setMaxName(s.maxName);
                    if (s.colors) setColors((c) => ({ ...c, ...s.colors }));
                    if (s.fontFamily) setFontFamily(s.fontFamily);
                    if (s.fontSize) setFontSize(s.fontSize);
                    if (s.strokeW !== undefined) setStrokeW(s.strokeW);
                    if (s.strokeColor) setStrokeColor(s.strokeColor);
                    if (s.entryAnimation) setEntryAnimation(s.entryAnimation);
                    if (s.highlightEffect) setHighlightEffect(s.highlightEffect);
                    if (s.amountStyle) setAmountStyle(s.amountStyle);
                    if (s.nameStyle) setNameStyle(s.nameStyle);
                    if (s.showBackground !== undefined) setShowBackground(s.showBackground);
                    if (s.showIcon !== undefined) setShowIcon(s.showIcon);
                    if (s.showMessage !== undefined) setShowMessage(s.showMessage);
                    if (s.showBorder !== undefined) setShowBorder(s.showBorder);
                    if (s.enableRanks !== undefined) setEnableRanks(s.enableRanks);
                    if (s.rankAsBadge !== undefined) setRankAsBadge(s.rankAsBadge);
                    if (s.showStreak !== undefined) setShowStreak(s.showStreak);
                    if (s.topN) setTopN(s.topN);
                    if (s.iconStyle) setIconStyle(s.iconStyle);
                    if (s.rankTextColor) setRankTextColor(s.rankTextColor);
                    if (s.rankBgColor) setRankBgColor(s.rankBgColor);
                    if (s.topHighlight !== undefined) setTopHighlight(s.topHighlight);
                    if (s.nameEffect) setNameEffect(s.nameEffect);
                    if (s.iconEffect) setIconEffect(s.iconEffect);
                    if (s.iconAnimation) setIconAnimation(s.iconAnimation);
                    if (s.iconSize !== undefined) setIconSize(Number(s.iconSize));
                  } else {
                    setWidgetTitle(w.title);
                    setRows(w.rows);
                  }
                  setEditingId(w.id);
                  setView("create");
                }}><Pencil size={15} /></button>
                <button type="button" className={`${styles.actIcon} ${styles.actDanger}`} title="Delete" onClick={() => setModal({ type: "delete", goal: w })}><Trash2 size={15} /></button>
              </span>
            </div>
          ))}
          {widgets.length === 0 && <p className={styles.emptyText}>No widgets yet. Create one to get started.</p>}
        </div>
      ) : (
      <div>
        <button type="button" className={styles.backBtn} onClick={() => setView("list")}>
          <ArrowLeft size={16} /> Back
        </button>
      <div className={styles.createGrid}>
        <div className={styles.createLeft}>
          <div className={`${styles.card} card`} style={{ marginBottom: 20 }}>
            <h3 className={styles.cardLabel}>CONFIGURE WIDGET</h3>
            <p className={styles.subtitle}>Setup · Overlay parameters</p>

            <h4 className={styles.sectionLabel}>Basics</h4>
            <div className="input-group">
              <label className="input-label">Widget Title</label>
              <input className="input" value={widgetTitle} onChange={(e) => setWidgetTitle(e.target.value)} />
            </div>
            <div className="input-group" style={{ marginTop: 12 }}>
              <label className="input-label">Data Source</label>
              <select className="input" value={dataSource} onChange={(e) => setDataSource(e.target.value)}>
                <optgroup label="Single Largest Donation">
                  <option>Top (All Time)</option>
                  <option>Top (Session)</option>
                  <option>Top (Weekly)</option>
                  <option>Top (Monthly)</option>
                </optgroup>
              </select>
            </div>
            <div className={styles.cfgRow3}>
              <div className="input-group">
                <label className="input-label">Rows</label>
                <input className="input" type="number" value={rows} onChange={(e) => setRows(Number(e.target.value))} />
              </div>
              <div className="input-group">
                <label className="input-label">Row Gap</label>
                <input className="input" type="number" value={rowGap} onChange={(e) => setRowGap(Number(e.target.value))} />
              </div>
              <div className="input-group">
                <label className="input-label">Max Name</label>
                <input className="input" type="number" value={maxName} onChange={(e) => setMaxName(Number(e.target.value))} />
              </div>
            </div>

            <h4 className={styles.sectionLabel}>Appearance</h4>
            <div className="input-group">
              <label className="input-label">Color Theme</label>
              <div className={styles.swatchRow}>
                {([
                  ["background", "Background"], ["message", "Message"], ["badgeBg", "Badge Bg"],
                  ["name", "Name"], ["amount", "Amount"], ["border", "Border"],
                ] as const).map(([key, label]) => (
                  <label key={key} className={styles.swatch}>
                    <span className={styles.swatchDot} style={{ background: colors[key] }}>
                      <input type="color" value={colors[key]} onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", padding: 0, border: "none" }} />
                    </span>
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <h4 className={styles.sectionLabel}>Visibility & Layout</h4>
            {([
              ["Show Background", showBackground, setShowBackground],
              ["Show Icon", showIcon, setShowIcon],
              ["Show Message", showMessage, setShowMessage],
              ["Show Border", showBorder, setShowBorder],
            ] as const).map(([label, val, setter]) => (
              <div key={label} className={styles.cfgToggleRow}>
                <span>{label}</span>
                <button type="button" className={val ? styles.toggleOn : styles.toggle} onClick={() => setter(!val)}>
                  <span className={styles.toggleKnob} />
                </button>
              </div>
            ))}

            <h4 className={styles.sectionLabel}>Typography</h4>
            <div className="input-group">
              <label className="input-label">Font Family</label>
              <select className="input" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                {LB_FONTS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className={styles.cfgRow3}>
              <div className="input-group">
                <label className="input-label">Size (px)</label>
                <input className="input" type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
              </div>
              <div className="input-group">
                <label className="input-label">Stroke W</label>
                <input className="input" type="number" value={strokeW} onChange={(e) => setStrokeW(Number(e.target.value))} />
              </div>
              <div className="input-group">
                <label className="input-label">Stroke</label>
                <label className={styles.colorDot} style={{ background: strokeColor }}>
                  <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", padding: 0, border: "none" }} />
                </label>
              </div>
            </div>

            <h4 className={styles.sectionLabel}>Motion & Style</h4>
            <div className={styles.cfgRow3} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="input-group">
                <label className="input-label">Entry Animation</label>
                <select className="input" value={entryAnimation} onChange={(e) => { setEntryAnimation(e.target.value); setAnimKey((k) => k + 1); }}>
                  <option>Drop Down</option><option>Fade</option><option>Slide In</option><option>Slide Up</option><option>None</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Highlight Effect</label>
                <select className="input" value={highlightEffect} onChange={(e) => setHighlightEffect(e.target.value)}>
                  <option>None</option><option>Glow</option><option>Pulse</option>
                </select>
              </div>
            </div>

            <h4 className={styles.sectionLabel}>Badge Styles</h4>
            <div className={styles.cfgRow3} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="input-group">
                <label className="input-label">Amount Style</label>
                <select className="input" value={amountStyle} onChange={(e) => setAmountStyle(e.target.value)}>
                  <option>Simple</option><option>Badge</option><option>Pill</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Name Style</label>
                <select className="input" value={nameStyle} onChange={(e) => setNameStyle(e.target.value)}>
                  <option>Simple</option><option>Badge</option><option>Pill</option>
                </select>
              </div>
            </div>

            <h4 className={styles.sectionLabel}>Ranking</h4>
            {([
              ["Enable Ranks", enableRanks, setEnableRanks],
              ["Show as Badge", rankAsBadge, setRankAsBadge],
              ["Show Streak 🔥", showStreak, setShowStreak],
            ] as const).map(([label, val, setter]) => (
              <div key={label} className={styles.cfgToggleRow}>
                <span>{label}</span>
                <button type="button" className={val ? styles.toggleOn : styles.toggle} onClick={() => setter(!val)}>
                  <span className={styles.toggleKnob} />
                </button>
              </div>
            ))}

            <h4 className={styles.sectionLabel}>Session & Recent</h4>
            {enableRanks && (<>
            <div className="input-group" style={{ marginBottom: 12 }}>
              <label className="input-label">How Many to Show:</label>
              <select className="input" value={topN} onChange={(e) => setTopN(e.target.value)}>
                <option>All</option><option>Top 1 Only</option><option>Top 2</option><option>Top 3</option><option>Top 4</option><option>Top 5</option>
              </select>
            </div>
            <div className="input-group" style={{ marginBottom: 12 }}>
              <label className="input-label">Icon Style:</label>
              <select className="input" value={iconStyle} onChange={(e) => setIconStyle(e.target.value)}>
                <option>🥇 Medals</option><option>👑 Status</option><option>💰 Wealth</option><option>🎮 Gaming</option><option>🚀 Space</option><option>❤️ Hearts</option><option>❌ None</option>
              </select>
            </div>
            <div className={styles.cfgRow3} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="input-group">
                <label className="input-label">Rank Text Color</label>
                <label className={styles.colorDot} style={{ background: rankTextColor }}>
                  <input type="color" value={rankTextColor} onChange={(e) => setRankTextColor(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", padding: 0, border: "none" }} />
                </label>
              </div>
              <div className="input-group">
                <label className="input-label">Rank BG Color</label>
                <label className={styles.colorDot} style={{ background: rankBgColor }}>
                  <input type="color" value={rankBgColor} onChange={(e) => setRankBgColor(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", padding: 0, border: "none" }} />
                </label>
              </div>
            </div>
            <div key="topHighlight" className={styles.cfgToggleRow} style={{ marginTop: 12 }}>
              <span>⭐ Top 1 Special Highlight</span>
              <button type="button" className={topHighlight ? styles.toggleOn : styles.toggle} onClick={() => setTopHighlight(!topHighlight)}>
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className="input-group" style={{ marginTop: 12 }}>
              <label className="input-label">Top 1 Icon Size (em)</label>
              <input className="input" type="number" step="0.1" value={iconSize} onChange={(e) => setIconSize(Number(e.target.value))} />
            </div>
            <div className={styles.cfgRow3}>
              <div className="input-group">
                <label className="input-label">Name Effect</label>
                <select className="input" value={nameEffect} onChange={(e) => setNameEffect(e.target.value)}>
                  <option>☀️ Glow</option><option>✨ Shimmer</option><option>🌈 Rainbow</option><option>🏆 Gold</option><option>💎 Diamond</option><option>🔮 Plasma</option><option>🌀 SteamKit</option><option>⚡ Thunder</option><option>👾 Glitch</option><option>🔥 Fire</option><option>❌ None</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Icon Effect</label>
                <select className="input" value={iconEffect} onChange={(e) => setIconEffect(e.target.value)}>
                  <option>✨ Shimmer</option><option>🌈 Prism Rainbow</option><option>🌟 Golden Glow</option><option>🥇 Liquid Gold</option><option>💎 Diamond</option><option>🔮 Plasma</option><option>🌀 SteamKit</option><option>⚡ Thunder</option><option>👾 Glitch</option><option>🔥 Fire</option><option>❌ None</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Icon Animation</label>
                <select className="input" value={iconAnimation} onChange={(e) => setIconAnimation(e.target.value)}>
                  <option>❌ None</option><option>Bounce</option><option>Spin</option><option>💗 Pulse</option><option>🥺 Shake</option>
                </select>
              </div>
            </div>
            </>)}
            <button type="button" className={styles.initBtn} onClick={async () => {
              const newSettings = {
                title: widgetTitle, dataSource, rows, rowGap, maxName, colors: { ...colors },
                showBackground, showIcon, showMessage, showBorder,
                fontFamily, fontSize, strokeW, strokeColor, entryAnimation, highlightEffect,
                amountStyle, nameStyle, enableRanks, rankAsBadge, showStreak,
                topN, iconStyle, rankTextColor, rankBgColor, topHighlight,
                nameEffect, iconEffect, iconAnimation, iconSize,
              };
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Authentication required.");
                const { data, error } = await supabase
                  .from("streamkit_overlay_credentials")
                  .update({ leaderboard_widget: newSettings })
                  .eq("creator_id", user.id)
                  .select("creator_id")
                  .maybeSingle();
                if (error) throw new Error(error.message);
                if (!data) throw new Error("Leaderboard settings could not be saved. Please retry.");
                const channel = supabase.channel("streamkit-leaderboard-settings");
                await channel.subscribe();
                await channel.send({ type: "broadcast", event: "updated", payload: {} });
                void supabase.removeChannel(channel);
                setWidgets((ws) => editingId
                  ? ws.map((x) => x.id === editingId ? { ...x, title: widgetTitle || "Widget", rows, animation: entryAnimation.toLowerCase().replace(/\s/g, ""), type: widgetTypeLabel(dataSource), colors: [colors.background, colors.border, colors.amount, colors.name, colors.message, colors.badgeBg], settings: newSettings } : x)
                  : [...ws, { id: Math.floor(100 + Math.random() * 900), title: widgetTitle || "Widget", rows, animation: entryAnimation.toLowerCase().replace(/\s/g, ""), type: widgetTypeLabel(dataSource), colors: [colors.background, colors.border, colors.amount, colors.name, colors.message, colors.badgeBg], settings: newSettings }]);
                setEditingId(null);
                setView("list");
                showToast("Leaderboard settings saved. The overlay checks for changes every 2 seconds.");
              } catch (e) {
                showToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, true);
              }
            }}>
              {editingId ? "SAVE WIDGET" : "CREATE WIDGET"}
            </button>
          </div>
        </div>

        <div className={styles.createRight}>
          <div className={styles.livePreviewLabel}>WIDGET PREVIEW <span className={styles.liveDot} /></div>
            <div className={styles.previewDashed}>
              <style>{ICON_ANIM_CSS}</style>
            <div
              key={animKey}
              style={{
                width: "100%",
                maxWidth: 420,
                fontFamily: `'${fontFamily}', sans-serif`,
                fontSize,
                color: colors.name,
              }}
            >
              {showMessage && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: colors.message, fontWeight: 700 }}>
                  {showIcon && <Trophy size={16} color={colors.amount} />}
                  {widgetTitle}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: rowGap }}>
                {sampleRows.slice(0, getVisibleRowCount(topN, Math.max(0, rows))).map((row, i) => (
                  <div
                    key={row.name}
                    className={`${styles.lbPreviewRow} ${entryAnimation === "Drop Down" ? styles.animDrop : entryAnimation === "Fade" ? styles.animFade : entryAnimation === "Slide In" ? styles.animSlide : ""} ${topHighlight && i === 0 ? "topPop" : ""}`}
                    style={{
                      background: showBackground ? colors.background : "transparent",
                      border: showBorder ? `1px solid ${colors.border}` : "1px solid transparent",
                      boxShadow: highlightEffect === "Glow" ? `0 0 14px ${colors.amount}66` : highlightEffect === "Pulse" ? undefined : undefined,
                    }}
                  >
                    {enableRanks && (
                      rankAsBadge ? (
                        <span style={{ background: rankBgColor, color: rankTextColor, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{i === 0 ? (getRankIcons(iconStyle)[0] ?? "#1") : `#${i + 1}`}</span>
                      ) : (
                        <span style={{ color: rankTextColor, fontWeight: 700, minWidth: 24, textAlign: "center", flexShrink: 0 }}>
                          <span className={enableRanks && i === 0 ? getIconAnimClass(iconAnimation) : ""} style={{ display: "inline-block", lineHeight: 1, fontSize: i === 0 ? `${iconSize}em` : "1em", ...(enableRanks && i === 0 ? getIconEffectStyle(iconEffect) : {}) }}>
                            {topHighlight && i === 0 ? "🔥" : (i === 0 ? (getRankIcons(iconStyle)[0] ?? "#1") : `#${i + 1}`)}
                          </span>
                        </span>
                      )
                    )}
                    {topHighlight && i === 0 && <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>Top 1</span>}
                    <span className={enableRanks && i === 0 ? getIconAnimClass(iconAnimation) : ""} style={{ display: "inline-block", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...(nameStyle !== "Simple" ? { backgroundColor: colors.badgeBg, borderRadius: nameStyle === "Pill" ? 999 : 6, padding: "2px 10px" } : {}), ...(enableRanks && i === 0 ? getNameEffectStyle(nameEffect, colors.amount) : {}) }}>
                      {row.name.slice(0, maxName)}{showStreak && enableRanks && i === 0 ? " 🔥" : ""}
                    </span>
                    <strong style={{ marginLeft: "auto", color: amountStyle === "Simple" ? colors.amount : "#FFFFFF", WebkitTextStroke: strokeW ? `${strokeW}px ${strokeColor}` : undefined, backgroundColor: amountStyle === "Simple" ? "transparent" : colors.badgeBg, borderRadius: amountStyle === "Pill" ? 999 : amountStyle === "Badge" ? 8 : 0, padding: amountStyle === "Simple" ? 0 : "4px 12px" }}>
                      {row.amount}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      )}

      {historyState === "error" ? (
        <section className={`${styles.card} card ${styles.historyCard} ${styles.historyNotice}`} role="alert">
          <h2>Leaderboard unavailable</h2>
          <p>Could not load donation activity. Check your connection and try again.</p>
          <button type="button" className="btn btn-secondary" onClick={() => setRefreshKey((key) => key + 1)}>
            Retry
          </button>
        </section>
      ) : historyState === "empty" ? (
        <section className={`${styles.card} card ${styles.historyCard} ${styles.historyNotice} ${styles.historyEmpty}`} role="status">
          <h2>No leaderboard activity yet</h2>
          <p>Eligible completed donations will appear here.</p>
        </section>
      ) : (
      <section className={`${styles.card} card ${styles.historyCard}`} aria-label="Leaderboard donation history">
          <div className={styles.leaderboardGrid}>
            {tips.map((tip, index) => (
              <div
                key={`${tip.tipper_name}-${tip.currency}`}
                className={`${styles.leaderboardCard} ${index === 0 ? styles.rankGold : index === 1 ? styles.rankSilver : index === 2 ? styles.rankBronze : ""}`}
              >
                <div className={styles.rankBadge}>
                  {index < 3 ? <Medal size={18} /> : `#${index + 1}`}
                </div>
                <div className={styles.donorMeta}>
                  <strong>{tip.tipper_name}</strong>
                  <span>{tip.tip_count} {tip.tip_count === 1 ? "donation" : "donations"}</span>
                </div>
                <div className={styles.donorAmount}>
                  {tip.currency === "KHR"
                    ? `KHR ${Number(tip.amount).toLocaleString()}`
                    : `USD $${Number(tip.amount).toFixed(2)}`}
                </div>
              </div>
            ))}
          </div>
      </section>
      )}
      {modal && (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-label={modal.type === "clear" ? "Clear widget history" : modal.type === "delete" ? "Confirm deletion" : "Send test donation"}>
            <div className={styles.modalAccent} />
            <h3 className={styles.modalTitle}>
              {modal.type === "clear" ? <RotateCcw size={18} color="var(--dash-primary)" /> : modal.type === "delete" ? <Trash2 size={18} color="var(--dash-danger)" /> : <Play size={18} color="var(--dash-primary)" />}
              {modal.type === "clear" ? "CLEAR WIDGET HISTORY?" : modal.type === "delete" ? "CONFIRM DELETION?" : "SEND TEST DONATION?"}
            </h3>
            <p className={styles.modalText}>
              {modal.type === "clear"
                ? "This will clear the leaderboard donation history. Other widgets (goals, alerts) are not affected."
                : modal.type === "delete"
                  ? "This widget will be permanently removed. This action cannot be undone."
                  : "This records one TEST donation in your account. It can appear in every active widget showing donation history, and it does not charge anyone. The record stays in Donation History; clearing a widget only resets that widget’s feed."}
            </p>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setModal(null)} className={styles.modalCancel}>Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  if (modal.type === "delete") {
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) throw new Error("Authentication required.");
                      const { data, error } = await supabase
                        .from("streamkit_overlay_credentials")
                        .update({ leaderboard_widget: {} })
                        .eq("creator_id", user.id)
                        .select("creator_id")
                        .maybeSingle();
                      if (error) throw new Error(error.message);
                      if (!data) throw new Error("Widget could not be deleted. Please retry.");
                      setWidgets((ws) => ws.filter((x) => x.id !== modal.goal.id));
                      showToast("Leaderboard widget cleared.");
                    } catch (e) {
                      showToast(`Delete failed: ${e instanceof Error ? e.message : String(e)}`, true);
                    }
                  } else if (modal.type === "clear") {
                    const { error } = await supabase.rpc("streamkit_leaderboard_clear_history");
                    if (error) {
                      showToast(`Clear failed: ${error.message}`, true);
                    } else {
                      showToast("Leaderboard history cleared.");
                      setRefreshKey((k) => k + 1);
                    }
                  } else {
                    const { error } = await supabase.rpc("streamkit_insert_test_tip", {
                      p_name: "Test Donor",
                      p_amount: 10,
                      p_currency: "USD",
                      p_message: "Test donation from Leaderboard Widgets",
                    });
                    showToast(error ? `Test failed: ${error.message}` : "TEST donation recorded. Check your active OBS sources to confirm where it appears.", Boolean(error));
                  }
                  setModal(null);
                }}
                className={modal.type === "delete" ? styles.modalDanger : styles.modalConfirm}
              >
                {modal.type === "clear" ? "Yes, Clear" : modal.type === "delete" ? "Yes, Delete" : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (<div className={`${styles.toast} ${toastError ? styles.toastError : ""}`} role={toastError ? "alert" : "status"} aria-live="polite"><span className={styles.toastIcon}>{toastError ? "!" : "✓"}</span><div><div className={styles.toastTitle}>{toastError ? "Action failed" : "Success"}</div><div className={styles.toastMsg}>{toast}</div></div></div>)}
    </div>
  );
}

