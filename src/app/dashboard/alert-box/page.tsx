"use client";

import { useState, useCallback } from "react";
import { Copy, Save, Play, X, Volume2, Image, Type } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./AlertBox.module.css";

export default function AlertBoxSettings() {
  const [supabase] = useState(() => createClient());

  const [obsUrl] = useState(
    "https://streamkit.dev/creator/42/alertbox/overlay?token=sk_live_992a88f"
  );
  const [copyText, setCopyText] = useState("Copy");
  const [template, setTemplate] = useState(
    "Thank you {name} for donated {amount}$\n{message}"
  );
  const [alertDuration, setAlertDuration] = useState(10);
  const [textDelay, setTextDelay] = useState(2);
  const [soundVolume, setSoundVolume] = useState(80);
  const [font, setFont] = useState("Rajdhani");
  const [fontSize, setFontSize] = useState(32);
  const [textColor, setTextColor] = useState("#F8FAFC");
  const [highlightColor, setHighlightColor] = useState("#F59E0B");
  const [layout, setLayout] = useState("image_left");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(obsUrl);
    setCopyText("Copied!");
    setTimeout(() => setCopyText("Copy"), 2000);
  }, [obsUrl]);

  const handleTestAlert = useCallback(() => {
    setIsPreviewing(true);
    setTimeout(() => setIsPreviewing(false), alertDuration * 1000);
  }, [alertDuration]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { error: upsertError } = await supabase
        .from("alertbox_settings")
        .upsert({
          user_id: user.id,
          template,
          alert_duration: alertDuration,
          text_delay: textDelay,
          sound_volume: soundVolume,
          font,
          font_size: fontSize,
          text_color: textColor,
          highlight_color: highlightColor,
          layout,
        });

      if (upsertError) throw upsertError;

      setMessage("AlertBox settings saved successfully!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>ALERTBOX SETTINGS</h1>
        <p className={styles.pageSubtitle}>Configure on-screen alert animations, styling, and OBS integration</p>
      </header>

      <div className={styles.obsBanner}>
        <label className={styles.label}>OBS BROWSER SOURCE WIDGET URL</label>
        <div className={styles.obsUrlBox}>
          <input
            type="text"
            readOnly
            value={obsUrl}
            className={styles.urlInput}
            aria-label="OBS Browser Source URL"
          />
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleCopyUrl}
            aria-label="Copy OBS URL to clipboard"
          >
            <Copy size={16} />
            <span>{copyText}</span>
          </button>
        </div>
        <p className={styles.bannerSubtext}>
          Add this URL as a Browser Source in OBS Studio / Streamlabs to render live alerts on your stream.
        </p>
      </div>

      <div className={styles.mainBoard}>
        <div className={styles.previewSection}>
          <div className={styles.sectionHeader}>
            <span>OBS CANVAS PREVIEW</span>
            <span className={styles.viewportMeta}>1920x1080 (16:9)</span>
          </div>

          <div className={styles.viewportCanvas}>
            {isPreviewing ? (
              <div
                className={styles.alertOverlay}
                style={{
                  flexDirection: layout === "image_left" ? "row" : "column",
                }}
                role="alert"
                aria-live="polite"
              >
                <img
                  src="https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=300"
                  alt="Alert graphic placeholder"
                  className={styles.alertGraphic}
                />
                <div
                  className={styles.alertTextGroup}
                  style={{
                    fontFamily: font,
                    fontSize: `${fontSize}px`,
                    color: textColor,
                  }}
                >
                  <div>
                    Thank you{" "}
                    <span style={{ color: highlightColor }}>fytlh</span>
                  </div>
                  <div>
                    for donated{" "}
                    <span style={{ color: highlightColor }}>2$</span>
                  </div>
                  <div style={{ color: highlightColor, fontSize: "20px" }}>
                    I love StreamKit! ❤️
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.idleCanvasText}>
                [ CANVAS IDLE &ndash; CLICK &quot;TEST&quot; TO PREVIEW OVERLAY ]
              </div>
            )}
          </div>

          <div className={styles.canvasActions}>
            <select className={styles.selectCompact} aria-label="Select alert type to preview">
              <option value="donation">DONATION ALERT</option>
              <option value="supporter">SUPPORTER ALERT</option>
              <option value="subscriber">SUBSCRIBER ALERT</option>
              <option value="bits">BITS / CHEERS</option>
              <option value="raid">RAID ALERT</option>
            </select>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleTestAlert}
              disabled={isPreviewing}
            >
              {isPreviewing ? (
                <>
                  <div className={styles.spinner} />
                  TESTING...
                </>
              ) : (
                <>
                  <Play size={16} />
                  TEST ALERT SIGNAL
                </>
              )}
            </button>
          </div>
          <p className={styles.bannerSubtext} style={{ marginTop: "12px" }}>
            Previews only show here. To view events in your streaming software, save settings then click &quot;Test Alert Signal&quot;.
          </p>
        </div>

        <aside className={styles.controlsSidebar}>
          <div className={styles.sectionHeader}>ALERT CONFIGURATION</div>

          {error && <div className={styles.alertError}>{error}</div>}
          {message && <div className={styles.alertSuccess}>{message}</div>}

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="layout">LAYOUT FORMAT</label>
            <select
              id="layout"
              className={styles.select}
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
            >
              <option value="image_left">IMAGE LEFT, TEXT RIGHT</option>
              <option value="image_top">IMAGE TOP, TEXT BOTTOM</option>
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="template">MESSAGE TEMPLATE</label>
            <textarea
              id="template"
              rows={3}
              className={styles.textarea}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Use {name}, {amount}, {message} placeholders"
            />
            <p className={styles.helperText}>Available: &#123;name&#125;, &#123;amount&#125;, &#123;currency&#125;, &#123;message&#125;, &#123;tier&#125;</p>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="alertDuration">ALERT DURATION ({alertDuration}s)</label>
            <input
              id="alertDuration"
              type="range"
              min="2"
              max="30"
              value={alertDuration}
              className={styles.slider}
              onChange={(e) => setAlertDuration(Number(e.target.value))}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="textDelay">TEXT DELAY ({textDelay}s)</label>
            <input
              id="textDelay"
              type="range"
              min="0"
              max="10"
              value={textDelay}
              className={styles.slider}
              onChange={(e) => setTextDelay(Number(e.target.value))}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="soundVolume">SOUND VOLUME ({soundVolume}%)</label>
            <input
              id="soundVolume"
              type="range"
              min="0"
              max="100"
              value={soundVolume}
              className={styles.slider}
              onChange={(e) => setSoundVolume(Number(e.target.value))}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="font">FONT FAMILY</label>
            <select
              id="font"
              className={styles.select}
              value={font}
              onChange={(e) => setFont(e.target.value)}
            >
              <option value="Rajdhani">RAJDHANI (CONTROL ROOM DISPLAY)</option>
              <option value="Inter">INTER (SANS-SERIF)</option>
              <option value="Courier New">COURIER NEW (MONOSPACE)</option>
              <option value="Orbitron">ORBITRON (FUTURISTIC)</option>
              <option value="Share Tech Mono">SHARE TECH MONO (TECHNICAL)</option>
            </select>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="fontSize">FONT SIZE ({fontSize}px)</label>
            <input
              id="fontSize"
              type="range"
              min="16"
              max="60"
              value={fontSize}
              className={styles.slider}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="textColor">TEXT COLOR</label>
            <div className={styles.colorInputRow}>
              <input
                id="textColor"
                type="color"
                className={styles.colorInput}
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
              />
              <input
                type="text"
                className={styles.input}
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                style={{ width: "100px" }}
              />
            </div>
          </div>

          <div className={styles.controlGroup}>
            <label className={styles.label} htmlFor="highlightColor">TEXT HIGHLIGHT COLOR</label>
            <div className={styles.colorInputRow}>
              <input
                id="highlightColor"
                type="color"
                className={styles.colorInput}
                value={highlightColor}
                onChange={(e) => setHighlightColor(e.target.value)}
              />
              <input
                type="text"
                className={styles.input}
                value={highlightColor}
                onChange={(e) => setHighlightColor(e.target.value)}
                style={{ width: "100px" }}
              />
            </div>
          </div>

          <div className={styles.saveBar}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className={styles.spinner} />
                  SAVING...
                </>
              ) : (
                <>
                  <Save size={16} />
                  SAVE SETTINGS
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}