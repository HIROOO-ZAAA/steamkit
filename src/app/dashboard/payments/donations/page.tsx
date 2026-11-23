import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChartNoAxesCombined, ChevronLeft, ChevronRight, HandCoins, Search } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import DonationsTabs from "./DonationsTabs";
import ExportCsvButton from "./ExportCsvButton";
import PhotoReviewQueue from "./PhotoReviewQueue";
import styles from "./donations.module.css";

type DonationsPageProps = {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
};

const PAGE_SIZE = 20;
const VALID_STATUSES = ["completed", "pending", "failed"] as const;

export default async function DonationsPage({ searchParams }: DonationsPageProps) {
  const params = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const status = VALID_STATUSES.includes(params.status as (typeof VALID_STATUSES)[number])
    ? params.status!
    : "all";
  const search = (params.q || "").trim().slice(0, 80);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  let query = supabase
    .from("payment_transactions")
    .select("id, donor_name, amount, currency, message, status, provider, created_at", {
      count: "exact",
    })
    .eq("creator_id", user.id)
    .order("created_at", { ascending: false });
  if (status === "completed") query = query.in("status", ["completed", "successful"]);
  else if (status !== "all") query = query.eq("status", status);
  if (search) query = query.ilike("donor_name", `%${search}%`);

  const { data: donations, count, error } = await query.range(
    (pageNumber - 1) * PAGE_SIZE,
    pageNumber * PAGE_SIZE - 1,
  );
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageUrl = (nextPage: number) => {
    const next = new URLSearchParams();
    if (status !== "all") next.set("status", status);
    if (search) next.set("q", search);
    if (nextPage > 1) next.set("page", String(nextPage));
    const queryString = next.toString();
    return `/dashboard/donations${queryString ? `?${queryString}` : ""}`;
  };

  const successful = (donations ?? []).filter(
    (d) => d.status === "completed" || d.status === "successful",
  );
  const usdTotal = successful
    .filter((d) => d.currency !== "KHR")
    .reduce((s, d) => s + Number(d.amount), 0);
  const khrTotal = successful
    .filter((d) => d.currency === "KHR")
    .reduce((s, d) => s + Number(d.amount), 0);
  const abaTotal = successful
    .filter((d) => (d.provider ?? "").toLowerCase().includes("aba"))
    .reduce((s, d) => s + Number(d.amount), 0);
  const bakongTotal = successful
    .filter((d) => (d.provider ?? "").toLowerCase().includes("bakong"))
    .reduce((s, d) => s + Number(d.amount), 0);

  const { data: photoQueue } = await supabase
    .from("donations")
    .select(
      "id, donor_name, amount, currency, message, photo_path, photo_status, created_at",
    )
    .eq("creator_id", user.id)
    .eq("photo_status", "pending")
    .not("photo_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Steam Kit // Payments"
        title="Donations"
        description="Review payment transactions, donor messages and photos awaiting moderation."
      />

      <section className={styles.overviewCard}>
        <div className={styles.overviewHead}>
          <div>
            <h3>Donation summary</h3>
            <p>Completed payments from the rows loaded on this page.</p>
          </div>
          <DonationsTabs
            usd={usdTotal}
            khr={khrTotal}
            aba={abaTotal}
            bakong={bakongTotal}
          />
        </div>
        <div className={styles.chartEmpty}>
          <ChartNoAxesCombined size={24} strokeWidth={1.6} aria-hidden="true" />
          <strong>Daily chart unavailable</strong>
          <span>
            A daily donation series is not exposed by the current data source. Totals above are
            limited to the visible page.
          </span>
        </div>
      </section>

      <div className={styles.streamsRow}>
        <div>
          <h3>
            <span className={styles.vBar} /> Donation history{" "}
            <span className={styles.countChip}>{count ?? 0} total</span>
          </h3>
          <p>Transaction history and details</p>
        </div>
        <div className={styles.streamBtns}>
          <ExportCsvButton rows={donations ?? []} className={styles.ghostBtn} />
        </div>
      </div>

      <PhotoReviewQueue items={photoQueue ?? []} />

      {error ? (
        <p className={styles.error} role="alert">Could not load donations. Refresh to try again.</p>
      ) : donations?.length ? (
        <div className={styles.tableWrap}>
          <form className={styles.searchRow} action="/dashboard/donations">
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input name="q" defaultValue={search} placeholder="Search by donor name..." aria-label="Search by donor name" />
            </label>
            <select name="status" defaultValue={status} aria-label="Status">
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <button className="btn btn-secondary" type="submit">Apply</button>
          </form>
          <div className={styles.tableScroll} role="region" aria-label="Donation history table" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Donor</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Message & Media</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((d) => (
                  <tr key={d.id}>
                    <td className={styles.mono}>{String(d.id).slice(0, 8)}</td>
                    <td>{d.donor_name}</td>
                    <td className={styles.amount}>
                      {d.currency === "KHR"
                        ? `៛${Number(d.amount).toLocaleString()}`
                        : `$${Number(d.amount).toFixed(2)}`}
                    </td>
                    <td>{d.provider ?? "—"}</td>
                    <td className={styles.message}>{d.message || "—"}</td>
                    <td className={styles.date}>{new Date(d.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className={styles.pagination} aria-label="Donation pages">
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
        <section className={styles.tableWrap}>
          <form className={styles.searchRow} action="/dashboard/donations">
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input name="q" defaultValue={search} placeholder="Search by donor name..." aria-label="Search by donor name" />
            </label>
            <select name="status" defaultValue={status} aria-label="Status">
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
            <button className="btn btn-secondary" type="submit">Apply</button>
          </form>
          <div className={styles.empty}>
            <HandCoins size={28} strokeWidth={1.6} />
            <h3>No donations found</h3>
            <p>{search || status !== "all" ? "Try adjusting your search query or date range" : "Completed tips will appear here."}</p>
          </div>
          <nav className={styles.pagination} aria-label="Donation pages">
            <span>Page 1 of 1</span>
            <div>
              <span className={styles.pageBtn}>Previous</span>
              <span className={styles.pageBtn}>Next</span>
            </div>
          </nav>
        </section>
      )}
    </div>
  );
}