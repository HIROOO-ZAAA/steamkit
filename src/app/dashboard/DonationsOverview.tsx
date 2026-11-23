"use client";

import { useState } from "react";
import styles from "./dashboard.module.css";

type CurrencySummary = {
  total: number;
  aba: number;
  bakong: number;
  count: number;
  abaCount: number;
  bakongCount: number;
};

type DailyDonationPoint = {
  key: string;
  label: string;
  total: number;
};

export default function DonationsOverview({
  usd,
  khr,
  usdSeries,
  khrSeries,
  unavailable = false,
}: {
  usd: CurrencySummary;
  khr: CurrencySummary;
  usdSeries: DailyDonationPoint[];
  khrSeries: DailyDonationPoint[];
  unavailable?: boolean;
}) {
  const [tab, setTab] = useState<"USD" | "KHR">("USD");
  const active = tab === "USD" ? usd : khr;
  const series = tab === "USD" ? usdSeries : khrSeries;
  const peak = series.reduce((max, point) => Math.max(max, point.total), 0);

  const fmt = (value: number) =>
    tab === "USD"
      ? `$${value.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : `KHR ${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

  const otherAmount = Math.max(0, active.total - active.aba - active.bakong);
  const otherCount = Math.max(0, active.count - active.abaCount - active.bakongCount);
  const methods = [
    {
      key: "aba",
      label: "ABA PayWay",
      amount: active.aba,
      count: active.abaCount,
      dotClass: styles.methodDotAba,
      barClass: styles.methodBarAba,
    },
    {
      key: "bakong",
      label: "Bakong",
      amount: active.bakong,
      count: active.bakongCount,
      dotClass: styles.methodDotBakong,
      barClass: styles.methodBarBakong,
    },
    ...(otherAmount > 0.004 || otherCount > 0
      ? [
          {
            key: "other",
            label: "Other",
            amount: otherAmount,
            count: otherCount,
            dotClass: styles.methodDotOther,
            barClass: styles.methodBarOther,
          },
        ]
      : []),
  ];

  return (
    <section
      className={`${styles.panel} ${styles.overviewPanel}`}
      aria-labelledby="donations-method-title"
    >
      <div className={styles.panelHead}>
        <div className={styles.panelTitleGroup}>
          <p className={styles.panelKicker}>Payment mix</p>
          <h2 id="donations-method-title" className={styles.panelTitle}>
            Donations Overview
          </h2>
        </div>

        <div
          className={styles.currencyTabs}
          role="group"
          aria-label="Donation currency"
        >
          <button
            type="button"
            className={`${styles.currencyTab} ${
              tab === "USD" ? styles.currencyTabActive : ""
            }`}
            onClick={() => setTab("USD")}
            aria-pressed={tab === "USD"}
            disabled={unavailable}
          >
            USD
          </button>
          <button
            type="button"
            className={`${styles.currencyTab} ${
              tab === "KHR" ? styles.currencyTabActive : ""
            }`}
            onClick={() => setTab("KHR")}
            aria-pressed={tab === "KHR"}
            disabled={unavailable}
          >
            KHR
          </button>
        </div>
      </div>

      {unavailable ? (
        <div className={styles.errorState} role="alert">
          <strong>Payment totals unavailable</strong>
          <p>
            The latest payment rows could not be loaded. Refresh to try again.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.overviewSummary}>
            <div className={styles.overviewTotal}>
              <span className={styles.overviewLabel}>Last 31 days</span>
              <strong className={styles.currencyValue}>{fmt(active.total)}</strong>
            </div>
            <span className={styles.currencyCount}>
              {active.count} completed payment{active.count === 1 ? "" : "s"}
            </span>
          </div>

          <div className={styles.chartBlock}>
            <div className={styles.chartHead}>
              <span className={styles.chartTitle}>Daily volume · 31 days</span>
              <span className={styles.chartPeak}>
                {peak > 0 ? `Peak ${fmt(peak)}` : "No activity in this period"}
              </span>
            </div>
            <div
              className={styles.chartPlot}
              role="img"
              aria-label={
                peak > 0
                  ? `Daily ${tab} donations for the last 31 days. Peak ${fmt(peak)}.`
                  : `No completed ${tab} donations in the last 31 days.`
              }
            >
              {peak === 0 ? (
                <span className={styles.chartNoActivity}>
                  No donation activity yet
                </span>
              ) : null}
              <div className={styles.chartBars}>
                {series.map((point) => {
                  const height =
                    point.total > 0
                      ? Math.max(2, (point.total / peak) * 100)
                      : 0;

                  return (
                    <span
                      key={point.key}
                      className={styles.chartBar}
                      title={`${point.label}: ${fmt(point.total)}`}
                    >
                      <span
                        className={styles.chartFill}
                        style={{ height: `${height}%` }}
                      />
                    </span>
                  );
                })}
              </div>
            </div>
            <div className={styles.chartAxis} aria-hidden="true">
              {series.map((point, index) => (
                <span
                  key={point.key}
                  className={`${styles.chartAxisLabel} ${
                    index === 0 ||
                    index === series.length - 1 ||
                    index % 6 === 0
                      ? styles.chartAxisLabelVisible
                      : ""
                  }`}
                >
                  {point.label}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.methodGrid}>
            {methods.map((method) => {
              const share =
                active.total > 0
                  ? Math.round((method.amount / active.total) * 100)
                  : 0;

              return (
                <div key={method.key} className={styles.methodCard}>
                  <div className={styles.methodLine}>
                    <span className={styles.methodLabel}>
                      <span
                        className={`${styles.methodDot} ${method.dotClass}`}
                        aria-hidden="true"
                      />
                      {method.label}
                    </span>
                    <strong className={styles.methodValue}>
                      {fmt(method.amount)}
                    </strong>
                  </div>
                  <div className={styles.methodBottom}>
                    <span className={styles.methodCount}>
                      {method.count} payment{method.count === 1 ? "" : "s"}
                    </span>
                    <span className={styles.methodShare}>{share}%</span>
                  </div>
                  <div
                    className={styles.methodBar}
                    role="img"
                    aria-label={`${method.label}: ${fmt(method.amount)}, ${method.count} payments, ${share}% of ${tab} donations`}
                  >
                    <span
                      className={`${styles.methodBarFill} ${method.barClass}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className={styles.panelFooter}>
        <p className={styles.note}>
          Completed payments only, from the last 31 days in ICT. The chart uses
          up to 1,000 successful rows.
        </p>
      </div>
    </section>
  );
}
