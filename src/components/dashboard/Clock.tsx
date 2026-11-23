"use client";

import { useEffect, useState } from "react";
import styles from "./Clock.module.css";

export default function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Phnom_Penh" });
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className={styles.clock}>
      <span className={styles.date} suppressHydrationWarning>
        {date}
      </span>
      <span className={styles.time} suppressHydrationWarning>
        {time}
      </span>
      <span className={styles.zone}>ICT</span>
    </div>
  );
}
