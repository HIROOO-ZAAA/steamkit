"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Content";
import { SecondaryButton } from "@/components/ui/Button";
import styles from "./LandingPreview.module.css";

export default function LandingPreview() {
  const [showAlert, setShowAlert] = useState(false);

  function triggerPreview() {
    setShowAlert(true);
    window.setTimeout(() => setShowAlert(false), 3200);
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
          <span>Kit Steam / OVERLAY PREVIEW</span>
        </div>
        <Badge variant="gray">DEMO</Badge>
      </div>
      <div className={styles.canvas}>
        <div className={styles.canvasMeta}>
          <span>1920 × 1080</span>
          <span>TRANSPARENT SOURCE</span>
        </div>
        {showAlert ? (
          <div className={styles.alertSample} role="status" aria-live="polite">
            <span className={styles.alertKicker}>SAMPLE SUPPORT EVENT</span>
            <strong>Thanks for supporting the stream.</strong>
            <span className={styles.alertAmount}>
              $5.00 <small>USD</small>
            </span>
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
            <strong>Ready for a preview</strong>
            <span>Trigger a sample alert to see the overlay state.</span>
          </div>
        )}
      </div>
      <div className={styles.frameFooter}>
        <div>
          <span className={styles.eventDot} /> ALERT / SOUND / TTS
        </div>
        <SecondaryButton size="sm" onClick={triggerPreview}>
          Preview alert
        </SecondaryButton>
      </div>
    </Panel>
  );
}
