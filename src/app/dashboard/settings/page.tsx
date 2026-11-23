"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  Download,
  History,
  IdCard,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Megaphone,
  RefreshCcw,
  CloudUpload,
  Pencil,
  Shield,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { DiscordMark } from "@/components/ui/DiscordMark";
import PageHeader from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/client";
import styles from "./settings.module.css";

const SHARE_SECTIONS = [
  { id: "alerts", label: "Alert Variations" },
  { id: "goals", label: "Donation Goals" },
  { id: "tips", label: "Top Sessions / Leaderboards" },
  { id: "spin", label: "Spin Wheel" },
  { id: "subathon", label: "Subathon" },
] as const;

type ShareSection = (typeof SHARE_SECTIONS)[number]["id"];
type NoticeTone = "success" | "error" | "info";

interface GenericNotice {
  tone: NoticeTone;
  text: string;
}

const NOTICE_STYLES: Record<NoticeTone, string> = {
  success: "border-[var(--dash-success-border)] bg-[var(--dash-success-bg)] text-[var(--dash-success)]",
  error: "border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] text-[var(--dash-danger)]",
  info: "border-[var(--dash-border)] bg-[var(--dash-surface-raised)] text-[var(--dash-text-secondary)]",
};

interface LoginSessionRow {
  id: string;
  logged_in_at: string | null;
  logged_out_at: string | null;
  ip_address: string | null;
  device: string | null;
}

function formatStamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function NoticeBanner({ notice }: { notice: GenericNotice }) {
  const Icon =
    notice.tone === "error"
      ? ShieldCheck
      : notice.tone === "info"
        ? RefreshCcw
        : BadgeCheck;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      aria-live={notice.tone === "error" ? "assertive" : "polite"}
      className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 font-rajdhani text-xs font-bold uppercase tracking-widest backdrop-blur-sm ${NOTICE_STYLES[notice.tone]}`}
    >
      <Icon size={15} />
      {notice.text}
    </div>
  );
}

// Shared panel shell: semantic surfaces keep both dashboard themes legible.
const CARD_STYLE =
  "rounded-lg border border-[var(--dash-border)] border-l-[3px] border-l-[var(--dash-primary)] bg-[var(--dash-surface)] p-6 shadow-none transition-colors hover:border-[var(--dash-border-strong)] hover:border-l-[var(--dash-primary)]";

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [editingMedia, setEditingMedia] = useState<"avatar" | "banner" | null>(null);
  const [mediaDraft, setMediaDraft] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(true);
  const [khrRate, setKhrRate] = useState(() => {
    if (typeof window === "undefined") return "4000";
    try {
      return localStorage.getItem("streamkit:khr_rate") || "4000";
    } catch {
      return "4000";
    }
  });

  const [savingIdentity, setSavingIdentity] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const [notice, setNotice] = useState<GenericNotice | null>(null);

  const [sessions, setSessions] = useState<LoginSessionRow[]>([]);
  const [sessionsError, setSessionsError] = useState("");

  const [shareSections, setShareSections] = useState<ShareSection[]>([
    "alerts",
    "goals",
  ]);
  const [shareCode, setShareCode] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [importCode, setImportCode] = useState("");
  const [importSections, setImportSections] = useState<ShareSection[]>([
    "alerts",
    "goals",
  ]);
  const [importing, setImporting] = useState(false);

  const [modal, setModal] = useState<null | "share" | "import">(null);

  const loadSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("login_sessions")
        .select("id, logged_in_at, logged_out_at, ip_address, device")
        .order("logged_in_at", { ascending: false })
        .limit(5);

      if (error) throw new Error(error.message);
      setSessions((data ?? []) as LoginSessionRow[]);
      setSessionsError("");
    } catch (err) {
      setSessionsError(
        err instanceof Error
          ? err.message
          : "Sign-in history is unavailable right now.",
      );
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url, banner_url")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;

        const name =
          profile?.display_name ?? user.user_metadata?.full_name ?? "";
        setDisplayName(name || "");
        setUsername(profile?.username ?? "");
        setAvatarUrl(profile?.avatar_url ?? "");
        setBannerUrl(profile?.banner_url ?? "");
        setEmail(user.email ?? "");
        setEmailVerified(Boolean(user.email_confirmed_at));

        await loadSessions();
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, loadSessions]);

  useEffect(() => {
    if (!notice || notice.tone !== "success") return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!modal) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModal(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  function applyMediaUrl(kind: "avatar" | "banner", value: string) {
    const url = value.trim();
    if (kind === "avatar") setAvatarUrl(url);
    else setBannerUrl(url);
    setEditingMedia(null);
    setMediaDraft("");
  }

  /**
   * Uploads a profile picture or cover into the public `profile-media` bucket,
   * namespaced under the user id so creators cannot overwrite each other.
   */
  async function handleMediaUpload(
    file: File,
    kind: "avatar" | "banner",
  ) {
    if (!file.type.startsWith("image/")) {
      setNotice({ tone: "error", text: "Please choose an image file." });
      return;
    }
    // A cover is a wide banner, so it needs a larger ceiling than a square avatar.
    const maxBytes = kind === "banner" ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      setNotice({
        tone: "error",
        text:
          kind === "banner"
            ? "Cover must be under 5 MB."
            : "Picture must be under 2 MB.",
      });
      return;
    }

    setUploading(kind);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You are not signed in.");

      const ext = (file.name.split(".").pop() || "png").toLowerCase().slice(0, 5);
      const path = `${user.id}/${kind}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-media")
        .upload(path, file, { cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage
        .from("profile-media")
        .getPublicUrl(path);

      const url = pub.publicUrl;
      if (kind === "avatar") setAvatarUrl(url);
      else setBannerUrl(url);

      setNotice({
        tone: "success",
        text: kind === "avatar" ? "Profile picture added." : "Profile cover added.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        text:
          err instanceof Error
            ? err.message
            : "Upload failed. If this persists, run the profile_media migration.",
      });
    } finally {
      setUploading(null);
    }
  }

  function toggle<T extends string>(list: T[], id: T, setter: (v: T[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleSaveIdentity() {
    setSavingIdentity(true);
    setNotice(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You are not signed in.");
      const name = displayName.trim();
      if (!name) throw new Error("Display name cannot be empty.");

      const slug = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");

      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            display_name: name,
            username: slug || null,
            avatar_url: avatarUrl || null,
            banner_url: bannerUrl || null,
          },
          { onConflict: "id" },
        );
      if (error) throw new Error(error.message);

      setUsername(slug);

      try {
        localStorage.setItem("streamkit:khr_rate", khrRate);
      } catch {
        /* ignore storage */
      }

      setNotice({
        tone: "success",
        text: slug
          ? `Identity saved. Your tip page is live at /pay/${slug}`
          : "Identity saved. Set a username to get your public tip URL.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to save identity.",
      });
    } finally {
      setSavingIdentity(false);
    }
  }

  async function handleForgotPassword() {
    setSendingReset(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/recovery`,
      });
      if (error) throw new Error(error.message);
      setNotice({
        tone: "info",
        text: `Recovery link sent to ${email} — check your inbox.`,
      });
    } catch (err) {
      setNotice({
        tone: "error",
        text:
          err instanceof Error ? err.message : "Failed to send recovery link.",
      });
    } finally {
      setSendingReset(false);
    }
  }

  async function handleUpdatePassword() {
    setUpdatingPassword(true);
    setNotice(null);
    try {
      if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters.");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("New password and confirmation do not match.");
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);

      setNewPassword("");
      setConfirmPassword("");
      setNotice({
        tone: "success",
        text: "Credentials updated. Use your new password on your next sign-in.",
      });
    } catch (err) {
      setNotice({
        tone: "error",
        text:
          err instanceof Error ? err.message : "Failed to update credentials.",
      });
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleGenerateShareCode() {
    setGenerating(true);
    setNotice(null);
    try {
      if (shareSections.length === 0) {
        throw new Error("Pick at least one section to share.");
      }
      const { data, error } = await supabase.rpc(
        "streamkit_create_share_code",
        { p_sections: shareSections },
      );
      if (error) throw new Error(error.message);
      if (typeof data !== "string" || !data) {
        throw new Error("Could not generate a share code.");
      }
      setShareCode(data);
      try {
        await navigator.clipboard.writeText(data);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        /* clipboard unavailable */
      }
      setNotice({ tone: "success", text: `Share code ${data} is ready.` });
    } catch (err) {
      setShareCode("");
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Could not generate a code.",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyShareCode() {
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice({ tone: "error", text: "Clipboard is unavailable here." });
    }
  }

  async function handleImportSettings() {
    setImporting(true);
    setNotice(null);
    try {
      const code = importCode.trim();
      if (!code) throw new Error("Enter a share code first.");
      if (importSections.length === 0) {
        throw new Error("Select at least one section to import.");
      }

      const { data, error } = await supabase.rpc(
        "streamkit_import_share_code",
        { p_code: code, p_sections: importSections },
      );
      if (error) throw new Error(error.message);

      const applied = Array.isArray((data as { applied?: string[] })?.applied)
        ? ((data as { applied: string[] }).applied ?? [])
        : [];

      setImportCode("");
      setNotice({
        tone: "success",
        text: `Imported ${applied.length} section${applied.length === 1 ? "" : "s"}.`,
      });
      await loadSessions();
      setModal(null);
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Import failed.",
      });
    } finally {
      setImporting(false);
    }
  }

  function comingSoon(text: string) {
    setNotice({
      tone: "info",
      text: `${text} — this needs a backend hookup first.`,
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center font-rajdhani text-sm uppercase tracking-widest text-[var(--dash-text-muted)]">
        Loading account settings…
      </div>
    );
  }

  return (
    <div className={`${styles.page} font-rajdhani`}>
      <PageHeader
        eyebrow="Steam Kit // Settings"
        title="Account Settings"
        description="Manage your identity, security, public profile, integrations, and recent sign-in activity."
        actions={
          <span className={styles.onlineChip}>
            <span className={styles.liveDot} aria-hidden="true" />
            Signed in
          </span>
        }
      />

      {notice && <NoticeBanner notice={notice} />}

      {/* Row 1: Identity Matrix & Security Protocol */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Identity Matrix */}
        <div className={`${CARD_STYLE} flex flex-col justify-between`}>
          <div>
            <div className="border-b border-[var(--dash-border)] pb-4">
              <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-[var(--dash-text)]">
                <IdCard size={20} className="text-[var(--dash-primary)]" />
                <span>Identity Matrix</span>
              </div>
              <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
                Personal Identification Data
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="settings-display-name"
                  className="mb-2 block font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-success)]"
                >
                  Display Name
                </label>
                <input
                  id="settings-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={savingIdentity}
                  className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm px-4 py-3 font-sans text-sm text-[var(--dash-text)] transition-all focus:border-[var(--dash-primary)] focus:bg-[var(--dash-surface-raised)] focus:outline-none"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="settings-email"
                    className="font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-success)]"
                  >
                    Email Address
                  </label>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--dash-success-border)] bg-[var(--dash-action-soft)] px-2.5 py-0.5 font-rajdhani text-[10px] font-bold uppercase tracking-wider text-[var(--dash-success)]">
                    <Check size={11} strokeWidth={3} /> {emailVerified ? "Verified" : "Unverified"}
                  </span>
                </div>
                <input
                  id="settings-email"
                  type="email"
                  value={email}
                  readOnly
                  disabled
                  className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm px-4 py-3 font-sans text-sm text-[var(--dash-text-secondary)] cursor-not-allowed"
                />
              </div>

              <div className="border-t border-[var(--dash-border)] pt-4">
                <label
                  htmlFor="settings-khr-rate"
                  className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-success)]"
                >
                  Exchange Rate Configuration
                </label>
                <p className="mb-2 mt-0.5 font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
                  Conversion Protocol: 1 USD -&gt; KHR
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-3 font-rajdhani text-sm font-bold text-[var(--dash-success)]">
                    ៛
                  </span>
                  <input
                    id="settings-khr-rate"
                    type="text"
                    inputMode="numeric"
                    value={khrRate}
                    onChange={(e) =>
                      setKhrRate(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    disabled={savingIdentity}
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm pl-9 pr-4 py-3 font-mono text-sm font-bold text-[var(--dash-success)] transition-all focus:border-[var(--dash-primary)] focus:bg-[var(--dash-surface-raised)] focus:outline-none"
                  />
                </div>
              </div>

            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveIdentity()}
              disabled={savingIdentity}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--dash-action)] px-6 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-action-text)] shadow-none transition-colors hover:bg-[var(--dash-action-hover)] disabled:opacity-50"
            >
              {savingIdentity && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>

        {/* Security Protocol */}
        <div className={`${CARD_STYLE} flex flex-col justify-between`}>
          <div>
            <div className="border-b border-[var(--dash-border)] pb-4">
              <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-[var(--dash-text)]">
                <Shield size={20} className="text-[var(--dash-blue)]" />
                <span>Security Protocol</span>
              </div>
              <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
                Password &amp; Access Control
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text-secondary)]">
                    Password Recovery
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    disabled={sendingReset || !email}
                    className="flex items-center gap-1 font-rajdhani text-[11px] font-bold uppercase tracking-wider text-[var(--dash-info)] hover:text-[var(--dash-accent-strong)] transition-colors disabled:opacity-50"
                  >
                    <KeyRound size={12} />
                    {sendingReset ? "Sending…" : "Forgot Password?"}
                  </button>
                </div>
                <p className="font-sans text-sm text-[var(--dash-text-secondary)]">
                  Changing your password here does not ask for the current one. Use a recovery link if you need to reset it.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="settings-new-password"
                    className="mb-2 block font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text-secondary)]"
                  >
                    New Password
                  </label>
                  <input
                    id="settings-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={updatingPassword}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm px-4 py-3 font-sans text-sm text-[var(--dash-text)] transition-all focus:border-[var(--dash-primary)] focus:bg-[var(--dash-surface-raised)] focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="settings-confirm-password"
                    className="mb-2 block font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text-secondary)]"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="settings-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={updatingPassword}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm px-4 py-3 font-sans text-sm text-[var(--dash-text)] transition-all focus:border-[var(--dash-primary)] focus:bg-[var(--dash-surface-raised)] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => void handleUpdatePassword()}
              disabled={updatingPassword}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--dash-border-strong)] bg-[var(--dash-surface)] backdrop-blur-sm px-6 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-text)] shadow-none transition-colors hover:border-[var(--dash-primary)] hover:bg-[var(--dash-surface-hover)] disabled:opacity-50"
            >
              <Lock size={14} />
              {updatingPassword ? "Updating…" : "Update Credentials"}
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Basic Information */}
        {/* Basic Information */}
      <div className={CARD_STYLE}>
          <div className="border-b border-[var(--dash-border)] pb-4">
            <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-[var(--dash-text)]">
              <UserRound size={20} className="text-[var(--dash-primary)]" />
              <span>Basic Information</span>
            </div>
            <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
              Public profile, picture, cover and tip link
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="settings-username"
                  className="font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-success)]"
                >
                  Choose your username
                </label>
                {username && (
                  <a
                    href={`/pay/${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-rajdhani text-[11px] font-bold uppercase tracking-wider text-[var(--dash-info)] hover:text-[var(--dash-accent-strong)] transition-colors"
                  >
                    <Link2 size={12} />
                    Visit Tip Page
                  </a>
                )}
              </div>
              <div className="flex items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm overflow-hidden">
                <span className="shrink-0 bg-[var(--dash-surface-raised)] px-4 py-3 font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text-secondary)] border-r border-[var(--dash-border)]">
                  {typeof window !== "undefined" ? window.location.host : ""}/pay/
                </span>
                <input
                  id="settings-username"
                  type="text"
                  value={username}
                  onChange={(e) =>
                    setUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""),
                    )
                  }
                  disabled={savingIdentity}
                  placeholder="your-username"
                  className="flex-1 bg-transparent px-4 py-3 font-sans text-sm text-[var(--dash-text)] outline-none transition-all focus:bg-[var(--dash-surface-raised)]"
                />
              </div>
              <p className="mt-1.5 font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
                This sets your public tipping URL. Display name will show on the tip page.
              </p>
            </div>

            {/* Profile Picture + Profile Cover */}
            <div className="mt-4 border-t border-[var(--dash-border)] pt-4 lg:col-span-2">
              <p className="font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text)]">
                Profile Picture
              </p>
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] px-3 py-2">
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded border border-[var(--dash-border)] bg-[var(--dash-surface-raised)]">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center font-rajdhani text-[10px] font-bold text-[var(--dash-primary)]">
                      {(displayName || "S").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </span>

                {editingMedia === "avatar" ? (
                  <input
                    autoFocus
                    value={mediaDraft}
                    onChange={(e) => setMediaDraft(e.target.value)}
                    onBlur={() => applyMediaUrl("avatar", mediaDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyMediaUrl("avatar", mediaDraft);
                      if (e.key === "Escape") {
                        setEditingMedia(null);
                        setMediaDraft("");
                      }
                    }}
                    placeholder="Paste an image URL"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[var(--dash-text)] outline-none"
                  />
                ) : (
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-[11px] ${
                      avatarUrl ? "text-[var(--dash-text-secondary)]" : "text-[var(--dash-text-muted)]"
                    }`}
                  >
                    {avatarUrl || "Select file"}
                  </span>
                )}

                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Use a different image URL"
                    aria-label="Use a different image URL"
                    onClick={() => {
                      setEditingMedia("avatar");
                      setMediaDraft(avatarUrl);
                    }}
                    className="rounded p-1.5 text-[var(--dash-text-muted)] transition-colors hover:text-[var(--dash-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title="Remove profile picture"
                    aria-label="Remove profile picture"
                    onClick={() => setAvatarUrl("")}
                    className="rounded p-1.5 text-[var(--dash-text-muted)] transition-colors hover:text-[var(--dash-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]"
                  >
                    <Trash2 size={14} />
                  </button>
                  <label
                    title="Upload from device"
                    className="cursor-pointer rounded p-1.5 text-[var(--dash-text-muted)] transition-colors hover:text-[var(--dash-primary)] focus-within:text-[var(--dash-primary)]"
                  >
                    {uploading === "avatar" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CloudUpload size={14} />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      disabled={uploading !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleMediaUpload(file, "avatar");
                      }}
                    />
                  </label>
                </span>
              </div>

              <p className="mt-4 font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text)]">
                Profile Cover
              </p>
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] px-3 py-2">
                <span className="h-8 w-12 shrink-0 overflow-hidden rounded border border-[var(--dash-border)] bg-[var(--dash-surface-raised)]">
                  {bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bannerUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </span>

                {editingMedia === "banner" ? (
                  <input
                    autoFocus
                    value={mediaDraft}
                    onChange={(e) => setMediaDraft(e.target.value)}
                    onBlur={() => applyMediaUrl("banner", mediaDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyMediaUrl("banner", mediaDraft);
                      if (e.key === "Escape") {
                        setEditingMedia(null);
                        setMediaDraft("");
                      }
                    }}
                    placeholder="Paste an image URL"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[var(--dash-text)] outline-none"
                  />
                ) : (
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-[11px] ${
                      bannerUrl ? "text-[var(--dash-text-secondary)]" : "text-[var(--dash-text-muted)]"
                    }`}
                  >
                    {bannerUrl || "Select file"}
                  </span>
                )}

                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Use a different cover URL"
                    aria-label="Use a different cover URL"
                    onClick={() => {
                      setEditingMedia("banner");
                      setMediaDraft(bannerUrl);
                    }}
                    className="rounded p-1.5 text-[var(--dash-text-muted)] transition-colors hover:text-[var(--dash-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title="Remove profile cover"
                    aria-label="Remove profile cover"
                    onClick={() => setBannerUrl("")}
                    className="rounded p-1.5 text-[var(--dash-text-muted)] transition-colors hover:text-[var(--dash-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-primary)]"
                  >
                    <Trash2 size={14} />
                  </button>
                  <label
                    title="Upload from device"
                    className="cursor-pointer rounded p-1.5 text-[var(--dash-text-muted)] transition-colors hover:text-[var(--dash-primary)] focus-within:text-[var(--dash-primary)]"
                  >
                    {uploading === "banner" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CloudUpload size={14} />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      disabled={uploading !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleMediaUpload(file, "banner");
                      }}
                    />
                  </label>
                </span>
              </div>
              <p className="mt-2 font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
                Picture 2 MB · Cover 5 MB · PNG / JPG / WEBP. Shown on your tip
                page and social preview card.
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveIdentity()}
              disabled={savingIdentity}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--dash-action)] px-6 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-action-text)] shadow-none transition-colors hover:bg-[var(--dash-action-hover)] disabled:opacity-50"
            >
              {savingIdentity && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>

      {/* Row 2: Discord Integration */}
      <div className={CARD_STYLE}>
        <div className="border-b border-[var(--dash-border)] pb-4">
          <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-[var(--dash-text)]">
            <DiscordMark size={22} className="text-[#818CF8]" />
            <span>Discord Integration</span>
          </div>
          <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
            Discord account linking is not configured yet
          </p>
        </div>

        <div className="mt-5 flex flex-col items-center justify-between gap-4 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm p-5 sm:flex-row">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] text-[var(--dash-text-secondary)]">
              <DiscordMark size={22} />
            </div>
            <div>
              <p className="font-rajdhani text-base font-bold uppercase text-[var(--dash-text)]">
                Not connected
              </p>
              <p className="font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
                OAuth connection is not available in this build
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void comingSoon("Discord OAuth Connect")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-6 py-3 font-rajdhani text-xs font-bold uppercase tracking-wider text-white shadow-none transition-colors hover:bg-[#4752c4]"
          >
            <DiscordMark size={16} />
            Connect Discord
          </button>
        </div>
      </div>

      {/* Row 3: Stream Announcements Banner */}
      <Link
        href="/dashboard/kit-client"
        className={`group flex items-center justify-between ${CARD_STYLE} p-5 hover:bg-[var(--dash-surface-hover)]`}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--dash-success-border)] bg-[var(--dash-action-soft)] text-[var(--dash-primary)] transition-transform group-hover:scale-105">
            <Megaphone size={20} />
          </div>
          <div>
            <h3 className="font-rajdhani text-base font-bold uppercase text-[var(--dash-text)] transition-colors group-hover:text-[var(--dash-success)]">
              Stream Announcements
            </h3>
            <p className="font-inter text-sm text-[var(--dash-text-secondary)]">
              Manage Telegram &amp; Discord &quot;I&apos;m Live&quot; alerts
            </p>
          </div>
        </div>
        <span className="text-xl text-[var(--dash-text-secondary)] transition-colors group-hover:text-[var(--dash-success)]">
          →
        </span>
      </Link>



      {/* Row 5: Recent Login Sessions */}
      <div className={CARD_STYLE}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--dash-border)] pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-[var(--dash-text)]">
              <History size={20} className="shrink-0 text-[var(--dash-warning)]" />
              <span>Recent Login Sessions</span>
            </div>
            <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-text-secondary)]">
              Last 5 Sign-Ins<span className="hidden sm:inline"> · IP &amp; Device</span>
            </p>
          </div>
          <Link
            href="/dashboard/settings/login-history"
            className="whitespace-nowrap font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-warning)] transition-colors hover:text-[var(--dash-warning)]"
          >
            View Full History →
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--dash-border)] font-rajdhani text-[11px] font-bold uppercase tracking-wider text-[var(--dash-text-secondary)]">
                <th className="px-3 py-2.5">Logged In</th>
                <th className="px-3 py-2.5">Logged Out</th>
                <th className="hidden px-3 py-2.5 sm:table-cell">IP</th>
                <th className="hidden px-3 py-2.5 sm:table-cell">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--dash-border)] font-mono text-xs text-[var(--dash-text-secondary)]">
              {sessionsError && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-[var(--dash-danger)]">
                    {sessionsError}
                  </td>
                </tr>
              )}
              {!sessionsError && sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-[var(--dash-text-muted)] font-rajdhani uppercase tracking-widest">
                    No sign-in history recorded yet.
                  </td>
                </tr>
              )}
              {sessions.map((row) => {
                const active = !row.logged_out_at;
                return (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-[var(--dash-surface-hover)]"
                  >
                    <td className="px-3 py-3 text-[var(--dash-text)]">
                      {formatStamp(row.logged_in_at)}
                    </td>
                    <td className="px-3 py-3">
                      {active ? (
                        <span className="font-rajdhani text-xs font-bold text-[var(--dash-success)]">
                          ● Active now ({formatStamp(row.logged_in_at)})
                        </span>
                      ) : (
                        formatStamp(row.logged_out_at)
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-[var(--dash-text-secondary)] sm:table-cell">{row.ip_address ?? "—"}</td>
                    <td
                      className="hidden max-w-xs truncate px-3 py-3 text-[var(--dash-text-secondary)] sm:table-cell"
                      title={row.device ?? ""}
                    >
                      {row.device ?? "Unknown device"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Share Modal */}
      {modal === "share" && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--dash-scrim)] p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Share Profile Settings"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="relative w-full max-w-md space-y-5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] backdrop-blur-md p-6 shadow-none">
            <button
              type="button"
              onClick={() => setModal(null)}
              aria-label="Close"
              className="absolute right-4 top-4 text-[var(--dash-text-secondary)] transition-colors hover:text-[var(--dash-text)]"
            >
              <X size={16} />
            </button>

            <div>
              <h3 className="font-rajdhani text-xl font-bold text-[var(--dash-text)]">
                Share Profile Settings
              </h3>
              <p className="mt-1.5 font-inter text-sm leading-relaxed text-[var(--dash-text-secondary)]">
                Select the configurations you want to share, then generate your code.
              </p>
            </div>

            <div>
              <label className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text-secondary)]">
                Select Settings to Share
              </label>
              <div className="mt-2 space-y-3 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm p-4">
                {SHARE_SECTIONS.map((section) => {
                  const on = shareSections.includes(section.id);
                  return (
                    <label
                      key={section.id}
                      className="flex cursor-pointer items-center gap-3 font-inter text-sm text-[var(--dash-text)]"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          toggle(shareSections, section.id, setShareSections)
                        }
                        className="h-4 w-4 rounded accent-[var(--dash-primary)]"
                      />
                      {section.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text-secondary)]">
                Profile Share Code
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  readOnly
                  aria-label="Profile share code"
                  placeholder="Click Generate below..."
                  value={shareCode}
                  className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] px-3 py-2.5 font-mono text-xs text-[var(--dash-text)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyShareCode()}
                  disabled={!shareCode}
                  className="flex-none rounded-lg border border-[var(--dash-border-strong)] bg-[var(--dash-surface-raised)] px-4 py-2.5 font-rajdhani text-xs font-bold uppercase text-[var(--dash-text)] shadow-none transition-colors hover:border-[var(--dash-primary)] disabled:opacity-50"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-[var(--dash-border-strong)] bg-[var(--dash-surface-raised)] px-5 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-text)] shadow-none transition-colors hover:border-[var(--dash-primary)]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateShareCode()}
                disabled={generating}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--dash-action)] px-5 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-action-text)] shadow-none transition-colors hover:bg-[var(--dash-action-hover)] disabled:opacity-50"
              >
                {generating ? "Generating…" : "Generate & Copy Code"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {modal === "import" && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--dash-scrim)] p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Import Profile Settings"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="relative w-full max-w-md space-y-5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] backdrop-blur-md p-6 shadow-none">
            <button
              type="button"
              onClick={() => setModal(null)}
              aria-label="Close"
              className="absolute right-4 top-4 text-[var(--dash-text-secondary)] transition-colors hover:text-[var(--dash-text)]"
            >
              <X size={16} />
            </button>

            <div>
              <h3 className="font-rajdhani text-xl font-bold text-[var(--dash-text)]">
                Import Profile Settings
              </h3>
              <p className="mt-1.5 font-inter text-sm leading-relaxed text-[var(--dash-text-secondary)]">
                Paste a friend&apos;s share code below, and select which configurations you want to clone into your account.
              </p>
            </div>

            <p className="rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] p-3 font-inter text-sm font-bold text-[var(--dash-danger)]">
              Warning: Importing will overwrite your current settings for the selected items!
            </p>

            <div>
              <label className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text-secondary)]">
                Friend&apos;s Share Code
              </label>
              <input
                type="text"
                placeholder="Enter share code here..."
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                disabled={importing}
                className="mt-2 w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] px-4 py-3 font-mono text-sm text-[var(--dash-text)] focus:border-[var(--dash-primary)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[var(--dash-text-secondary)]">
                Select Settings to Import
              </label>
              <div className="mt-2 space-y-3 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-raised)] backdrop-blur-sm p-4">
                {SHARE_SECTIONS.map((section) => {
                  const on = importSections.includes(section.id);
                  return (
                    <label
                      key={section.id}
                      className="flex cursor-pointer items-center gap-3 font-inter text-sm text-[var(--dash-text)]"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          toggle(importSections, section.id, setImportSections)
                        }
                        className="h-4 w-4 rounded accent-[var(--dash-primary)]"
                      />
                      {section.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-[var(--dash-border-strong)] bg-[var(--dash-surface-raised)] px-5 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-text)] shadow-none transition-colors hover:border-[var(--dash-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleImportSettings()}
                disabled={importing || !importCode.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--dash-action)] px-6 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-[var(--dash-action-text)] shadow-none transition-colors hover:bg-[var(--dash-action-hover)] disabled:opacity-50"
              >
                {importing && <Loader2 size={14} className="animate-spin" />}
                Import Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}