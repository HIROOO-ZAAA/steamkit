import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import styles from "./alert-history.module.css";

type AlertHistoryPageProps = {
  searchParams: Promise<{ page?: string; type?: string; q?: string }>;
};

const PAGE_SIZE = 25;
const VALID_TYPES = ["donation", "subscriber", "bits", "raid", "host", "follow", "cheer"] as const;

export default async function AlertHistoryPage({ searchParams }: AlertHistoryPageProps) {
  const params = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const type = VALID_TYPES.includes(params.type as (typeof VALID_TYPES)[number])
    ? params.type!
    : "all";
  const search = (params.q || "").trim().slice(0, 80);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  let query = supabase
    .from("alert_history")
    .select(
      "id, alert_type, payload, status, created_at",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (type !== "all") query = query.eq("alert_type", type);
  if (search) query = query.ilike("payload->>donor_name", `%${search}%`);

  const { data: alerts, count, error } = await query.range(
    (pageNumber - 1) * PAGE_SIZE,
    pageNumber * PAGE_SIZE - 1,
  );
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const pageUrl = (nextPage: number) => {
    const next = new URLSearchParams();
    if (type !== "all") next.set("type", type);
    if (search) next.set("q", search);
    if (nextPage > 1) next.set("page", String(nextPage));
    const queryString = next.toString();
    return `/dashboard/alert-history${queryString ? `?${queryString}` : ""}`;
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Steam Kit // Stream Engagement"
        title="Alert History"
        description="Review every alert fired to your overlay, including test events."
        actions={
          <Button asChild variant="ghost">
            <Link href="/dashboard/widgets/alerts">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to Alert Config
            </Link>
          </Button>
        }
      />

      <section className={styles.filterBar} aria-label="Alert history filters">
        <form action="/dashboard/alert-history" className={styles.filterForm}>
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <input
              name="q"
              defaultValue={search}
              placeholder="Search by donor name..."
              aria-label="Search by donor name"
            />
          </label>
          <select name="type" defaultValue={type} aria-label="Alert type">
            <option value="all">All types</option>
            {VALID_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <Button type="submit">
            <Filter size={14} aria-hidden="true" />
            Apply
          </Button>
        </form>
      </section>

      {error ? (
        <p className={styles.error} role="alert">Could not load alert history. Refresh to try again.</p>
      ) : alerts?.length ? (
        <div className={styles.tableWrap}>
          <div className={styles.tableScroll} role="region" aria-label="Alert history table" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Donor / Source</th>
                  <th>Amount</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => {
                  const payload = alert.payload as Record<string, unknown> | null;
                  return (
                    <tr key={alert.id}>
                      <td className={styles.mono}>{String(alert.id).slice(0, 8)}</td>
                      <td>
                        <span className={`${styles.typeBadge} ${styles[alert.alert_type as keyof typeof styles] || ""}`}>
                          {alert.alert_type}
                        </span>
                      </td>
                      <td>
                        {payload?.donor_name
                          ? String(payload.donor_name)
                          : payload?.username
                          ? `@${payload.username}`
                          : "—"}
                      </td>
                      <td className={styles.amount}>
                        {payload?.amount
                          ? payload.currency === "KHR"
                            ? `៛${Number(payload.amount).toLocaleString()}`
                            : `$${Number(payload.amount).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className={styles.message}>
                        {payload?.message ? String(payload.message) : "—"}
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[alert.status as keyof typeof styles] || ""}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className={styles.date}>
                        {new Date(alert.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav className={styles.pagination} aria-label="Alert history pages">
            <span>Page {pageNumber} of {totalPages}</span>
            <div>
              {pageNumber > 1 && (
                <Link href={pageUrl(pageNumber - 1)} aria-label="Previous page">
                  <ChevronLeft size={16} /> Previous
                </Link>
              )}
              {pageNumber < totalPages && (
                <Link href={pageUrl(pageNumber + 1)} aria-label="Next page">
                  Next <ChevronRight size={16} />
                </Link>
              )}
            </div>
          </nav>
        </div>
      ) : (
        <section className={styles.emptyState} role="status">
          <div className={styles.emptyIcon}>
            <Filter size={28} strokeWidth={1.6} />
          </div>
          <h3>No alerts found</h3>
          <p>
            {search || type !== "all"
              ? "Try adjusting your search query or filter."
              : "Alerts fired to your overlay will appear here."}
          </p>
        </section>
      )}
    </div>
  );
}