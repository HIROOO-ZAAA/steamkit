"use client";

import { useState, useEffect } from "react";
import { Clipboard, Eye, LockKeyhole, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./browser.module.css";

export default function BrowserSourcePage() {
  const [token, setToken] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function loadOverlayToken() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user)
          throw new Error("Sign in to create an OBS browser-source URL.");

        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({ id: user.id });

        if (profileError) throw profileError;

        const { data: credential, error: credentialError } = await supabase
          .from("streamkit_overlay_credentials")
          .upsert({ creator_id: user.id })
          .select("token")
          .single();

        if (credentialError || !credential?.token) throw credentialError;
        setToken(credential.token);
      } catch {
        setError(
          "Unable to create an OBS URL. Apply the secure overlay migration and check your creator permissions.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadOverlayToken();
  }, []);

  async function handleRegenerateToken() {
    if (
      !confirm(
        "Regenerating your token will invalidate your old OBS URL. Are you sure?",
      )
    )
      return;

    setRegenerating(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const newToken = crypto.randomUUID();
      const { data: credential, error } = await supabase
        .from("streamkit_overlay_credentials")
        .update({ token: newToken })
        .eq("creator_id", user.id)
        .select("token")
        .single();

      if (error) throw error;

      setToken(credential.token);
    } catch {
      setError(
        "Failed to regenerate the OBS URL. Check the secure overlay migration and your profile permissions.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  function copyOverlayUrl() {
    const url = `${window.location.origin}/overlay/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className="skeleton" style={{ height: "300px", width: "100%" }} />
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className={styles.container}>
        <div className="alert-error" role="alert">
          {error || "No OBS URL is available yet."}
        </div>
      </div>
    );
  }

  const overlayUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/overlay/${token}`
      : `/overlay/${token}`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🎥 OBS Browser Source Setup</h1>
        <p className={styles.subtitle}>
          Connect your private alert URL to OBS Studio or Streamlabs for
          transparent on-screen alerts
        </p>
      </div>

      {/* Security Warning */}
      <div className={`${styles.securityNotice} alert-error`}>
        <span className={styles.noticeIcon}>
          <LockKeyhole size={22} />
        </span>
        <div>
          <strong>Keep Your Browser Source URL Private!</strong>
          <p>
            Never show your secret token on stream. Anyone with this link can
            view your private alert feed.
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Token Card */}
        <div className={`${styles.card} card`}>
          <h3>Your Secret Browser Source URL</h3>
          <p className={styles.cardSub}>
            Paste this URL directly into your OBS Studio Browser Source
            properties.
          </p>

          <div className={styles.urlBox}>
            <input
              type="password"
              className={`input ${styles.tokenInput}`}
              value={overlayUrl}
              readOnly
            />
            <button
              onClick={copyOverlayUrl}
              className="btn btn-primary"
              id="copy-token-url-btn"
            >
              {copied ? (
                "Copied!"
              ) : (
                <>
                  <Clipboard size={16} /> Copy URL
                </>
              )}
            </button>
          </div>

          <div className={styles.tokenActions}>
            <button
              onClick={handleRegenerateToken}
              className="btn btn-ghost btn-sm"
              disabled={regenerating}
              style={{ color: "var(--brand-danger)" }}
              id="regenerate-token-btn"
            >
              {regenerating ? (
                "Regenerating..."
              ) : (
                <>
                  <RefreshCw size={15} /> Regenerate Secret Token
                </>
              )}
            </button>
            <a
              href={`/overlay/${token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              id="test-overlay-window-btn"
            >
              <Eye size={15} /> Test Overlay Window ↗
            </a>
          </div>
        </div>

        {/* OBS Integration Guide */}
        <div className={`${styles.guideCard} card`}>
          <h3>How to add to OBS Studio (Step-by-Step)</h3>

          <ol className={styles.obsSteps}>
            <li>
              <strong>Open OBS Studio</strong> and select your active Scene.
            </li>
            <li>
              Under <strong>Sources</strong>, click the <strong>+</strong>{" "}
              button and select <strong>Browser</strong>.
            </li>
            <li>
              Name the source <code>Kit Steam Alerts</code> and click OK.
            </li>
            <li>
              In the properties window, paste your copied{" "}
              <strong>Browser Source URL</strong> into the URL field.
            </li>
            <li>
              Set <strong>Width</strong> to <code>1920</code> and{" "}
              <strong>Height</strong> to <code>1080</code>.
            </li>
            <li>
              Check the box for <strong>Control audio via OBS</strong>{" "}
              (recommended for Khmer TTS audio).
            </li>
            <li>
              Click OK — your livestream overlay is now ready to receive
              real-time alerts!
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
