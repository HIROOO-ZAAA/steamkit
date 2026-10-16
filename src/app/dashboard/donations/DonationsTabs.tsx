"use client";

import { useState } from "react";
import styles from "./donations.module.css";

export default function DonationsTabs({
  usd,
  khr,
  aba,
  bakong,
}: {
  usd: number;
  khr: number;
  aba: number;
  bakong: number;
}) {
  const [tab, setTab] = useState<"USD" | "KHR" | "TOTAL">("USD");
  const fmtUsd = (v: number) => `$${v.toFixed(2)}`;
  const fmtKhr = (v: number) => `៛${v.toLocaleString()}`;

  const total =
    tab === "USD" ? fmtUsd(usd) : tab === "KHR" ? fmtKhr(khr) : fmtUsd(usd + khr / 4100);
  const abaLabel = tab === "KHR" ? fmtKhr(aba * 4100) : fmtUsd(aba);
  const bakongLabel = tab === "KHR" ? fmtKhr(bakong * 4100) : fmtUsd(bakong);

  return (
    <div className={styles.statsBox}>
      <div className={styles.statsTabs}>
        {(["USD", "KHR"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={styles.statsCells}>
        <div>
          <span className={styles.statLabel}>TOTAL</span>
          <strong className={styles.bigNum}>{total}</strong>
        </div>
        <div>
          <span className={styles.statLabel}>ABA</span>
          <strong className={styles.bigNum}>{abaLabel}</strong>
        </div>
        <div>
          <span className={styles.statLabel}>BAKONG</span>
          <strong className={styles.bigNum}>{bakongLabel}</strong>
        </div>
      </div>
    </div>
  );
}
