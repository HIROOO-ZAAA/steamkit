"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./ObsLinkRow.module.css";

type LoadState = "loading" | "ready" | "missing" | "error";
type CopyState = "idle" | "copied" | "error";

export default function ObsLinkRow({ label, path }: { label: string; path: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) setLoadState("error");
          return;
        }

        const { data, error } = await supabase
          .from("streamkit_overlay_credentials")
          .select("token")
          .eq("creator_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setLoadState("error");
          return;
        }

        if (data?.token) {
          setToken(data.token);
          setLoadState("ready");
          return;
        }

        setLoadState("missing");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (copyState === "idle") return;

    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copy() {
    if (!token) return;

    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${path}?token=${token}`,
      );
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className={styles.obsRow}>
      <span className={styles.obsLabel}>{label}</span>

      {loadState === "loading" ? (
        <span className={styles.obsStatus} role="status">
          <Loader2 className={styles.spin} size={12} aria-hidden="true" />
          Checking link
        </span>
      ) : loadState === "ready" && token ? (
        <button
          type="button"
          className={`${styles.obsButton} ${
            copyState === "copied"
              ? styles.obsButtonCopied
              : copyState === "error"
                ? styles.obsButtonError
                : ""
          }`}
          onClick={copy}
          aria-label={
            copyState === "copied"
              ? `${label} link copied`
              : copyState === "error"
                ? `Copy ${label} link failed`
                : `Copy ${label} link`
          }
        >
          {copyState === "copied" ? (
            <Check size={12} aria-hidden="true" />
          ) : (
            <Copy size={12} aria-hidden="true" />
          )}
          <span aria-live="polite">
            {copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : "Copy link"}
          </span>
        </button>
      ) : loadState === "missing" ? (
        <Link href="/dashboard/widgets/alerts" className={styles.obsGenerate}>
          Open Alerts
        </Link>
      ) : (
        <span
          className={styles.obsStatus}
          title="The overlay credential could not be checked."
        >
          Unavailable
        </span>
      )}
    </div>
  );
}
