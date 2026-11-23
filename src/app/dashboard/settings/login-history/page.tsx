"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/ui/PageHeader";
import styles from "../settings.module.css";

interface LoginSessionRow {
  id: string;
  logged_in_at: string | null;
  logged_out_at: string | null;
  ip_address: string | null;
  device: string | null;
  provider: string | null;
}

function formatStamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function LoginHistoryPage() {
  const [rows, setRows] = useState<LoginSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("login_sessions")
          .select("id, logged_in_at, logged_out_at, ip_address, device, provider")
          .order("logged_in_at", { ascending: false })
          .limit(100);

        if (error) throw new Error(error.message);
        if (cancelled) return;
        setRows((data ?? []) as LoginSessionRow[]);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Could not load sign-in history.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Steam Kit // Settings"
        title="Sign-In History"
        description="Your last 100 sign-ins with IP and device."
        actions={
          <Link href="/dashboard/settings" className={styles.btnGhostAccent}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back to settings
          </Link>
        }
      />

      <section className={styles.panel} aria-label="Sign-in audit trail">
        {loading ? (
          <div className={styles.tableState}>
            <Loader2 size={16} className={styles.spinIcon} aria-hidden="true" />
            Reading audit log…
          </div>
        ) : loadError ? (
          <div className={styles.tableError} role="alert">
            {loadError}
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.tableEmpty}>
            <History size={22} aria-hidden="true" />
            <p className={styles.tableEmptyTitle}>No sign-ins recorded</p>
            <p className={styles.tableEmptyText}>
              Sign out and back in, or apply the latest Supabase migration to
              start recording sessions.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Logged In</th>
                  <th>Logged Out</th>
                  <th>IP</th>
                  <th>Device</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const active = !row.logged_out_at;
                  return (
                    <tr
                      key={row.id}
                      className={`${styles.row} ${styles[`r${Math.min(i + 1, 5)}`]} ${active ? styles.rowActive : ""}`}
                    >
                      <td data-label="Logged in">{formatStamp(row.logged_in_at)}</td>
                      <td data-label="Logged out">
                        {active ? (
                          <span className={styles.activeLabel}>
                            <span className={styles.activeDot} aria-hidden="true" />
                            Active ({formatStamp(row.logged_in_at)})
                          </span>
                        ) : (
                          formatStamp(row.logged_out_at)
                        )}
                      </td>
                      <td data-label="IP">{row.ip_address ?? "—"}</td>
                      <td className={styles.deviceCell} data-label="Device" title={row.device ?? ""}>
                        {row.device ?? "Unknown device"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
