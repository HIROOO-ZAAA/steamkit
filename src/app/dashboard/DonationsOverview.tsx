"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import styles from "./dashboard.module.css";

type Totals = { aba: number; bakong: number };

export default function DonationsOverview({
  usd,
  khr,
}: {
  usd: Totals;
  khr: Totals;
}) {
  const [tab, setTab] = useState<"USD" | "KHR">("USD");
  const active = tab === "USD" ? usd : khr;
  const fmt = (v: number) =>
    tab === "USD" ? `$${v.toFixed(2)}` : `៛${v.toLocaleString()}`;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h3>
            <span className={styles.vBar} /> Donations Overview
          </h3>
          <p className={styles.cardMeta}>Daily donations by payment method</p>
        </div>
        <div className={styles.curveSide}>
          <div className={styles.tabs}>
            <button
              type="button"
              onClick={() => setTab("USD")}
              className={`${styles.tab} ${tab === "USD" ? styles.tabActive : ""}`}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => setTab("KHR")}
              className={`${styles.tab} ${tab === "KHR" ? styles.tabActive : ""}`}
            >
              KHR
            </button>
          </div>
          <div className={styles.bigStats}>
            <div>
              <span className={styles.statLabel}>ABA</span>
              <strong className={styles.bigNum}>{fmt(active.aba)}</strong>
            </div>
            <div>
              <span className={styles.statLabel}>BAKONG</span>
              <strong className={styles.bigNum}>{fmt(active.bakong)}</strong>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.chart}>
        <div className={styles.yAxis}>
          {(tab === "USD"
            ? [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0].map((v) => `$${v.toFixed(2)}`)
            : [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0].map((v) => `៛${v}`)
          ).map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className={styles.chartBody}>
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className={styles.gridLine} />
          ))}
          <div className={styles.xAxis}>
            {Array.from({ length: 31 }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
