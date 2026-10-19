import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ALERT_HISTORY_PAGE_SIZE,
  alertHistoryStatusClass,
  alertHistorySourceLabel,
  alertHistoryStatusLabel,
  normalizeAlertHistoryFilters,
} from "@/lib/overlay/alert-history";
import { ChevronLeft, ChevronRight, Clock3, Search, SlidersHorizontal } from "lucide-react";
import styles from "./history.module.css";

type Props = {
  searchParams: Promise<{ page?: string; status?: string; source?: string; q?: string }>;
};

type AlertEvent = {
  created_at: string;
  payment_status: string | null;
  payment_method: string | null;
};

export default async function AlertHistoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = normalizeAlertHistoryFilters(params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  let query = supabase
    .from("tips")
    .select("created_at, payment_status, payment_method", { count: "exact" })
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });

  if (filters.status === "completed") query = query.in("payment_status", ["completed", "successful"]);
  else if (filters.status !== "all") query = query.eq("payment_status", filters.status);

  if (filters.source === "aba") query = query.in("payment_method", ["aba", "aba_payway"]);
  else if (filters.source === "bakong" || filters.source === "test") query = query.eq("payment_method", filters.source);
  else if (filters.source === "other") query = query.not("payment_method", "in", '("aba","aba_payway","bakong","test")');

  if (filters.query) query = query.ilike("payment_method", `%${filters.query}%`);

  const start = (filters.page - 1) * ALERT_HISTORY_PAGE_SIZE;
  const { data, count, error } = await query.range(start, start + ALERT_HISTORY_PAGE_SIZE - 1);
  const events = (data ?? []) as AlertEvent[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / ALERT_HISTORY_PAGE_SIZE));

  function pageUrl(page: number) {
    const next = new URLSearchParams();
    if (filters.status !== "all") next.set("status", filters.status);
    if (filters.source !== "all") next.set("source", filters.source);
    if (filters.query) next.set("q", filters.query);
    if (page > 1) next.set("page", String(page));
    const search = next.toString();
    return `/dashboard/alert-history${search ? `?${search}` : ""}`;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>{"// ALERT RECORDS"}</p>
          <h1>Alert History</h1>
          <p className={styles.subtitle}>Review recent donation and test-alert delivery records.</p>
        </div>
        <Link className={styles.templateLink} href="/dashboard/alerts">Edit alert template</Link>
      </header>

      <section className={styles.panel}>
        <form className={styles.filters} action="/dashboard/alert-history">
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <input name="q" defaultValue={filters.query} maxLength={50} placeholder="Search source (ABA, Bakong)…" />
          </label>
          <label className={styles.filterField}>
            <span>Status</span>
            <select name="status" defaultValue={filters.status}>
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="test">Test</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
              <option value="review_required">Needs review</option>
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Source</span>
            <select name="source" defaultValue={filters.source}>
              <option value="all">All sources</option>
              <option value="aba">ABA PayWay</option>
              <option value="bakong">Bakong</option>
              <option value="test">Test alert</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button className={styles.applyButton} type="submit"><SlidersHorizontal size={15} aria-hidden="true" /> Apply</button>
        </form>

        {error ? (
          <div className={styles.error} role="alert">Could not load alert history. Check your connection and try again.</div>
        ) : events.length ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Time</th><th>Source</th><th>Summary</th><th>Status</th></tr></thead>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={`${event.created_at}-${index}`}>
                      <td><time dateTime={event.created_at}><Clock3 size={14} aria-hidden="true" />{new Date(event.created_at).toLocaleString()}</time></td>
                      <td>{alertHistorySourceLabel(event.payment_method)}</td>
                      <td>{event.payment_status === "test" ? "Test alert" : "Donation alert"}</td>
                      <td><span className={`${styles.status} ${styles[alertHistoryStatusClass(event.payment_status)] ?? styles.status_unknown}`}>{alertHistoryStatusLabel(event.payment_status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className={styles.pagination} aria-label="Alert history pages">
              <span>{count ?? 0} records · Page {filters.page} of {totalPages}</span>
              <div>
                {filters.page > 1 ? <Link href={pageUrl(filters.page - 1)}><ChevronLeft size={15} /> Previous</Link> : <span className={styles.disabledPage}><ChevronLeft size={15} /> Previous</span>}
                {filters.page < totalPages ? <Link href={pageUrl(filters.page + 1)}>Next <ChevronRight size={15} /></Link> : <span className={styles.disabledPage}>Next <ChevronRight size={15} /></span>}
              </div>
            </nav>
          </>
        ) : (
          <div className={styles.empty}>
            <Clock3 size={28} aria-hidden="true" />
            <strong>No matching alert records</strong>
            <span>Try another status or source filter. Viewer messages and donor details are not shown here.</span>
          </div>
        )}
        <p className={styles.privacyNote}>This history is scoped to your signed-in account. It omits donor names, payment amounts, and viewer messages.</p>
      </section>
    </main>
  );
}
