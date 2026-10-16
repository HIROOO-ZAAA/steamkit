"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./dashboard.module.css";

export default function ObsLinkRow({ label, path }: { label: string; path: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("streamkit_overlay_credentials")
        .select("token")
        .eq("creator_id", user.id)
        .maybeSingle();
      if (data?.token) setToken(data.token);
    })();
  }, []);

  function copy() {
    if (!token) return;
    void navigator.clipboard.writeText(`${window.location.origin}${path}?token=${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="copyLink"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          background: "none",
          border: 0,
          padding: 0,
          cursor: "pointer",
          fontFamily: "Rajdhani, sans-serif",
          fontWeight: 700,
          fontSize: "1rem",
          color: "var(--color-primary)",
        }}
      >
        {label} {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      {copied &&
        createPortal(
          <div className={styles.toast}>
            <span className={styles.toastIcon}>
              <Check size={13} />
            </span>
            <div>
              <div className={styles.toastTitle}>Success</div>
              <div className={styles.toastMsg}>{label} link copied successfully.</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
