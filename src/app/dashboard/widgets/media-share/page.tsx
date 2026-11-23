"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { mediaShareQueueState } from "@/lib/dashboard/media-share-queue-state";
import styles from "./media-share.module.css";

type QueueItem = {
  id: string;
  tipper_name?: string;
  youtube_url: string;
  duration_seconds: number;
};

export default function MediaShareDashboard() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [skippingId, setSkippingId] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch("/api/dashboard/media-share/queue", {
        cache: "no-store",
      });
      if (!response.ok) {
        setLoadError(true);
        return;
      }
      const payload = (await response.json()) as { items?: unknown };
      if (!Array.isArray(payload.items)) throw new Error("Invalid queue response");
      setQueue(payload.items as QueueItem[]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void fetchQueue(), 0);
    return () => window.clearTimeout(initialFetch);
  }, [fetchQueue]);

  const handleSkip = async (id: string) => {
    if (skippingId) return;
    setActionError(false);
    setSkippingId(id);
    try {
      const response = await fetch(
        `/api/dashboard/media-share/queue/${encodeURIComponent(id)}/skip`,
        { method: "POST", cache: "no-store" },
      );
      if (!response.ok) {
        setActionError(true);
        return;
      }
      await fetchQueue();
    } catch {
      setActionError(true);
    } finally {
      setSkippingId(null);
    }
  };

  const queueState = mediaShareQueueState(loading, loadError, queue.length);

  return (
    <div className={styles.page}>
      <h1>
        <span className={styles.vBar} /> Media Share Queue
      </h1>

      <div className={styles.toolbar}>
        <p>Refresh to check the pending queue. This page does not report OBS playback.</p>
        <button type="button" className={styles.refreshBtn} onClick={() => void fetchQueue()} disabled={loading}>
          <RefreshCw size={14} className={loading ? styles.refreshing : ""} aria-hidden="true" />
          {loading ? "Checking" : "Refresh queue"}
        </button>
      </div>

      {actionError ? <p className={styles.error} role="alert">Could not skip this request. Try again.</p> : null}

      <div className={styles.list} aria-label="Pending media requests" aria-live="polite" aria-busy={loading}>
        {queueState === "loading" ? (
          <p className={styles.empty} role="status">Loading media requests…</p>
        ) : queueState === "error" ? (
          <div className={styles.errorState} role="alert">
            <p>Media requests could not be loaded.</p>
            <button type="button" className={styles.refreshBtn} onClick={() => void fetchQueue()}>Retry</button>
          </div>
        ) : queueState === "empty" ? (
          <p className={styles.empty} role="status">No media requests in queue.</p>
        ) : queueState === "ready" ? (
          queue.map((item) => (
            <div key={item.id} className={styles.row}>
              <div>
                <p className={styles.tipper}>{item.tipper_name}</p>
                <p className={styles.url}>{item.youtube_url}</p>
                <span className={styles.duration}>{item.duration_seconds}s playback</span>
              </div>
              <button
                type="button"
                onClick={() => void handleSkip(item.id)}
                className={styles.skipBtn}
                disabled={skippingId !== null}
                aria-label={`${skippingId === item.id ? "Skipping" : "Skip"} video request from ${item.tipper_name || "supporter"}`}
              >
                {skippingId === item.id ? "Skipping…" : "Skip Video"}
              </button>
            </div>
          ))
        ) : null}
      </div>
    </div>
  );
}
