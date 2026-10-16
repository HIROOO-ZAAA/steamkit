"use client";

import { useEffect, useState } from "react";

export default function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
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
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "Rajdhani, sans-serif", letterSpacing: "1px" }}>{date}</div>
      <div style={{ fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: "1.6rem", lineHeight: 1.1, color: "var(--text-primary)" }}>{time}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--color-primary)", letterSpacing: "2px", fontFamily: "Rajdhani, sans-serif" }}>ICT</div>
    </div>
  );
}
