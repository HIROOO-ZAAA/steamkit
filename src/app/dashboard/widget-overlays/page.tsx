"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, Copy, Medal, Trophy, RotateCcw, Play, Pencil, Trash2, ArrowLeft, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLeaderboardWidgets } from "@/lib/dashboard/leaderboard-settings-adapter";
import { widgetOverlayUrl } from "@/lib/overlay/widget-url";
import { validateWidgetSettings } from "@/lib/overlay/widget-validation";
import {
  getLeaderboardHistoryState,
  getLeaderboardSince,
  type LeaderboardPeriodFilter,
} from "@/lib/leaderboard-history-state";
import { getWidgetSettingsState } from "@/lib/dashboard/widget-settings-state";
import PageHeader from "@/components/ui/PageHeader";
import styles from "./widget-overlays.module.css";

const LB_FONTS = ['Press Start 2P','Orbitron','Audiowide','Black Ops One','Bungee','Quantico','VT323','Wallpoet','Exo 2','Bebas Neue','Anton','Bangers','Carter One','Fredoka','Fugaz One','Lilita One','Passion One','Paytone One','Righteous','Russo One','Squada One','Teko','Titan One','Ultra','Battambang','Moul','Koulen','Hanuman','Siemreap','Nokora','Taprom','Inter','Rajdhani','Poppins','Roboto','Montserrat','Lato','Nunito','Open Sans','Oswald','Rubik','Ubuntu','Merriweather','Playfair Display','Lobster','Pacifico'];

const sampleRows = [
  { name: "WhaleDonor", amount: "$9.00" },
  { name: "Srey Neth", amount: "$9.00" },
  { name: "NightOwl", amount: "$33.00" },
];

const widgetTypeLabel = (source: string) =>
  source === "Most Recent (History)" ? "RECENT"
  : source === "This Month" ? "MONTH"
  : source === "This Week" ? "WEEK"
  : "ALL-TIME";

type LeaderboardEntry = {
  tipper_name: string;
  amount: number;
  currency: string;
  tip_count: number;
  last_tip_at: string;
};

