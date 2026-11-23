"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./OfflineNotice.module.css";

export default function OfflineNotice() {
  const [offline, setOffline] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className={styles.notice} role="status" aria-live="polite">
      <WifiOff size={16} aria-hidden="true" />
      <span>
        You are offline. Cached parts of the dashboard may still be visible, but new data
        and actions need a connection.
      </span>
    </div>
  );
}
