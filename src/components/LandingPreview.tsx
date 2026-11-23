"use client";

import { useEffect, useRef, useState } from "react";
import { Mic2, MonitorPlay, Play, Volume2 } from "lucide-react";
import { Panel } from "@/components/ui/Content";
import { SecondaryButton } from "@/components/ui/Button";
import styles from "./LandingPreview.module.css";

export default function LandingPreview() {
  const [showAlert, setShowAlert] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function triggerPreview() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    setShowAlert(true);
    timerRef.current = window.setTimeout(() => {
      setShowAlert(false);
      timerRef.current = null;
    }, 3600);
  }

  return (
    <Panel
      className={styles.preview}
      aria-label="Interactive sample OBS overlay preview"
    >
      <div className={styles.frameHeader}>
        <div className={styles.frameTitle}>
          <span className={styles.windowMarks} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>LIVE OVERLAY PREVIEW</span>
        </div>
        <span className={styles.demoBadge}>SAMPLE</span>
      </div>

      <div className={styles.canvas}>
        <div className={styles.canvasMeta}>
          <span>OBS / 1920 x 1080</span>
          <span>TRANSPARENT SOURCE</span>
        </div>

        <div className={styles.stage}>
          {showAlert ? (
            <div className={styles.alertSample} role="status" aria-live="polite">
              <span className={styles.alertKicker}>NEW SUPPORT EVENT</span>
              <strong className={styles.alertName}>Sokha</strong>
              <p className={styles.alertMessage}>Thanks for the support!</p>
              <span className={styles.alertAmount}>
                $5.00 <small>USD</small>
              </span>
              <div className={styles.alertChannels}>
                <span>
                  <Volume2 size={12} aria-hidden="true" />
                  Sound
                </span>
                <span>
                  <Mic2 size={12} aria-hidden="true" />
                  Voice
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.idleState}>
              <span className={styles.signalMark} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className={styles.idleKicker}>ALERT CHANNEL READY</span>
              <strong>Your stream, in focus.</strong>
              <span>Trigger a sample alert to preview the overlay state.</span>
            </div>
          )}
        </div>

        <div className={styles.canvasFooter}>
          <span>
            <i className={styles.statusDot} aria-hidden="true" />
            PREVIEW READY
          </span>
          <span>ALERT / GOAL / LEADERBOARD</span>
        </div>
      </div>

      <div className={styles.frameFooter}>
        <span className={styles.frameMeta}>
          <MonitorPlay size={14} aria-hidden="true" />
          Paste a browser-source URL into OBS
        </span>
        <SecondaryButton size="sm" onClick={triggerPreview}>
          <Play size={13} aria-hidden="true" />
          Trigger sample
        </SecondaryButton>
      </div>
    </Panel>
  );
}
