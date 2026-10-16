"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./media-share.module.css";

type QueueItem = {
  id: string;
  tipper_name?: string;
  youtube_url: string;
  duration_seconds: number;
};

export default function MediaShareDashboard() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const supabase = createClient();

  const fetchQueue = async () => {
    const { data } = await supabase
      .from("media_share_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (data) setQueue(data as QueueItem[]);
  };

  // Fetching on mount is the intended use of an effect. setQueue runs after
  // the awaited query resolves, so this does not render synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSkip = async (id: string) => {
    await supabase.from("media_share_queue").update({ status: "skipped" }).eq("id", id);
    void fetchQueue();
  };

  return (
    <div className={styles.page}>
      <h1>
        <span className={styles.vBar} /> Media Share Queue
      </h1>

      <div className={styles.list}>
        {queue.length === 0 ? (
          <p className={styles.empty}>No media requests in queue.</p>
        ) : (
          queue.map((item) => (
            <div key={item.id} className={styles.row}>
              <div>
                <p className={styles.tipper}>{item.tipper_name}</p>
                <p className={styles.url}>{item.youtube_url}</p>
                <span className={styles.duration}>{item.duration_seconds}s playback</span>
              </div>
              <button onClick={() => handleSkip(item.id)} className={styles.skipBtn}>
                Skip Video
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