export default function WidgetOverlaysPage() {
  const [tips, setTips] = useState<LeaderboardEntry[]>([]);
  const [filter, setFilter] = useState<LeaderboardPeriodFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [widgetUrl, setWidgetUrl] = useState("");
  const [widgetSettingsLoading, setWidgetSettingsLoading] = useState(true);
  const [widgetSettingsError, setWidgetSettingsError] = useState(false);
  const [widgetSettingsRefresh, setWidgetSettingsRefresh] = useState(0);

  const [supabase] = useState(() => createClient());

  const [widgetTitle, setWidgetTitle] = useState("ក្ដិត");
  const [dataSource, setDataSource] = useState("Most Recent (History)");
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
  }>>([]);
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Declared after the state it reads/writes so there is no temporal-dead-zone
  // access on the first render.
  useEffect(() => {
    let cancelled = false;

    async function fetchWidgetToken() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Workspace unavailable");

        const { error: createError } = await supabase
          .from("streamkit_overlay_credentials")
          .upsert({ creator_id: user.id }, { onConflict: "creator_id" });
        if (createError) throw createError;

        const { data: credentials, error } = await supabase
          .from("streamkit_overlay_credentials")
          .select("widget_token, widget_settings, leaderboard_widget")
          .eq("creator_id", user.id)
          .maybeSingle();
        if (error || !credentials) throw error ?? new Error("Settings unavailable");
        if (cancelled) return;

        const baseUrl = window.location.origin;
        setWidgetUrl(
          credentials.widget_token
            ? `${baseUrl}/overlay/widget?token=${credentials.widget_token}`
            : "",
        );

        setWidgets(getLeaderboardWidgets(credentials) ?? []);
      } catch {
        if (!cancelled) {
          setWidgetUrl("");
          setWidgetSettingsError(true);
        }
      } finally {
        if (!cancelled) setWidgetSettingsLoading(false);
      }
    }

    void fetchWidgetToken();
    return () => {
      cancelled = true;
    };
  }, [supabase, widgetSettingsRefresh]);
  const [modal, setModal] = useState<{ type: "clear" | "test" | "delete"; goal: { id: number } } | null>(null);
  const showToast = (msg: string, isError = /failed|error/i.test(msg)) => {
    setToast(msg);
    setToastError(isError);
    window.setTimeout(() => setToast(""), 2500);
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
          p_since: getLeaderboardSince(filter),
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
  }, [filter, refreshKey, supabase]);

  const historyState = getLeaderboardHistoryState({
    loading,
    failed: loadError,
    entryCount: tips.length,
  });
  const widgetSettingsState = getWidgetSettingsState({
    loading: widgetSettingsLoading,
    failed: widgetSettingsError,
    widgetCount: widgets.length,
  });

  if (loading) {
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
        title="Widget Overlays"
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
        This is the current multi-widget builder. For the legacy single leaderboard setup, open{" "}
        <Link href="/dashboard/widgets/leaderboard">Leaderboard</Link>.
      </p>

      {view === "list" ? (
        <>
        <div className={styles.widgetTable}>
          <div className={styles.widgetHead}>
            <span>TITLE</span>
            <span>CONFIG</span>
            <span>TYPE</span>
            <span>COLORS</span>
            <span className={styles.headActions}>ACTIONS</span>
          </div>
          {widgetSettingsState === "loading" ? (
            <p className={styles.emptyText} role="status">Loading saved widgets…</p>
          ) : widgetSettingsState === "error" ? (
            <div className={styles.widgetLoadError} role="alert">
              <div>
                <strong>Saved widgets unavailable</strong>
                <p>We couldn’t load your widget settings. Retry to check again.</p>
              </div>
              <button type="button" className={styles.retryButton} onClick={() => {
                setWidgetSettingsError(false);
                setWidgetSettingsLoading(true);
                setWidgetSettingsRefresh((key) => key + 1);
              }}>
                Retry
              </button>
            </div>
          ) : widgetSettingsState === "ready" ? widgets.map((w) => (
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
                <button type="button" className={styles.actUnlock} title="Copy widget URL" onClick={async () => {
                  const url = widgetOverlayUrl(widgetUrl, w.id);
                  if (!url) return showToast("Widget URL is not ready. Reload this page and try again.", true);
                  try {
                    await navigator.clipboard.writeText(url);
                    showToast("Widget URL copied for OBS.");
                  } catch {
                    showToast("Could not copy the widget URL. Check browser clipboard permissions.", true);
                  }
                }}><Copy size={15} /></button>
                <button type="button" className={styles.actIcon} title="Preview widget" onClick={() => {
                  const url = widgetOverlayUrl(widgetUrl, w.id);
                  if (!url) return showToast("Widget URL is not ready. Reload this page and try again.", true);
                  window.open(url, "_blank", "noopener,noreferrer");
                }}><Eye size={15} /></button>
                <button type="button" className={`${styles.actIcon} ${styles.actTest}`} title="Send test donation" onClick={() => setModal({ type: "test", goal: w })}><Play size={15} /></button>
                <button type="button" className={styles.actIcon} title="Edit" onClick={() => {
                  const s = w.settings ?? null;
                  if (s) {
                    if (s.title !== undefined) setWidgetTitle(s.title);
                    if (s.dataSource) setDataSource(s.dataSource);
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
          )) : null}
          {widgetSettingsState === "empty" && <p className={styles.emptyText} role="status">No widgets yet. Create one to get started.</p>}
        </div>
        <div className={`${styles.card} card`}>
          <h3 className={styles.cardLabel}>ADD TO OBS</h3>
          <p className={styles.subtitle}>Copy the URL for the specific widget, then add it in OBS as a Browser Source. Set the source dimensions to fit the widget and keep the background transparent. The URL keeps the existing private overlay token; do not share it publicly.</p>
        </div>
        </>
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
                <option>Most Recent (History)</option>
                <option>All-Time Top Donors</option>
                <option>This Month</option>
                <option>This Week</option>
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
            <button type="button" className={styles.initBtn} onClick={async () => {
              if (saving) return;
              setSaving(true);
              const newSettings = {
                title: widgetTitle, dataSource, rows, rowGap, maxName, colors: { ...colors },
                showBackground, showIcon, showMessage, showBorder,
                fontFamily, fontSize, strokeW, strokeColor, entryAnimation, highlightEffect,
                amountStyle, nameStyle, enableRanks, rankAsBadge, showStreak,
              };
              const validationError = validateWidgetSettings({ title: widgetTitle, rows, rowGap, maxName, fontSize, strokeW, colors });
              if (validationError) {
                showToast(validationError, true);
                setSaving(false);
                return;
              }
              const newWidgets = editingId !== null
                ? widgets.map((x) => x.id === editingId ? { ...x, title: widgetTitle || "Widget", rows, animation: entryAnimation.toLowerCase().replace(/\s/g, ""), type: widgetTypeLabel(dataSource), colors: [colors.background, colors.border, colors.amount, colors.name, colors.message, colors.badgeBg], settings: newSettings } : x)
                : [...widgets, { id: Date.now() + Math.floor(Math.random() * 1000), title: widgetTitle || "Widget", rows, animation: entryAnimation.toLowerCase().replace(/\s/g, ""), type: widgetTypeLabel(dataSource), colors: [colors.background, colors.border, colors.amount, colors.name, colors.message, colors.badgeBg], settings: newSettings }];
              const storedSettings = { ...newSettings, widgets: newWidgets };
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("Sign in again to save this widget.");
                const { data, error } = await supabase
                  .from("streamkit_overlay_credentials")
                  .update({ widget_settings: storedSettings })
                  .eq("creator_id", user.id)
                  .select("creator_id")
                  .maybeSingle();
                if (error || !data) throw new Error("Widget settings could not be saved. Please retry.");
                setWidgets(newWidgets);
                setEditingId(null);
                setView("list");
                showToast("Widget settings saved. The overlay checks for changes every 2 seconds.");
                try {
                  const channel = supabase.channel("streamkit-widget-settings");
                  await channel.subscribe();
                  await channel.send({ type: "broadcast", event: "updated", payload: {} });
                  void supabase.removeChannel(channel);
                } catch {
                  // The overlay also polls saved settings, so broadcast is best-effort.
                }
              } catch {
                showToast("Widget settings could not be saved. Please retry.", true);
              } finally {
                setSaving(false);
              }
            }}>
              {saving ? "SAVING…" : editingId !== null ? "SAVE WIDGET" : "CREATE WIDGET"}
            </button>
          </div>
        </div>

        <div className={styles.createRight}>
          <div className={styles.livePreviewLabel}>WIDGET PREVIEW <span className={styles.liveDot} /></div>
          <div className={styles.previewDashed}>
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
                {sampleRows.slice(0, Math.max(0, rows)).map((row, i) => (
                  <div
                    key={row.name}
                    className={`${styles.lbPreviewRow} ${entryAnimation === "Drop Down" ? styles.animDrop : entryAnimation === "Fade" ? styles.animFade : entryAnimation === "Slide In" ? styles.animSlide : ""}`}
                    style={{
                      background: showBackground ? colors.background : "transparent",
border: showBorder ? `1px solid ${colors.border}` : "1px solid transparent",
                      boxShadow: highlightEffect === "Glow" ? `0 0 14px ${colors.amount}66` : highlightEffect === "Pulse" ? undefined : undefined,
                    }}
                  >
                    {enableRanks && (
                      rankAsBadge ? (
                        <span style={{ backgroundColor: colors.badgeBg, color: "#0F172A", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>#{i + 1}</span>
                      ) : (
                        <span style={{ color: colors.amount, fontWeight: 700, width: 24 }}>#{i + 1}</span>
                      )
                    )}
                    <span style={nameStyle !== "Simple" ? { backgroundColor: colors.badgeBg, borderRadius: nameStyle === "Pill" ? 999 : 6, padding: "2px 10px" } : undefined}>
                      {row.name.slice(0, maxName)}{showStreak && enableRanks ? " 🔥" : ""}
                    </span>
                    <strong style={{ marginLeft: "auto", color: colors.amount, WebkitTextStroke: strokeW ? `${strokeW}px ${strokeColor}` : undefined, backgroundColor: amountStyle !== "Simple" ? colors.badgeBg : undefined, borderRadius: amountStyle === "Pill" ? 999 : 6, padding: amountStyle !== "Simple" ? "2px 10px" : 0 }}>
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

      {view === "list" ? (
        <section className={`${styles.card} card ${styles.historyCard}`} aria-labelledby="top-donors-title">
          <div className={styles.historyHead}>
            <div>
              <h2 id="top-donors-title" className={styles.cardLabel}>Top Donors</h2>
              <p className={styles.subtitle}>Leaderboard history for your selected period.</p>
            </div>
            <div className={styles.periodTabs} role="group" aria-label="Leaderboard period">
              {([
                ["all", "All time"],
                ["30d", "Last 30 days"],
                ["7d", "Last 7 days"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.periodTab} ${filter === value ? styles.periodTabActive : ""}`}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {historyState === "error" ? (
            <div className={styles.historyNotice} role="alert">
              <div>
                <strong>Donor history unavailable</strong>
                <p>We couldn’t load the leaderboard. Try again.</p>
              </div>
              <button type="button" className={styles.retryButton} onClick={() => setRefreshKey((key) => key + 1)}>
                Retry
              </button>
            </div>
          ) : historyState === "empty" ? (
            <p className={styles.historyEmpty} role="status">No donor history in this period yet.</p>
          ) : (
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
          )}
        </section>
      ) : null}
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
                ? "This will start a new session on OBS. Donation history for this widget will be cleared."
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
                        if (!user) throw new Error("Sign in again to delete this widget.");
                        const remaining = widgets.filter((x) => x.id !== modal.goal.id);
                        const { data: creds, error: readError } = await supabase
                          .from("streamkit_overlay_credentials")
                          .select("widget_settings")
                          .eq("creator_id", user.id)
                          .maybeSingle();
                        if (readError || !creds) throw new Error("Widget settings could not be loaded.");
                        const { data, error } = await supabase
                          .from("streamkit_overlay_credentials")
                          .update({ widget_settings: { ...(creds.widget_settings ?? {}), widgets: remaining } })
                          .eq("creator_id", user.id)
                          .select("creator_id")
                          .maybeSingle();
                        if (error || !data) throw new Error("Widget could not be deleted. Please retry.");
                        setWidgets(remaining);
                        showToast("Widget deleted.");
                      } catch {
                        showToast("Widget could not be deleted. Please retry.", true);
                      }
                    } else if (modal.type === "clear") {
                      const { error } = await supabase.rpc("streamkit_widget_clear_history");
                      showToast(error ? "Widget history could not be cleared. Please retry." : "Widget history cleared. OBS will reset on next refresh.", Boolean(error));
                    } else {
                      const { error } = await supabase.rpc("streamkit_insert_test_tip", {
                        p_name: "Test Donor",
                        p_amount: 10,
                        p_currency: "USD",
                        p_message: "Test donation from Widget Overlays",
                      });
                      showToast(error ? "Test donation could not be recorded. Please retry." : "TEST donation recorded. Check your active OBS sources to confirm where it appears.", Boolean(error));
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
      {toast && (<div className={`${styles.toast} ${toastError ? styles.toastError : ""}`} role={toastError ? "alert" : "status"}><span className={styles.toastIcon}>{toastError ? "!" : <Check size={14} />}</span><div><div className={styles.toastTitle}>{toastError ? "Action failed" : "Success"}</div><div className={styles.toastMsg}>{toast}</div></div></div>)}
    </div>
  );
}
