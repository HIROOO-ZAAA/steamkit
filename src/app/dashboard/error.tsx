"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import styles from "./dashboard.module.css";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <section className={styles.page} aria-labelledby="dashboard-error-heading">
      <div className={styles.errorState} role="alert">
        <AlertTriangle size={22} aria-hidden="true" />
        <strong id="dashboard-error-heading">Dashboard section unavailable</strong>
        <p>
          This section could not be loaded. Retry, or return to the dashboard
          overview if the problem continues.
        </p>
        <div className={styles.errorActions}>
          <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            Back to overview
          </Link>
        </div>
      </div>
    </section>
  );
}
