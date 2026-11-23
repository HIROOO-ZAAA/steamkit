"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MediaShareItem, MediaShareSSEPayload } from "@/lib/mediashare/sse";
import styles from "./media-share.module.css";

interface OverlaySearchParams {
  token?: string;
  creator_id?: string;
}

export default function MediaShareOverlayPage({
  searchParams,
}: {
  searchParams: Promise<OverlaySearchParams>;
}) {
  const { token = "", creator_id = "" } = use(searchParams);
  const [supabase] = useState(() => createClient());
  const [creatorId, setCreatorId] = useState<string>(creator_id);
  const [currentVideo, setCurrentVideo] = useState<MediaShareItem | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Keep ref to avoid stale closures in SSE and polling
  const currentVideoRef = useRef<MediaShareItem | null>(null);

  useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);

  // 1. Resolve Creator ID from token if not explicitly provided
  useEffect(() => {
    if (creatorId || !token) return;

    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("streamkit_resolve_overlay", {
          p_token: token,
        });
        const resolved = (data as { creator_id?: string }[] | null)?.[0];
        if (!cancelled && !error && resolved?.creator_id) {
          setCreatorId(resolved.creator_id);
        }
      } catch {
        // Fallback to query
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, token, creatorId]);

  // 2. Fetch queue from API
  const fetchQueue = useCallback(async () => {
    if (!token && !creatorId) return;

    try {
      const url = token
        ? `/api/mediashare/queue?token=${encodeURIComponent(token)}`
        : `/api/mediashare/queue?creatorId=${encodeURIComponent(creatorId)}`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      if (Array.isArray(data.items)) {
        // If no video is currently playing, pick the first pending item
        if (!currentVideoRef.current) {
          const next = data.current || data.items.find((i: MediaShareItem) => i.status === "pending" || i.status === "playing");
          if (next) {
            setCurrentVideo(next);
            setElapsedSeconds(0);
          }
        }
      }
    } catch {
      // Ignore network errors in OBS overlay
    }
  }, [token, creatorId]);

  // 3. Mark current video as completed / played
  const advanceVideo = useCallback(
    async (item: MediaShareItem, action: "played" | "skip" = "played") => {
      try {
        await fetch("/api/mediashare/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            id: item.id,
            token,
            creator_id: creatorId,
          }),
        });
      } catch {
        // Continue advancing even if server update fails
      }

      setCurrentVideo(null);
      setElapsedSeconds(0);
      void fetchQueue();
    },
    [token, creatorId, fetchQueue]
  );

  // 4. Countdown timer for current playing video
  useEffect(() => {
    if (!currentVideo) return;

    const maxDuration = Math.max(1, currentVideo.duration_seconds || 180);
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= maxDuration) {
          clearInterval(interval);
          void advanceVideo(currentVideo, "played");
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentVideo, advanceVideo]);

  // 5. Connect to SSE events
  useEffect(() => {
    if (!token && !creatorId) return;

    const sseUrl = token
      ? `/api/mediashare/events?token=${encodeURIComponent(token)}`
      : `/api/mediashare/events?creator_id=${encodeURIComponent(creatorId)}`;

    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(sseUrl);

      eventSource.addEventListener("media_share", (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data) as MediaShareSSEPayload;
          if (payload.type === "skip" && payload.id) {
            if (currentVideoRef.current?.id === payload.id) {
              setCurrentVideo(null);
              setElapsedSeconds(0);
              void fetchQueue();
            }
          } else if (payload.type === "play" && payload.item) {
            setCurrentVideo(payload.item as MediaShareItem);
            setElapsedSeconds(0);
          } else if (payload.type === "queue_added" || payload.type === "queue_updated") {
            void fetchQueue();
          }
        } catch {
          // Ignore invalid SSE payload
        }
      });
    } catch {
      // Fall back to polling
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [token, creatorId, fetchQueue]);

  // 6. Polling backup (every 3 seconds) for bulletproof OBS reliability
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchQueue();
    }, 0);
    const pollInterval = setInterval(() => {
      void fetchQueue();
    }, 3000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollInterval);
    };
  }, [fetchQueue]);

  // When no video is playing, remain completely transparent for OBS
  if (!currentVideo) {
    return <div className={styles.idleContainer} aria-hidden="true" />;
  }

  const duration = Math.max(1, currentVideo.duration_seconds || 180);
  const remaining = Math.max(0, duration - elapsedSeconds);
  const progressPercent = Math.min(100, Math.round((elapsedSeconds / duration) * 100));

  const minutesRemaining = Math.floor(remaining / 60);
  const secondsRemaining = String(remaining % 60).padStart(2, "0");
  const timeFormatted = `${minutesRemaining}:${secondsRemaining}`;

  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    currentVideo.youtube_video_id
  )}?autoplay=1&enablejsapi=1&controls=0&modestbranding=1&rel=0`;

  return (
    <div className={styles.overlayContainer}>
      <div className={styles.playerWrapper}>
        <iframe
          className={styles.videoFrame}
          src={embedUrl}
          title={currentVideo.title || "Media Share Video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />

        <div className={styles.donorBanner}>
          <div className={styles.bannerRow}>
            <span className={styles.tipperTag}>
              {currentVideo.tipper_name || "Anonymous Supporter"}
            </span>
            <span className={styles.timeDisplay}>-{timeFormatted}</span>
          </div>

          <div className={styles.bannerRow}>
            <span className={styles.videoTitle}>
              {currentVideo.title || "YouTube Video"}
            </span>
          </div>

          <div className={styles.progressBarContainer}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
