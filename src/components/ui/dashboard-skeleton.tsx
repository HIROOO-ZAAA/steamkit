export default function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" style={{ display: "grid", gap: "1.5rem", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "grid", gap: ".65rem" }}>
        <div className="skeleton" style={{ height: 12, width: 110 }} />
        <div className="skeleton" style={{ height: 34, width: "min(360px, 80%)" }} />
        <div className="skeleton" style={{ height: 16, width: "min(520px, 90%)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "1rem" }}>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="card" style={{ display: "grid", gap: ".75rem", padding: "1.25rem" }}>
            <div className="skeleton" style={{ height: 12, width: "45%" }} />
            <div className="skeleton" style={{ height: 30, width: "60%" }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ display: "grid", gap: ".75rem", padding: "1.25rem" }}>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="skeleton" style={{ height: 44, width: "100%" }} />
        ))}
      </div>
    </div>
  );
}
