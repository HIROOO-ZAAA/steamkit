import Link from "next/link";

export default function SubscriptionsPage() {
  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "2rem" }}>Subscriptions</h1>
        <p style={{ margin: "0.5rem 0 0", color: "var(--text-muted)" }}>
          Manage membership tiers and recurring supporter plans.
        </p>
      </div>

      <div className="card" style={{ padding: "1.5rem" }}>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>
          No active memberships yet. Connect your subscription provider or
          create a tier to start onboarding supporters.
        </p>
      </div>

      <Link href="/dashboard" className="btn btn-ghost btn-sm">
        Back to dashboard
      </Link>
    </div>
  );
}
