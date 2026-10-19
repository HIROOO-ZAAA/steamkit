import { redirect } from "next/navigation";
import Link from "next/link";
import { ChartNoAxesCombined, Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  ANALYTICS_PERIODS,
  analyticsPeriodStart,
  analyticsProviderLabel,
  normalizeAnalyticsPeriod,
  summarizeAnalyticsPayments,
  type AnalyticsPayment,
} from "@/lib/dashboard/analytics";
import styles from "./analytics.module.css";

type Props = { searchParams: Promise<{ days?: string }> };

export default async function AnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const days = normalizeAnalyticsPeriod(params.days);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const now = new Date();
  const start = analyticsPeriodStart(days, now);
  const [completedResult, unsuccessfulResult] = await Promise.all([
    supabase
      .from("payment_transactions")
      .select("amount, currency, provider, created_at")
      .eq("creator_id", user.id)
      .in("status", ["completed", "successful"])
      .gte("created_at", start.toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: true }),
    supabase
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", user.id)
      .in("status", ["failed", "review_required", "expired", "cancelled"])
      .gte("created_at", start.toISOString())
      .lte("created_at", now.toISOString()),
  ]);

  const completed = (completedResult.data ?? []) as AnalyticsPayment[];
  const summary = summarizeAnalyticsPayments(completed);
  const dailyCounts = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: date.toLocaleDateString(undefined, {
        weekday: days === 7 ? "short" : undefined,
        month: days === 90 ? "numeric" : undefined,
        day: days === 90 ? "numeric" : undefined,
        timeZone: "UTC",
      }),
      count: summary.dailyCounts.get(key) ?? 0,
    };
  });
  const maxDailyCount = Math.max(1, ...dailyCounts.map((day) => day.count));
  const providers = [...summary.providerCounts.entries()].sort((a, b) => b[1] - a[1]);
  const hasError = Boolean(completedResult.error || unsuccessfulResult.error);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.icon} aria-hidden="true"><ChartNoAxesCombined size={20} strokeWidth={1.8} /></span>
          <p className={styles.kicker}>{"// PAYMENT ANALYTICS"}</p>
          <h1>Analytics</h1>
          <p className={styles.subtitle}>Payment performance based on completed transactions recorded for your account.</p>
        </div>
        <Link className={styles.historyLink} href="/dashboard/alert-history"><Clock3 size={15} aria-hidden="true" /> Alert history</Link>
      </header>

      <section className={styles.periodPanel} aria-label="Analytics date range">
        <form action="/dashboard/analytics" className={styles.periodForm}>
          <label htmlFor="analytics-days">Date range</label>
          <select id="analytics-days" name="days" defaultValue={String(days)}>
            {ANALYTICS_PERIODS.map((period) => <option key={period} value={period}>Last {period} days</option>)}
          </select>
          <button type="submit">Apply range</button>
        </form>
        <span className={styles.rangeMeta}>From {start.toLocaleDateString()} to {now.toLocaleDateString()}</span>
      </section>

      {hasError && (
        <p className={styles.error} role="alert">
          Some analytics are unavailable. Check payment database access and try again. Unavailable values are shown as a dash, not as zero.
        </p>
      )}

      <section className={styles.metrics} aria-label={`Payment summary for the last ${days} days`}>
        <article className={styles.metricCard}>
          <span>Completed payments</span>
          <strong>{completedResult.error ? "—" : completed.length.toLocaleString()}</strong>
          <small>Completed or successful payment transactions</small>
        </article>
        <article className={styles.metricCard}>
          <span>Completed revenue · USD</span>
          <strong>{completedResult.error ? "—" : `$${summary.usd.toFixed(2)}`}</strong>
          <small>USD kept separate from KHR</small>
        </article>
        <article className={styles.metricCard}>
          <span>Completed revenue · KHR</span>
          <strong>{completedResult.error ? "—" : `៛${summary.khr.toLocaleString()}`}</strong>
          <small>KHR kept separate from USD</small>
        </article>
        <article className={styles.metricCard}>
          <span>Unsuccessful payments</span>
          <strong>{unsuccessfulResult.error ? "—" : (unsuccessfulResult.count ?? 0).toLocaleString()}</strong>
          <small>Failed, expired, canceled, or needs review</small>
        </article>
      </section>

      <section className={styles.panel} aria-labelledby="payment-trend-heading">
        <div className={styles.panelHead}>
          <div><h2 id="payment-trend-heading">Completed payments</h2><p>Daily transaction count for the selected range · UTC dates</p></div>
          <span className={styles.periodBadge}>{days} DAYS</span>
        </div>
        {completedResult.error ? (
          <p className={styles.unavailable}>Payment trend is unavailable because the transaction query failed.</p>
        ) : completed.length === 0 ? (
          <p className={styles.empty}>No completed payments in this date range.</p>
        ) : (
          <div className={styles.chartScroll} role="region" aria-label="Daily completed payments chart" tabIndex={0}>
            <div className={styles.chart} style={{ gridTemplateColumns: `repeat(${days}, minmax(32px, 1fr))` }}>
              {dailyCounts.map((day) => (
                <div className={styles.barColumn} key={day.key}>
                  <span className={styles.barCount}>{day.count}</span>
                  <div
                    className={styles.barTrack}
                    role="img"
                    aria-label={`${day.key}: ${day.count} completed payments`}
                  >
                    <span className={styles.bar} style={{ height: `${Math.max(5, (day.count / maxDailyCount) * 100)}%`, opacity: day.count ? 1 : 0.2 }} />
                  </div>
                  <span className={styles.barLabel}>{day.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="provider-heading">
        <div className={styles.panelHead}>
          <div><h2 id="provider-heading">Payment sources</h2><p>Share of completed transactions in the selected range</p></div>
        </div>
        {completedResult.error ? (
          <p className={styles.unavailable}>Payment source breakdown is unavailable.</p>
        ) : providers.length ? (
          <ul className={styles.providerList}>
            {providers.map(([provider, count]) => (
              <li key={provider}><span>{analyticsProviderLabel(provider)}</span><strong>{count.toLocaleString()}</strong></li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No completed transactions to break down.</p>
        )}
      </section>

      <p className={styles.definition}>Definitions: revenue is the sum of completed/successful payment transaction amounts by currency; source and trend counts use those same transactions. Unsuccessful includes failed, expired, canceled, and review-required statuses. Pending transactions are excluded.</p>
    </main>
  );
}
