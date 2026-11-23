"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Play, Monitor, X } from "lucide-react";
import Image from "next/image";
import styles from "./multi-stream-overlay.module.css";

type Stream = {
  id: string;
  username: string;
  youtube_channel_id: string;
  youtube_video_id: string | null;
  live_status: "live" | "upcoming" | "none";
  viewer_count: number;
  thumbnail_url: string;
};

export default function MultiStreamOverlay({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let disposed = false;
    let pollTimer: number | null = null;

    async function init() {
      try {
        const { data: resolved, error: resolveError } = await supabase.rpc(
          "streamkit_resolve_overlay",
          { p_token: token },
        );
        if (resolveError || !resolved) {
          if (!disposed) {
            setError(true);
            setLoading(false);
          }
          return;
        }
        const overlay = Array.isArray(resolved) ? resolved[0] : resolved;
        if (!overlay?.creator_id) {
          if (!disposed) {
            setError(true);
            setLoading(false);
          }
          return;
        }

        async function fetchStreams() {
          try {
            const { data, error: streamsError } = await supabase
              .from("streams")
              .select("id, username, youtube_channel_id, youtube_video_id, live_status, viewer_count, thumbnail_url")
              .eq("creator_id", overlay.creator_id)
              .order("live_status", { ascending: false });

            if (streamsError || !data) return;
            if (!disposed) {
              setStreams(data as Stream[]);
            }
          } catch {
            // Poll failure is non-fatal
          }
        }

        await fetchStreams();
        if (!disposed) setLoading(false);

        pollTimer = window.setInterval(fetchStreams, 30000);
      } catch {
        if (!disposed) {
          setError(true);
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      disposed = true;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [supabase, token]);

  const handleStreamClick = (stream: Stream) => {
    if (stream.live_status === "live" && stream.youtube_video_id) {
      setSelectedStream(stream);
    }
  };

  if (loading) {
    return (
      <div className={styles.overlay} style={{ background: "transparent" }}>
        <p className={styles.multiStreamEmpty}>Loading streams…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.overlay} style={{ background: "transparent" }}>
        <p className={styles.multiStreamEmpty}>⚠ Could not load streams. Check overlay token.</p>
      </div>
    );
  }

  const liveStreams = streams.filter((s) => s.live_status === "live");
  const upcomingStreams = streams.filter((s) => s.live_status === "upcoming");

  if (selectedStream) {
    return (
      <div className={styles.overlay} style={{ background: "transparent" }}>
        <div className={styles.multiStreamPlayer}>
          <div className={styles.playerHeader}>
            <h3>{selectedStream.username} — LIVE</h3>
            <button
              className={styles.closeBtn}
              onClick={() => setSelectedStream(null)}
              aria-label="Close stream"
            >
              <X size={20} />
            </button>
          </div>
          <iframe
            className={styles.playerIframe}
            src={`https://www.youtube.com/embed/${selectedStream.youtube_video_id}?autoplay=1&mute=1`}
            title={`${selectedStream.username} live stream`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} style={{ background: "transparent" }}>
      <div className={styles.multiStreamGrid}>
        {liveStreams.length === 0 && upcomingStreams.length === 0 ? (
          <p className={styles.multiStreamEmpty}>No streams registered yet.</p>
        ) : (
          <>
            {liveStreams.length > 0 && (
              <div className={styles.streamSection}>
                <h4 className={styles.sectionTitle}>LIVE NOW</h4>
                <div className={styles.streamRow}>
                  {liveStreams.map((stream) => (
                    <div
                      key={stream.id}
                      className={styles.streamCard}
                      onClick={() => handleStreamClick(stream)}
                    >
                      <Image
                        src={stream.thumbnail_url || `https://img.youtube.com/vi/${stream.youtube_video_id}/hqdefault.jpg`}
                        alt={`${stream.username} thumbnail`}
                        className={styles.streamThumbnail}
                        width={320}
                        height={180}
                      />
                      <div className={styles.streamLiveBadge}>
                        <Play size={12} />
                        LIVE
                      </div>
                      <div className={styles.streamInfo}>
                        <span className={styles.streamName}>{stream.username}</span>
                        <span className={styles.streamViewers}>
                          <Monitor size={12} />
                          {stream.viewer_count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {upcomingStreams.length > 0 && (
              <div className={styles.streamSection}>
                <h4 className={styles.sectionTitle}>UPCOMING</h4>
                <div className={styles.streamRow}>
                  {upcomingStreams.map((stream) => (
                    <div key={stream.id} className={styles.streamCard} style={{ opacity: 0.6 }}>
                      <Image
                        src={stream.thumbnail_url || `https://img.youtube.com/vi/${stream.youtube_video_id}/hqdefault.jpg`}
                        alt={`${stream.username} thumbnail`}
                        className={styles.streamThumbnail}
                        width={320}
                        height={180}
                      />
                      <div className={styles.streamUpcomingBadge}>UPCOMING</div>
                      <div className={styles.streamInfo}>
                        <span className={styles.streamName}>{stream.username}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}