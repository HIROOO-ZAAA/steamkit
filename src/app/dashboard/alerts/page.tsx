"use client";

import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./alerts.module.css";
import {
  Copy,
  Check,
  Plus,
  Trash2,
  Play,
  Eye,
  EyeOff,
  ShieldAlert,
  Type,
  Layout,
  Loader2,
  Upload,
} from "lucide-react";

const KHMER_FONTS = [
  "Noto Sans Khmer",
  "Hanuman",
  "Kdam Thmor Pro",
  "Suwannaphum",
  "Dangrek",
  "Siemreap",
  "Noto Serif Khmer",
  "Battambang"
];

const SOUND_PRESETS = [
  { name: "Default Stream Bell", url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" },
  { name: "Retro Arcade Chime", url: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3" },
  { name: "Electric Level Up", url: "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3" },
  { name: "Victory Fanfare", url: "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3" }
];

const AVATAR_PRESETS = [
  { label: "Sonic", emoji: "🦔" },
  { label: "Mario", emoji: "🍄" },
  { label: "Frog", emoji: "🐸" },
  { label: "Robot", emoji: "🤖" },
  { label: "Alien", emoji: "👾" },
  { label: "Cat", emoji: "🐱" },
];

type TierRow = {
  id: string;
  name: string;
  min_amount_usd: number;
  min_amount_khr: number;
  sort_order: number;
};

/** Raw `alert_settings` row as it comes back from the table. */
type RawAlertSettings = {
  tier_id?: string | null;
  duration_seconds?: number | null;
  sound_url?: string | null;
  animation_type?: string | null;
  alert_animation?: string | null;
  text_animation?: string | null;
  font_color?: string | null;
  layout?: string | null;
  image_url?: string | null;
  image_scale?: number | null;
  show_donor_profile?: boolean | null;
  message_template?: string | null;
  text_color?: string | null;
  bg_color?: string | null;
  font_family?: string | null;
  font_size?: number | null;
  font_weight?: string | null;
  tts_enabled?: boolean | null;
  donor_avatar?: string | null;
  text_delay?: number | null;
};

const LEGACY_ANIM_MAP: Record<string, string> = {
  bounceIn: "bounce",
  fadeIn: "fade",
  slideUp: "slide",
  zoomIn: "zoom",
  flip: "bounce",
  pulseGlow: "bounce",
};

function toStoredFont(name: string) {
  return name.includes("'") || name.includes(",") ? name : `'${name}', sans-serif`;
}

function fromStoredFont(stored: string) {
  return stored.split(",")[0].replace(/['"]/g, "").trim();
}

function isImageRef(value: string) {
  return /^https?:\/\//.test(value) || value.startsWith("blob:") || value.startsWith("data:");
}

export default function AlertSettingsPage() {
  const [supabase] = useState(() => createClient());

  // 1. TOP SECTION STATES
  const [obsUrl, setObsUrl] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [obsUrlVisible, setObsUrlVisible] = useState(false);
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const [newBannedWord, setNewBannedWord] = useState("");

  // 2. CANVAS ACTION BAR & TEST SIMULATION STATES
  const [currency, setCurrency] = useState<"USD" | "KHR">("USD");
  const [selectedAmount, setSelectedAmount] = useState("$2");
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [designMode, setDesignMode] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [customTestMessage, setCustomTestMessage] = useState("អរគុណសម្រាប់ការលាយស្ទ្រីមដ៏ល្អ!");
  const [testSending, setTestSending] = useState(false);
  const [toast, setToast] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  };

  // 3. RIGHT SIDEBAR SETTINGS STATES
  const [alertType, setAlertType] = useState<"donation" | "supporter">("donation");
  const [isEnabled, setIsEnabled] = useState(true);

  // Alert tiers. `activeTierId === null` means the creator's base settings,
  // used when a donation does not clear any tier minimum.
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [activeTierId, setActiveTierId] = useState<string | null>(null);
  const [tierRows, setTierRows] = useState<Record<string, RawAlertSettings | null>>({});
  const [tierName, setTierName] = useState("");
  const [tierUsd, setTierUsd] = useState("1.00");
  const [tierKhr, setTierKhr] = useState("4000");
  const [tierBusy, setTierBusy] = useState(false);
  const [layout, setLayout] = useState<"image_top" | "image_left">("image_top");

  // Image Asset
  const [imageUrl, setImageUrl] = useState("https://cdn.streamneon.com/creator/2560/26633910.webp");
  const [imageScale, setImageScale] = useState(50);
  const [showDonorAvatar, setShowDonorAvatar] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState("🦔");

  // Template & Timing
  const [template, setTemplate] = useState("អរគុណ {name} សម្រាប់ការឧបត្ថម {amount}{currency}");
  const [alertDuration, setAlertDuration] = useState(6);
  const [textDelay, setTextDelay] = useState(2);
  // `tts_enabled` has existed on alert_settings since the first alert
  // migration but nothing ever wrote it, so the overlay spoke unconditionally.
  const [ttsEnabled, setTtsEnabled] = useState(true);

  // Voice message intro. Stored once per creator in `alert_voice_intro`, not
  // per tier, which is what makes it globally synced by construction: there is
  // only ever one copy, so every tier necessarily reads the same value.
  const [voiceIntroEnabled, setVoiceIntroEnabled] = useState(false);
  const [voiceIntroTemplate, setVoiceIntroTemplate] = useState(
    "{name} sent a voice message",
  );

  // Audio
  const [selectedSoundUrl, setSelectedSoundUrl] = useState(SOUND_PRESETS[0].url);
  const [customSounds, setCustomSounds] = useState<{ name: string; url: string }[]>([]);
  const [soundVolume, setSoundVolume] = useState(100);
  const soundInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Typography & Styling
  const [fontFamily, setFontFamily] = useState("Noto Sans Khmer");
  const [fontSize, setFontSize] = useState(36);
  const [fontWeight, setFontWeight] = useState("700");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [highlightColor, setHighlightColor] = useState("#32C3A6");
  const [bgColor, setBgColor] = useState("#000000");

  // Animations
  const [alertAnimation, setAlertAnimation] = useState("bounceIn");
  const [textAnimation, setTextAnimation] = useState("wiggle");

  // Save / load state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const presetUrls = new Set(SOUND_PRESETS.map((p) => p.url));
  const customUrls = new Set(customSounds.map((s) => s.url));
  const soundOptions = [
    ...SOUND_PRESETS,
    ...customSounds,
    ...(!presetUrls.has(selectedSoundUrl) && !customUrls.has(selectedSoundUrl)
      ? [{ name: "Saved Custom Sound", url: selectedSoundUrl }]
      : []),
  ];

  /**
   * Populates the whole form from one raw `alert_settings` row. Passing null
   * resets to defaults, which is what a freshly created tier with no settings
   * row yet should show.
   */
  function applySettingsRow(row: RawAlertSettings | null) {
    if (!row) return;
    setAlertDuration(row.duration_seconds ?? 6);
    setSelectedSoundUrl(row.sound_url || SOUND_PRESETS[0].url);
    setAlertAnimation(row.alert_animation || row.animation_type || "bounceIn");
    setHighlightColor(row.font_color || "#32C3A6");
    if (row.layout === "image_left" || row.layout === "image_top") {
      setLayout(row.layout);
    }
    setImageUrl(row.image_url ?? "");
    setImageScale(row.image_scale ?? 50);
    setShowDonorAvatar(row.show_donor_profile ?? true);
    setTemplate(row.message_template || "អរគុណ {name} សម្រាប់ការឧបត្ថម {amount}{currency}");
    setTextColor(row.text_color || "#FFFFFF");
    setBgColor(row.bg_color || "#000000");
    setFontFamily(fromStoredFont(row.font_family || "'Noto Sans Khmer', sans-serif"));
    setFontSize(row.font_size ?? 36);
    setFontWeight(row.font_weight || "700");
    setTextAnimation(row.text_animation || "wiggle");
    setTtsEnabled(row.tts_enabled ?? true);
    if (row.donor_avatar) setSelectedAvatar(row.donor_avatar);
  }

  // ── Fetch OBS overlay token + load saved settings ───────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      await supabase
        .from("streamkit_overlay_credentials")
        .upsert({ creator_id: user.id }, { onConflict: "creator_id" });

      const { data: cred } = await supabase
        .from("streamkit_overlay_credentials")
        .select("token")
        .eq("creator_id", user.id)
        .single();

      if (cancelled) return;
      if (cred?.token) {
        const base =
          typeof window !== "undefined"
            ? window.location.origin
            : "http://localhost:3000";
        setObsUrl(`${base}/overlay/alerts?token=${cred.token}`);
      }

      const { data: settings } = await supabase
        .from("alert_settings")
        .select("*")
        .eq("user_id", user.id);

      if (cancelled) return;

      // One row per (creator, tier): the base row has tier_id null, each tier
      // may have its own. The form always shows the base row on first load.
      const rows = (settings ?? []) as RawAlertSettings[];
      const base = rows.find((r) => !r.tier_id) ?? null;
      const perTier: Record<string, RawAlertSettings> = {};
      for (const row of rows) {
        if (row.tier_id) perTier[row.tier_id] = row;
      }
      setTierRows({ ...perTier, base });
      applySettingsRow(base);

      const { data: tierData } = await supabase
        .from("alert_tiers")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .order("min_amount_usd", { ascending: true });

      if (cancelled) return;
      setTiers((tierData ?? []) as TierRow[]);

      const { data: intro } = await supabase
        .from("alert_voice_intro")
        .select("enabled, template")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (intro) {
        setVoiceIntroEnabled(intro.enabled ?? false);
        if (intro.template) setVoiceIntroTemplate(intro.template);
      }
      setSettingsLoaded(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Handlers
  const handleCopyUrl = () => {
    if (!obsUrl) return;
    navigator.clipboard.writeText(obsUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
    showToast("Link copied to clipboard.");
  };

  const handleAddBannedWord = () => {
    if (newBannedWord.trim() && !bannedWords.includes(newBannedWord.trim())) {
      setBannedWords([...bannedWords, newBannedWord.trim()]);
      setNewBannedWord("");
    }
  };

  const handleRemoveBannedWord = (word: string) => {
    setBannedWords(bannedWords.filter((w) => w !== word));
  };

  const handleSoundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setCustomSounds((prev) => [...prev, { name: file.name, url }]);
      setSelectedSoundUrl(url);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCopyImageUrl = () => {
    if (!imageUrl) return;
    navigator.clipboard.writeText(imageUrl);
    showToast("Image link copied to clipboard.");
  };

  const handleCopySoundUrl = () => {
    if (!selectedSoundUrl) return;
    navigator.clipboard.writeText(selectedSoundUrl);
    showToast("Sound link copied to clipboard.");
  };

  const playAlertSound = () => {
    if (!selectedSoundUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(selectedSoundUrl);
    audio.volume = soundVolume / 100;
    audio.play().catch(() => {});
    audioRef.current = audio;
  };

  const showCanvasPreview = () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setIsTesting(true);
    setPreviewKey((k) => k + 1);
    previewTimerRef.current = setTimeout(() => setIsTesting(false), alertDuration * 1000);
    playAlertSound();
  };

  const handleTriggerTest = async (mode: "live" | "preview") => {
    if (mode === "preview") {
      showCanvasPreview();
      showToast(`${activeTierName} alert was sent to Preview!`);
      return;
    }

    setTestSending(true);
    try {
      const amountNumber = Number(selectedAmount.replace(/[^0-9.]/g, "")) || (currency === "KHR" ? 1000 : 10);

      const res = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "John",
          amount: amountNumber,
          currency,
          message: customTestMessage || "This is a test alert. No payment was made.",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(`Test failed: ${data.error || res.statusText}`);
        return;
      }
      showToast(`${activeTierName} alert was sent to Live!`);
    } catch {
      showToast("Could not reach the test API.");
    } finally {
      setTestSending(false);
      showCanvasPreview();
    }
  };

  // ── Tier management ─────────────────────────────────────────────────────

  const activeTierName =
    tiers.find((t) => t.id === activeTierId)?.name ?? "Default Setting";

  async function createTier() {
    const name = tierName.trim();
    if (!name) {
      showToast("Give the tier a name first.");
      return;
    }
    setTierBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to manage tiers.");

      const { data, error } = await supabase
        .from("alert_tiers")
        .insert({
          user_id: user.id,
          name,
          min_amount_usd: Number(tierUsd) || 0,
          min_amount_khr: Number(tierKhr) || 0,
          sort_order: tiers.length,
        })
        .select()
        .single();
      if (error) throw error;

      setTiers((prev) => [...prev, data as TierRow]);
      setActiveTierId((data as TierRow).id);
      setTierName("");
      showToast(`Tier "${name}" created. Configure it below, then save.`);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Could not create tier.");
    } finally {
      setTierBusy(false);
    }
  }

  async function deleteTier(id: string) {
    const target = tiers.find((t) => t.id === id);
    setTierBusy(true);
    try {
      // alert_settings.tier_id cascades, so the tier's settings row goes too.
      const { error } = await supabase.from("alert_tiers").delete().eq("id", id);
      if (error) throw error;
      setTiers((prev) => prev.filter((t) => t.id !== id));
      if (activeTierId === id) setActiveTierId(null);
      showToast(`Tier "${target?.name ?? ""}" deleted.`);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Could not delete tier.");
    } finally {
      setTierBusy(false);
    }
  }

  function selectTier(id: string | null) {
    setActiveTierId(id);
    // Load that tier's saved row into the form, or reset to defaults when the
    // tier has never been saved.
    applySettingsRow(id ? tierRows[id] ?? null : tierRows.base ?? null);
  }

  /** The row to persist for whichever profile is selected. */
  function buildSettingsPayload(userId: string) {
    return {
      user_id: userId,
      tier_id: activeTierId,
      duration_seconds: alertDuration,
      text_delay: textDelay,
      sound_url: selectedSoundUrl,
      animation_type: LEGACY_ANIM_MAP[alertAnimation] ?? "bounce",
      alert_animation: alertAnimation,
      text_animation: textAnimation,
      font_color: highlightColor,
      layout,
      image_url: imageUrl || null,
      image_scale: imageScale,
      show_donor_profile: showDonorAvatar,
      donor_avatar: selectedAvatar,
      message_template: template,
      text_color: textColor,
      bg_color: bgColor,
      font_family: toStoredFont(fontFamily),
      font_size: fontSize,
      font_weight: fontWeight,
      tts_enabled: ttsEnabled,
      updated_at: new Date().toISOString(),
    };
  }

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    setSaveErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in to save settings.");

      // alert_settings is no longer unique on user_id alone -- it is unique per
      // (creator, tier) -- so PostgREST cannot target it with on_conflict.
      // Branch on whether the row already exists instead.
      const existingQuery = supabase
        .from("alert_settings")
        .select("id")
        .eq("user_id", user.id);
      const { data: existing } = activeTierId
        ? await existingQuery.eq("tier_id", activeTierId).maybeSingle()
        : await existingQuery.is("tier_id", null).maybeSingle();

      const { error } = existing
        ? await supabase
            .from("alert_settings")
            .update({ ...buildSettingsPayload(user.id) })
            .eq("id", existing.id)
        : await supabase
            .from("alert_settings")
            .insert(buildSettingsPayload(user.id));

      if (error) throw error;

      // One row per creator, so this upsert targets the primary key. Because it
      // is creator-scoped rather than tier-scoped, saving from any tier
      // updates the same row -- that is the "global sync" behaviour.
      const { error: introError } = await supabase
        .from("alert_voice_intro")
        .upsert(
          {
            user_id: user.id,
            enabled: voiceIntroEnabled,
            template: voiceIntroTemplate,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (introError) throw introError;

      setTierRows((prev) => {
        const next = { ...prev };
        if (activeTierId) next[activeTierId] = buildSettingsPayload(user.id);
        return next;
      });

      const scope = activeTierName === "Default Setting" ? "" : ` to "${activeTierName}"`;
      setSaveMsg(`Settings saved${scope}. Your OBS overlay now uses these settings.`);
      showToast(`Settings saved${scope}.`);
    } catch (cause) {
      setSaveErr(cause instanceof Error ? cause.message : "Failed to save settings.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 4000);
    }
  };

  const hasAvatarTag = template.includes("{avatar}");

  const highlightNameAndAmount = (text: string) => {
    const escapedAmount = selectedAmount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(John|${escapedAmount}\\s*${currency})`, "g");
    return text.split(re).map((seg, i) =>
      seg === "John" || seg.startsWith(selectedAmount) ? (
        <span key={i} style={{ color: highlightColor, fontWeight: 800 }}>{seg}</span>
      ) : (
        <React.Fragment key={i}>{seg}</React.Fragment>
      ),
    );
  };

  const renderTemplatePreview = () => {
    const avatarParts = template.split("{avatar}");
    return avatarParts.map((part, idx) => {
      const parsed = part
        .replace("{name}", "John")
        .replace("{amount}", selectedAmount)
        .replace("{currency}", currency);
      return (
        <React.Fragment key={idx}>
          {idx > 0 && showDonorAvatar && (
            <span className={styles.inlineAvatar} style={{ borderColor: highlightColor }}>
              {isImageRef(selectedAvatar) ? (
                <img src={selectedAvatar} alt="" />
              ) : (
                selectedAvatar
              )}
            </span>
          )}
          {highlightNameAndAmount(parsed)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>ALERT BOX SETTINGS</h1>
        <p className={styles.pageSubtitle}>
          Configure on-screen alert animations, Khmer typography, audio triggers, and live OBS overlay.
        </p>
      </div>

      {/* ================= 1. TOP SECTION ================= */}
      <div className={styles.topGrid}>
        {/* OBS Browser Source URL */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span><Layout size={16} /> OBS BROWSER SOURCE WIDGET URL</span>
          </div>
          <div className={styles.urlRow}>
            <div style={{ flex: 1, background: "#13203A", border: "1px solid #1E3350", borderRadius: 6, padding: "0 12px", boxSizing: "border-box" }}>
              <input
                type="text"
                readOnly
                value={obsUrl || "Loading your overlay URL…"}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: "#94A3B8",
                  padding: "8px 0",
                  fontSize: 13,
                  boxSizing: "border-box",
                  opacity: obsUrl ? 1 : 0.5,
                  filter: obsUrlVisible ? "none" : "blur(6px)",
                }}
              />
            </div>
            <button type="button" className={styles.btnSecondary} onClick={handleCopyUrl} disabled={!obsUrl} title="Copy link">
              {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => setObsUrlVisible((v) => !v)} title={obsUrlVisible ? "Hide URL" : "Show URL"}>
              {obsUrlVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className={styles.hintText}>
            Add this URL as a Browser Source in OBS Studio / Streamlabs. Width 1920 · Height 1080.
          </p>
        </div>

        {/* Custom Banned Words Panel */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span><ShieldAlert size={16} /> BANNED WORDS CENSORSHIP</span>
          </div>
          <p className={styles.hintText}>
            Words in donation messages and donor names will be automatically censored. Global platform bans apply.
          </p>
          <div className={styles.bannedInputRow}>
            <input
              type="text"
              placeholder="Enter word to ban..."
              value={newBannedWord}
              onChange={(e) => setNewBannedWord(e.target.value)}
              className={styles.input}
            />
            <button type="button" className={styles.btnPrimary} onClick={handleAddBannedWord}>
              <Plus size={14} /> ADD
            </button>
          </div>
          <div className={styles.bannedChipsList}>
            {bannedWords.length === 0 ? (
              <span className={styles.emptyText}>No custom banned words added yet</span>
            ) : (
              bannedWords.map((word) => (
                <span key={word} className={styles.bannedChip}>
                  {word}
                  <button type="button" onClick={() => handleRemoveBannedWord(word)}>
                    <Trash2 size={12} />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ================= MAIN 2-COLUMN BOARD ================= */}
      <div className={styles.mainGrid}>
        {/* ================= LEFT COLUMN: VIEWPORT CANVAS & ACTION BAR ================= */}
        <div className={styles.leftColumn}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span>ON-SCREEN ALERT PREVIEW</span>
              <span className={styles.liveChip}>• LIVE OVERLAY MOCK</span>
            </div>

            {/* 16:9 Black Viewport Screen */}
            <div className={styles.viewportCanvas} style={{ backgroundColor: bgColor }}>
              {designMode && (
                <div className={styles.designModeGuides}>
                  <div className={styles.guideTop}>220px</div>
                  <div className={styles.guideCenter}>1372px</div>
                  <div className={styles.guideBottom}>295px</div>
                  <div className={styles.guideBox} />
                </div>
              )}

              {isTesting ? (
                <div
                  key={`alert-${previewKey}`}
                  className={`${styles.alertContainer} ${styles[alertAnimation]} ${
                    layout === "image_left" ? styles.alertContainerRow : ""
                  }`}
                >
                  {/* Media group: alert graphic + donor profile photo */}
                  <div className={layout === "image_left" ? styles.alertMediaGroup : styles.alertMediaGroupStacked}>
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt="Alert Asset"
                        className={styles.alertGraphic}
                        style={{ width: `${imageScale * 2}px` }}
                      />
                    )}

                    {showDonorAvatar && !hasAvatarTag && (
                      <div className={styles.avatarCircle} style={{ borderColor: highlightColor }}>
                        {isImageRef(selectedAvatar) ? (
                          <img src={selectedAvatar} alt="Donor avatar" className={styles.avatarImg} />
                        ) : (
                          <span className={styles.avatarEmoji}>{selectedAvatar}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Text group */}
                  <div
                    className={layout === "image_left" ? styles.alertTextColumn : styles.alertTextColumnStacked}
                    style={{ animation: `textDelayIn 0.4s ease ${textDelay}s both` }}
                  >
                    <div
                      className={`${styles.donorMessage} ${styles[textAnimation]}`}
                      style={{
                        color: textColor,
                        fontFamily: toStoredFont(fontFamily),
                        fontSize: `${Math.max(16, fontSize * 0.6)}px`,
                        fontWeight,
                      }}
                    >
                      {renderTemplatePreview()}
                    </div>

                    {customTestMessage && (
                      <div
                        className={styles.donorSubMessage}
                        style={{
                          color: textColor,
                          fontFamily: toStoredFont(fontFamily),
                          fontSize: `${Math.max(13, fontSize * 0.42)}px`,
                        }}
                      >
                        &quot;{customTestMessage}&quot;
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.idleStateText}>
                  [ CANVAS IDLE &ndash; CLICK &quot;TEST&quot; OR &quot;PREVIEW&quot; BELOW ]
                </div>
              )}
            </div>

            {/* CANVAS ACTION BAR (PLACED DIRECTLY UNDER THE SCREEN) */}
            <div className={styles.canvasActionBar}>
              {/* Currency Selector */}
              <div className={styles.actionGroup}>
                <span className={styles.actionLabel}>CURRENCY:</span>
                <div className={styles.toggleButtonGroup}>
                  <button
                    type="button"
                    className={currency === "USD" ? styles.toggleActive : styles.toggleBtn}
                    onClick={() => setCurrency("USD")}
                  >
                    USD
                  </button>
                  <button
                    type="button"
                    className={currency === "KHR" ? styles.toggleActive : styles.toggleBtn}
                    onClick={() => setCurrency("KHR")}
                  >
                    KHR
                  </button>
                </div>
              </div>

              {/* Quick Amount Chips */}
              <div className={styles.actionGroup}>
                <span className={styles.actionLabel}>AMOUNT:</span>
                <div className={styles.chipRow}>
                  {["$0.01", "$0.50", "$1", "$2", "$10"].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className={selectedAmount === amt ? styles.chipActive : styles.chipBtn}
                      onClick={() => setSelectedAmount(amt)}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Radio Scope Toggle */}
              <div className={styles.actionGroup}>
                <span className={styles.actionLabel}>SCOPE:</span>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === "selected"}
                    onChange={() => setScope("selected")}
                  />
                  Selected Setting
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                  />
                  All Settings
                </label>
              </div>

              {/* Trigger Buttons & Design Mode Switch */}
              <div className={styles.actionGroupEnd}>
                <button type="button" className={styles.btnPrimary} onClick={() => void handleTriggerTest("live")} disabled={testSending}>
                  {testSending ? <Loader2 size={14} className={styles.spinIcon} /> : <Play size={14} />} TEST
                </button>
                <button type="button" className={styles.btnSecondary} onClick={() => void handleTriggerTest("preview")}>
                  <Eye size={14} /> PREVIEW
                </button>

                <label className={styles.switchLabel}>
                  <input
                    type="checkbox"
                    checked={designMode}
                    onChange={(e) => setDesignMode(e.target.checked)}
                  />
                  <span>DESIGN MODE</span>
                </label>
              </div>
            </div>

            <p className={styles.hintText} style={{ marginTop: "12px" }}>
              Previews will only show here. To view events in your streaming software, save your settings then click the &quot;Test&quot; button above.
            </p>
          </div>

          {/* Custom Test Message Input Box */}
          <div className={styles.card} style={{ marginTop: "20px" }}>
            <div className={styles.cardHeader}>
              <span><Type size={16} /> CUSTOM TEST DONOR MESSAGE</span>
            </div>
            <textarea
              rows={2}
              className={styles.textarea}
              placeholder="Write anything here to test how donor messages render on screen..."
              value={customTestMessage}
              onChange={(e) => setCustomTestMessage(e.target.value)}
            />
          </div>
        </div>

        {/* ================= RIGHT COLUMN: FULL CUSTOMIZATION SIDEBAR ================= */}
        <div className={styles.rightSidebar}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>ALERT TYPES & CUSTOMIZATION</div>

            {/* Alert Types Tabs */}
            <div className={styles.tabRow}>
              <button
                type="button"
                className={alertType === "donation" ? styles.tabActive : styles.tabBtn}
                onClick={() => setAlertType("donation")}
              >
                DONATION
              </button>
              <button
                type="button"
                className={alertType === "supporter" ? styles.tabActive : styles.tabBtn}
                onClick={() => setAlertType("supporter")}
              >
                SUPPORTER
              </button>
            </div>

            {/* Alert Tiers */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>ALERT TIERS</label>
              <p className={styles.hintText}>
                A donation plays the highest tier whose minimum it clears. If it
                clears none, the Default profile below is used.
              </p>

              <div className={styles.profileRow}>
                <select
                  className={styles.select}
                  value={activeTierId ?? "__base__"}
                  onChange={(e) => selectTier(e.target.value === "__base__" ? null : e.target.value)}
                >
                  <option value="__base__">Default Setting (all donations)</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.min_amount_usd} USD / {t.min_amount_khr} KHR
                    </option>
                  ))}
                </select>
                {activeTierId ? (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    disabled={tierBusy}
                    onClick={() => void deleteTier(activeTierId)}
                  >
                    <Trash2 size={14} /> DELETE
                  </button>
                ) : null}
              </div>

              <div className={styles.imageInputRow} style={{ marginTop: 8 }}>
                <input
                  className={styles.input}
                  placeholder="Tier name, e.g. VIP"
                  value={tierName}
                  maxLength={40}
                  onChange={(e) => setTierName(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={tierBusy}
                  onClick={() => void createTier()}
                >
                  <Plus size={14} /> NEW
                </button>
              </div>

              <div className={styles.imageInputRow} style={{ marginTop: 8 }}>
                <label className={styles.label} style={{ flex: "0 0 auto" }}>
                  MIN
                </label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="1.00"
                  value={tierUsd}
                  onChange={(e) => setTierUsd(e.target.value)}
                />
                <span className={styles.hintText}>USD</span>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="1"
                  placeholder="4000"
                  value={tierKhr}
                  onChange={(e) => setTierKhr(e.target.value)}
                />
                <span className={styles.hintText}>KHR</span>
              </div>

              {activeTierId ? (
                <p className={styles.hintText}>
                  Editing <strong>{activeTierName}</strong>. Controls below save
                  to this tier only.
                </p>
              ) : null}
            </div>

            {/* Enabled Switch */}
            <div className={styles.controlGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                />
                <span>ENABLE ALERT SETTING</span>
              </label>
            </div>

            {/* Layout Selector */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>LAYOUT FORMAT</label>
              <select
                className={styles.select}
                value={layout}
                onChange={(e) => setLayout(e.target.value as "image_top" | "image_left")}
              >
                <option value="image_top">Image Above Text</option>
                <option value="image_left">Image Left, Text Right</option>
              </select>
            </div>

            {/* Image Asset: thumbnail + URL + upload + delete */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>IMAGE ASSET GRAPHIC</label>
              <div className={styles.imageInputRow}>
                {imageUrl && (
                  <span className={styles.imageThumb}>
                    <img
                      src={imageUrl}
                      alt=""
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </span>
                )}
                <input
                  type="text"
                  className={styles.input}
                  placeholder="https://example.com/alert.gif"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <input
                  type="file"
                  accept="image/*"
                  ref={imageInputRef}
                  style={{ display: "none" }}
                  onChange={handleImageUpload}
                />
                <button
                  type="button"
                  className={styles.btnSecondary}
                  title="Copy image link"
                  onClick={handleCopyImageUrl}
                  disabled={!imageUrl}
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  title="Upload image"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Upload size={14} />
                </button>
                {imageUrl && (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    title="Remove image"
                    onClick={() => setImageUrl("")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Image Scale Slider */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>IMAGE SCALE ({imageScale}%)</label>
              <input
                type="range"
                min="10"
                max="100"
                value={imageScale}
                className={styles.slider}
                onChange={(e) => setImageScale(Number(e.target.value))}
              />
            </div>

            {/* Donor Profile Toggle */}
            <div className={styles.controlGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showDonorAvatar}
                  onChange={(e) => setShowDonorAvatar(e.target.checked)}
                />
                <span>SHOW DONOR PROFILE PHOTO</span>
              </label>
              <p className={styles.hintText}>Show donor&apos;s profile photo in the alert. Add &#123;avatar&#125; to position it.</p>
            </div>

            {/* Donor Avatar Picker */}
            {showDonorAvatar && (
              <div className={styles.controlGroup}>
                <label className={styles.label}>DONOR PROFILE AVATAR</label>
                <div className={styles.avatarPresetGrid}>
                  {AVATAR_PRESETS.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      title={a.label}
                      className={selectedAvatar === a.emoji ? styles.avatarPresetActive : styles.avatarPresetBtn}
                      onClick={() => setSelectedAvatar(a.emoji)}
                    >
                      {a.emoji}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="...or paste custom avatar image URL"
                  value={isImageRef(selectedAvatar) ? selectedAvatar : ""}
                  onChange={(e) => setSelectedAvatar(e.target.value || "🦔")}
                  style={{ marginTop: 8 }}
                />
              </div>
            )}

            {/* Message Template Textarea */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>MESSAGE TEMPLATE</label>
              <textarea
                rows={2}
                className={styles.textarea}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              />
              <div className={styles.previewFormattedBox}>
                <span className={styles.label}>TEMPLATE PREVIEW:</span>
                <p>អរគុណ John សម្រាប់ការឧបត្ថម 10.00USD</p>
              </div>
            </div>

            {/* Read Message Aloud (TTS) */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>READ MESSAGE ALOUD (TTS)</label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={ttsEnabled}
                  onChange={(e) => setTtsEnabled(e.target.checked)}
                />
                <span>SPEAK THE MESSAGE TEMPLATE ON EACH ALERT</span>
              </label>
              <p className={styles.hintText}>
                Reads the message template above using your voice settings
                (language, pitch, speed) from the Voice Clone page.
              </p>
              {ttsEnabled ? null : (
                <p className={styles.hintText}>
                  Alerts stay silent. This is independent of the voice message
                  intro, which can still announce donor voice messages.
                </p>
              )}
            </div>

            {/* Voice Message Intro — global across every tier */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>VOICE MESSAGE INTRO</label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={voiceIntroEnabled}
                  onChange={(e) => setVoiceIntroEnabled(e.target.checked)}
                />
                <span>ANNOUNCE DONOR VOICE MESSAGES</span>
              </label>
              <textarea
                rows={2}
                className={styles.textarea}
                style={{ marginTop: 8 }}
                value={voiceIntroTemplate}
                onChange={(e) => setVoiceIntroTemplate(e.target.value)}
              />
              <p className={styles.hintText}>
                Plays the donor&apos;s recording at the start of their alert, before
                the message is read aloud. Unlike photos, voice messages are not
                held for approval, so anything a donor sends reaches the stream.
                Works even when Read Message Aloud is off, so lower tiers can stay
                silent while still hearing voice messages announced. Saved once for
                your whole account, so it applies to every tier automatically.
              </p>
            </div>

            {/* Alert Duration & Text Delay */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>ALERT DURATION ({alertDuration}S)</label>
              <input
                type="range"
                min="2"
                max="30"
                value={alertDuration}
                className={styles.slider}
                onChange={(e) => setAlertDuration(Number(e.target.value))}
              />
            </div>

            <div className={styles.controlGroup}>
              <label className={styles.label}>TEXT DELAY ({textDelay}S)</label>
              <input
                type="range"
                min="0"
                max="10"
                value={textDelay}
                className={styles.slider}
                onChange={(e) => setTextDelay(Number(e.target.value))}
              />
            </div>

            {/* Sound Preset Selector + Upload + Sound Volume */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>ALERT SOUND (SFX)</label>
              <div className={styles.imageInputRow}>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="https://example.com/alert.mp3"
                  value={selectedSoundUrl}
                  onChange={(e) => setSelectedSoundUrl(e.target.value)}
                />
                <input
                  type="file"
                  accept="audio/*"
                  ref={soundInputRef}
                  style={{ display: "none" }}
                  onChange={handleSoundUpload}
                />
                <button
                  type="button"
                  className={styles.btnSecondary}
                  title="Copy sound link"
                  onClick={handleCopySoundUrl}
                  disabled={!selectedSoundUrl}
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  title="Upload custom sound"
                  onClick={() => soundInputRef.current?.click()}
                >
                  <Upload size={14} />
                </button>
                {selectedSoundUrl && (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    title="Remove sound"
                    onClick={() => {
                      setCustomSounds((prev) => prev.filter((s) => s.url !== selectedSoundUrl));
                      setSelectedSoundUrl("");
                      showToast("Sound removed.");
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className={styles.khmerFontGrid}>
                <span className={styles.label} style={{ width: "100%", marginTop: "8px" }}>
                  SOUND PRESETS:
                </span>
                {soundOptions.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className={selectedSoundUrl === preset.url ? styles.khmerChipActive : styles.khmerChip}
                    onClick={() => setSelectedSoundUrl(preset.url)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.controlGroup}>
              <label className={styles.label}>SOUND VOLUME ({soundVolume}%)</label>
              <input
                type="range"
                min="0"
                max="100"
                value={soundVolume}
                className={styles.slider}
                onChange={(e) => setSoundVolume(Number(e.target.value))}
              />
            </div>

            {/* Font Family Selection + Khmer Font Grid */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>TYPOGRAPHY FONT</label>
              <select
                className={styles.select}
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
              >
                <optgroup label="Khmer & Suggested Fonts">
                  {KHMER_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </optgroup>
                <optgroup label="Standard Fonts">
                  <option value="Rajdhani">Rajdhani (Control Room)</option>
                  <option value="Inter">Inter</option>
                  <option value="Courier New">Courier New</option>
                </optgroup>
              </select>

              {/* Clickable Khmer Presets Grid */}
              <div className={styles.khmerFontGrid}>
                <span className={styles.label} style={{ width: "100%", marginTop: "8px" }}>
                  KHMER FONT PRESETS:
                </span>
                {KHMER_FONTS.map((font) => (
                  <button
                    key={font}
                    type="button"
                    className={fontFamily === font ? styles.khmerChipActive : styles.khmerChip}
                    style={{ fontFamily: toStoredFont(font) }}
                    onClick={() => setFontFamily(font)}
                  >
                    {font}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size & Weight */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>FONT SIZE ({fontSize}PX)</label>
              <input
                type="range"
                min="16"
                max="72"
                value={fontSize}
                className={styles.slider}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </div>

            <div className={styles.controlGroup}>
              <label className={styles.label}>FONT WEIGHT</label>
              <select
                className={styles.select}
                value={fontWeight}
                onChange={(e) => setFontWeight(e.target.value)}
              >
                <option value="400">Regular (400)</option>
                <option value="600">SemiBold (600)</option>
                <option value="700">Bold (700)</option>
                <option value="800">ExtraBold (800)</option>
              </select>
            </div>

            {/* Color Pickers */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>COLOR SELECTIONS</label>
              <div className={styles.colorRowGrid}>
                <div className={styles.colorField}>
                  <span className={styles.colorLabel} style={{ color: textColor }}>TEXT COLOR</span>
                  <div className={styles.colorInputBox}>
                    <input
                      type="text"
                      className={styles.inputHex}
                      style={{ color: textColor }}
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                    />
                    <input
                      type="color"
                      className={styles.colorPickerNative}
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.colorField}>
                  <span className={styles.colorLabel} style={{ color: highlightColor }}>HIGHLIGHT COLOR</span>
                  <div className={styles.colorInputBox}>
                    <input
                      type="text"
                      className={styles.inputHex}
                      style={{ color: highlightColor }}
                      value={highlightColor}
                      onChange={(e) => setHighlightColor(e.target.value)}
                    />
                    <input
                      type="color"
                      className={styles.colorPickerNative}
                      value={highlightColor}
                      onChange={(e) => setHighlightColor(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.colorField}>
                  <span className={styles.colorLabel} style={{ color: bgColor === "#000000" ? "#94A3B8" : bgColor }}>BACKGROUND COLOR</span>
                  <div className={styles.colorInputBox}>
                    <input
                      type="text"
                      className={styles.inputHex}
                      style={{ color: bgColor === "#000000" ? "#94A3B8" : bgColor }}
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                    />
                    <input
                      type="color"
                      className={styles.colorPickerNative}
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Animation Options */}
            <div className={styles.controlGroup}>
              <label className={styles.label}>ALERT CONTAINER ANIMATION</label>
              <select
                className={styles.select}
                value={alertAnimation}
                onChange={(e) => setAlertAnimation(e.target.value)}
              >
                <option value="bounceIn">Bounce In</option>
                <option value="fadeIn">Fade In</option>
                <option value="zoomIn">Zoom In</option>
                <option value="slideUp">Slide Up</option>
                <option value="flip">Flip</option>
                <option value="pulseGlow">Pulse Glow</option>
              </select>
            </div>

            <div className={styles.controlGroup}>
              <label className={styles.label}>TEXT ANIMATION</label>
              <select
                className={styles.select}
                value={textAnimation}
                onChange={(e) => setTextAnimation(e.target.value)}
              >
                <option value="wiggle">Wiggle</option>
                <option value="pulse">Pulse</option>
                <option value="typing">Typing</option>
                <option value="bounce">Bounce</option>
              </select>
            </div>

            {/* Feedback */}
            {saveErr && <p className={styles.hintText} style={{ color: "#EF4444" }}>{saveErr}</p>}
            {saveMsg && <p className={styles.hintText} style={{ color: "#10B981" }}>{saveMsg}</p>}

            {/* Sticky Save Button */}
            <div className={styles.stickySaveBar}>
              <button
                type="button"
                className={styles.btnSave}
                onClick={() => void handleSave()}
                disabled={saving || !settingsLoaded}
              >
                {saving && <Loader2 size={16} className={styles.spinIcon} />}
                {saving ? "SAVING..." : "SAVE SETTINGS"}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Success toast (bottom-left) */}
      {toast && (
        <div className={styles.toast} role="status">
          <span className={styles.toastIcon}>
            <Check size={13} />
          </span>
          <div>
            <div className={styles.toastTitle}>Success</div>
            <div className={styles.toastMsg}>{toast}</div>
          </div>
        </div>
      )}
    </div>
  );
}