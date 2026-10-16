"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
    <div className="mx-auto flex w-full max-w-[108rem] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-nexusBorder pb-5">
        <div>
          <p className="font-mono text-[13px] uppercase tracking-[0.3em] text-nexusPrimary">
            System // Audit_Trail
          </p>
          <h1 className="mt-2 font-rajdhani text-3xl font-bold uppercase tracking-wider text-white lg:text-4xl">
            Sign-In History
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Your last 100 sign-ins with IP and device.
          </p>
        </div>
        <Link
          href="/dashboard/settings"
          className={`${styles.btnGhostAccent} inline-flex items-center gap-2 rounded-lg border border-nexusBorder px-4 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-slate-300`}
        >
          <ArrowLeft size={14} />
          Back
        </Link>
      </header>

      <section
        className={`rounded-xl border border-nexusBorder bg-nexusSurface p-6 ${styles.panel}`}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12 font-rajdhani text-xs uppercase tracking-widest text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Reading audit log…
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 font-rajdhani text-xs font-bold uppercase tracking-widest text-red-400">
            {loadError}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-nexusBorder bg-nexusNeutral px-6 py-10 text-center">
            <History size={22} className="text-slate-600" />
            <p className="font-rajdhani text-xs font-bold uppercase tracking-widest text-slate-500">
              No sign-ins recorded
            </p>
            <p className="max-w-sm text-[13px] text-slate-600">
              Sign out and back in, or apply the latest Supabase migration to
              start recording sessions.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-nexusBorder">
                  <th className="px-3 py-2.5 font-rajdhani text-[13px] font-bold uppercase tracking-widest text-slate-400">
                    Logged In
                  </th>
                  <th className="px-3 py-2.5 font-rajdhani text-[13px] font-bold uppercase tracking-widest text-slate-400">
                    Logged Out
                  </th>
                  <th className="px-3 py-2.5 font-rajdhani text-[13px] font-bold uppercase tracking-widest text-slate-400">
                    IP
                  </th>
                  <th className="px-3 py-2.5 font-rajdhani text-[13px] font-bold uppercase tracking-widest text-slate-400">
                    Device
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const active = !row.logged_out_at;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-nexusBorder/50 font-mono text-[13px] text-slate-400 ${styles.row} ${styles[`r${Math.min(i + 1, 5)}`]} ${active ? styles.rowActive : ""}`}
                    >
                      <td className="px-3 py-3 text-slate-200">
                        {formatStamp(row.logged_in_at)}
                      </td>
                      <td className="px-3 py-3">
                        {active ? (
                          <span className="inline-flex items-center gap-1.5 text-nexusPrimary">
                            <span className="h-1.5 w-1.5 rounded-full bg-nexusPrimary" />
                            Active ({formatStamp(row.logged_in_at)})
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            {formatStamp(row.logged_out_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">{row.ip_address ?? "—"}</td>
                      <td className="max-w-[22rem] truncate px-3 py-3" title={row.device ?? ""}>
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