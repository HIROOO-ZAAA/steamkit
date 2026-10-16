import { redirect } from "next/navigation";
import { ChartNoAxesCombined } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type PaymentRow = {
  amount: number;
  currency: "USD" | "KHR";
  created_at: string;
};

export default async function AnalyticsPage() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/auth");

  const supabase = authClient;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const [completedResult, failedResult] = await Promise.all([
    supabase
      .from("payment_transactions")
      .select("amount, currency, created_at")
      .eq("creator_id", user.id)
      .in("status", ["completed", "successful"])
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabase
      .from("payment_transactions")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", user.id)
      .in("status", ["failed", "review_required", "expired"])
      .gte("created_at", thirtyDaysAgo.toISOString()),
  ]);

  const completed = (completedResult.data ?? []) as PaymentRow[];
  const usdRevenue = completed
    .filter((payment) => payment.currency === "USD")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const khrRevenue = completed
    .filter((payment) => payment.currency === "KHR")
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const dailyCounts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sevenDaysAgo.getTime() + index * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      count: completed.filter((payment) => payment.created_at.slice(0, 10) === key)
        .length,
    };
  });
  const maxDailyCount = Math.max(1, ...dailyCounts.map((day) => day.count));
  const loadError = completedResult.error || failedResult.error;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <span
          style={{
            display: "inline-flex",
            color: "var(--brand-primary)",
            marginBottom: ".5rem",
          }}
        >
          <ChartNoAxesCombined size={20} strokeWidth={1.8} />
        </span>
        <h1 style={{ margin: 0, fontSize: "2rem" }}>Analytics</h1>
        <p style={{ margin: "0.5rem 0 0", color: "var(--text-muted)" }}>
          Verified payment performance over the last 30 days.
        </p>
      </div>

      {loadError && (
        <p className="alert-error" role="alert">
          Analytics could not be loaded. Apply the payments database migrations and try again.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
        }}
      >
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            Completed revenue (USD)
          </div>
          <div style={{ fontSize: "2rem", marginTop: "0.5rem", fontWeight: 700 }}>
            ${usdRevenue.toFixed(2)}
          </div>
        </div>
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            Completed revenue (KHR)
          </div>
          <div style={{ fontSize: "2rem", marginTop: "0.5rem", fontWeight: 700 }}>
            KHR {khrRevenue.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            Failed payments
          </div>
          <div style={{ fontSize: "2rem", marginTop: "0.5rem", fontWeight: 700 }}>
            {failedResult.count ?? 0}
          </div>
        </div>
      </div>

      <section className="card" style={{ padding: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1.5rem" }}>Completed payments · 7 days</h2>
        {completedResult.error ? (
          <p style={{ color: "var(--text-muted)" }}>
            No analytics data is available until the payment migrations are applied.
          </p>
        ) : completed.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>
            No completed payments in the last 30 days.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: ".75rem",
              alignItems: "end",
              minHeight: 180,
            }}
          >
            {dailyCounts.map((day) => (
              <div
                key={day.key}
                style={{ display: "grid", gap: ".5rem", textAlign: "center" }}
              >
                <span style={{ color: "var(--text-muted)", fontSize: ".75rem" }}>
                  {day.count}
                </span>
                <div
                  role="img"
                  aria-label={`${day.label}: ${day.count} completed payments`}
                  style={{
                    height: `${Math.max(8, (day.count / maxDailyCount) * 120)}px`,
                    background: "var(--brand-primary)",
                    borderRadius: "4px 4px 0 0",
                    opacity: day.count ? 1 : 0.2,
                  }}
                />
                <span style={{ color: "var(--text-muted)", fontSize: ".75rem" }}>
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
