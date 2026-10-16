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
import { createClient } from "@/lib/supabase/client";

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
  success: "border-[#10B981]/40 bg-[#10B981]/10 text-[#6ee7b7]",
  error: "border-red-500/40 bg-red-500/10 text-red-400",
  info: "border-[#1E3350] bg-[#13203A]/60 backdrop-blur-sm text-slate-300",
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
      className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 font-rajdhani text-xs font-bold uppercase tracking-widest backdrop-blur-sm ${NOTICE_STYLES[notice.tone]}`}
    >
      <Icon size={15} />
      {notice.text}
    </div>
  );
}

// Glassmorphic card container: frosted glass with 3px green accent line, zero box-shadow glow
const CARD_STYLE =
  "rounded-lg border border-[#10B981]/30 border-l-[3px] border-l-[#10B981] bg-[#0f172a]/60 backdrop-blur-md p-6 shadow-none transition-colors hover:border-[#10B981]/60 hover:border-l-[#10B981]";

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

  const [currentPassword, setCurrentPassword] = useState("");
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
      setCurrentPassword("");
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
      <div className="flex min-h-[40vh] items-center justify-center font-rajdhani text-sm uppercase tracking-widest text-slate-500">
        Loading account settings…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1180px] mx-auto w-full font-rajdhani">
      {/* Header */}
      <div className="flex justify-between items-start gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-6 bg-[#10B981] rounded-sm inline-block" />
            <h1 className="font-rajdhani text-3xl font-bold uppercase tracking-wider text-white md:text-4xl">
              Account Settings
            </h1>
          </div>
          <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[#94A3B8]">
            System // User_Profile_Config
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-[#10B981]/40 bg-[#0E5844]/40 px-3.5 py-1 font-rajdhani text-xs font-bold uppercase tracking-wider text-[#6ee7b7]">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          Online now
        </span>
      </div>

      {notice && <NoticeBanner notice={notice} />}

      {/* Row 1: Identity Matrix & Security Protocol */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Identity Matrix */}
        <div className={`${CARD_STYLE} flex flex-col justify-between`}>
          <div>
            <div className="border-b border-[#1E3350] pb-4">
              <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-white">
                <IdCard size={20} className="text-[#10B981]" />
                <span>Identity Matrix</span>
              </div>
              <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[#94A3B8]">
                Personal Identification Data
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="settings-display-name"
                  className="mb-2 block font-rajdhani text-xs font-bold uppercase tracking-wider text-[#6ee7b7]"
                >
                  Display Name
                </label>
                <input
                  id="settings-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={savingIdentity}
                  className="w-full rounded-lg border border-[#1E3350] bg-[#0f172a]/50 backdrop-blur-sm px-4 py-3 font-sans text-sm text-white transition-all focus:border-[#10B981] focus:bg-[#0f172a]/80 focus:outline-none"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="settings-email"
                    className="font-rajdhani text-xs font-bold uppercase tracking-wider text-[#6ee7b7]"
                  >
                    Email Address
                  </label>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#10B981]/50 bg-[#10B981]/15 px-2.5 py-0.5 font-rajdhani text-[10px] font-bold uppercase tracking-wider text-[#6ee7b7]">
                    <Check size={11} strokeWidth={3} /> {emailVerified ? "Verified" : "Unverified"}
                  </span>
                </div>
                <input
                  id="settings-email"
                  type="email"
                  value={email}
                  readOnly
                  disabled
                  className="w-full rounded-lg border border-[#1E3350] bg-[#0f172a]/50 backdrop-blur-sm px-4 py-3 font-sans text-sm text-slate-300 cursor-not-allowed"
                />
              </div>

              <div className="border-t border-[#1E3350] pt-4">
                <label
                  htmlFor="settings-khr-rate"
                  className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[#6ee7b7]"
                >
                  Exchange Rate Configuration
                </label>
                <p className="mb-2 mt-0.5 font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">
                  Conversion Protocol: 1 USD -&gt; KHR
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-3 font-rajdhani text-sm font-bold text-[#6ee7b7]">
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
                    className="w-full rounded-lg border border-[#1E3350] bg-[#0f172a]/50 backdrop-blur-sm pl-9 pr-4 py-3 font-mono text-sm font-bold text-[#6ee7b7] transition-all focus:border-[#10B981] focus:bg-[#0f172a]/80 focus:outline-none"
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
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#059669] via-[#0d8293] to-[#2563eb] px-6 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-white shadow-none transition-opacity hover:opacity-95 disabled:opacity-50"
            >
              {savingIdentity && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>

        {/* Security Protocol */}
        <div className={`${CARD_STYLE} flex flex-col justify-between`}>
          <div>
            <div className="border-b border-[#1E3350] pb-4">
              <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-white">
                <Shield size={20} className="text-[#38bdf8]" />
                <span>Security Protocol</span>
              </div>
              <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[#94A3B8]">
                Password &amp; Access Control
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="settings-current-password"
                    className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Current Password
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    disabled={sendingReset || !email}
                    className="flex items-center gap-1 font-rajdhani text-[11px] font-bold uppercase tracking-wider text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
                  >
                    <KeyRound size={12} />
                    {sendingReset ? "Sending…" : "Forgot Password?"}
                  </button>
                </div>
                <input
                  id="settings-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={updatingPassword}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-[#1E3350] bg-[#0f172a]/50 backdrop-blur-sm px-4 py-3 font-sans text-sm text-white transition-all focus:border-[#10B981] focus:bg-[#0f172a]/80 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="settings-new-password"
                    className="mb-2 block font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-300"
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
                    className="w-full rounded-lg border border-[#1E3350] bg-[#0f172a]/50 backdrop-blur-sm px-4 py-3 font-sans text-sm text-white transition-all focus:border-[#10B981] focus:bg-[#0f172a]/80 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="settings-confirm-password"
                    className="mb-2 block font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-300"
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
                    className="w-full rounded-lg border border-[#1E3350] bg-[#0f172a]/50 backdrop-blur-sm px-4 py-3 font-sans text-sm text-white transition-all focus:border-[#10B981] focus:bg-[#0f172a]/80 focus:outline-none"
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
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#273B56] bg-[#162234]/80 backdrop-blur-sm px-6 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-white shadow-none transition-colors hover:border-[#10B981] hover:bg-[#1a293e] disabled:opacity-50"
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
          <div className="border-b border-[#1E3350] pb-4">
            <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-white">
              <UserRound size={20} className="text-[#10B981]" />
              <span>Basic Information</span>
            </div>
            <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[#94A3B8]">
              Public profile, picture, cover and tip link
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="settings-username"
                  className="font-rajdhani text-xs font-bold uppercase tracking-wider text-[#6ee7b7]"
                >
                  Choose your username
                </label>
                {username && (
                  <a
                    href={`/pay/${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-rajdhani text-[11px] font-bold uppercase tracking-wider text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <Link2 size={12} />
                    Visit Tip Page
                  </a>
                )}
              </div>
              <div className="flex items-center rounded-lg border border-[#1E3350] bg-[#0f172a]/50 backdrop-blur-sm overflow-hidden">
                <span className="shrink-0 bg-[#0c1322] px-4 py-3 font-rajdhani text-xs font-bold uppercase tracking-wider text-[#94A3B8] border-r border-[#1E3350]">
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
                  className="flex-1 bg-transparent px-4 py-3 font-sans text-sm text-white outline-none transition-all focus:bg-[#0f172a]/80"
                />
              </div>
              <p className="mt-1.5 font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">
                This sets your public tipping URL. Display name will show on the tip page.
              </p>
            </div>

            {/* Profile Picture + Profile Cover */}
            <div className="mt-4 border-t border-[#1E3350] pt-4 lg:col-span-2">
              <p className="font-rajdhani text-xs font-bold uppercase tracking-wider text-white">
                Profile Picture
              </p>
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-[#1E3350] bg-[#0f172a]/50 px-3 py-2">
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded border border-[#1E3350] bg-[#0c1322]">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center font-rajdhani text-[10px] font-bold text-[#10B981]">
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
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-white outline-none"
                  />
                ) : (
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-[11px] ${
                      avatarUrl ? "text-[#94A3B8]" : "text-[#64748B]"
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
                    className="rounded p-1.5 text-[#64748B] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title="Remove profile picture"
                    aria-label="Remove profile picture"
                    onClick={() => setAvatarUrl("")}
                    className="rounded p-1.5 text-[#64748B] transition-colors hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
                  >
                    <Trash2 size={14} />
                  </button>
                  <label
                    title="Upload from device"
                    className="cursor-pointer rounded p-1.5 text-[#64748B] transition-colors hover:text-[#10B981] focus-within:text-[#10B981]"
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

              <p className="mt-4 font-rajdhani text-xs font-bold uppercase tracking-wider text-white">
                Profile Cover
              </p>
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-[#1E3350] bg-[#0f172a]/50 px-3 py-2">
                <span className="h-8 w-12 shrink-0 overflow-hidden rounded border border-[#1E3350] bg-[#0c1322]">
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
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-white outline-none"
                  />
                ) : (
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-[11px] ${
                      bannerUrl ? "text-[#94A3B8]" : "text-[#64748B]"
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
                    className="rounded p-1.5 text-[#64748B] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title="Remove profile cover"
                    aria-label="Remove profile cover"
                    onClick={() => setBannerUrl("")}
                    className="rounded p-1.5 text-[#64748B] transition-colors hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
                  >
                    <Trash2 size={14} />
                  </button>
                  <label
                    title="Upload from device"
                    className="cursor-pointer rounded p-1.5 text-[#64748B] transition-colors hover:text-[#10B981] focus-within:text-[#10B981]"
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
              <p className="mt-2 font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">
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
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#059669] via-[#0d8293] to-[#2563eb] px-6 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-white shadow-none transition-opacity hover:opacity-95 disabled:opacity-50"
            >
              {savingIdentity && <Loader2 size={14} className="animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>

      {/* Row 2: Discord Integration */}
      <div className={CARD_STYLE}>
        <div className="border-b border-[#1E3350] pb-4">
          <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-white">
            <DiscordMark size={22} className="text-[#818CF8]" />
            <span>Discord Integration</span>
          </div>
          <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[#94A3B8]">
            Premium Role Syncing &amp; Identity
          </p>
        </div>

        <div className="mt-5 flex flex-col items-center justify-between gap-4 rounded-lg border border-[#1E3350] bg-[#0f172a]/50 backdrop-blur-sm p-5 sm:flex-row">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#1E3350] bg-[#131D2E] text-[#94A3B8]">
              <DiscordMark size={22} />
            </div>
            <div>
              <p className="font-rajdhani text-base font-bold uppercase text-white">
                Not Connected
              </p>
              <p className="font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">
                Link Auto-Assigns Premium Roles
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

      {/* Row 3: Live Announcements Banner */}
      <Link
        href="/dashboard/kit-client"
        className={`group flex items-center justify-between ${CARD_STYLE} p-5 hover:bg-[#131f36]/70`}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981] transition-transform group-hover:scale-105">
            <Megaphone size={20} />
          </div>
          <div>
            <h3 className="font-rajdhani text-base font-bold uppercase text-white transition-colors group-hover:text-[#6ee7b7]">
              Live Announcements
            </h3>
            <p className="font-inter text-sm text-[#94A3B8]">
              Manage Telegram &amp; Discord &quot;I&apos;m Live&quot; alerts
            </p>
          </div>
        </div>
        <span className="text-xl text-[#94A3B8] transition-colors group-hover:text-[#6ee7b7]">
          →
        </span>
      </Link>



      {/* Row 5: Recent Login Sessions */}
      <div className={CARD_STYLE}>
        <div className="flex items-center justify-between gap-4 border-b border-[#1E3350] pb-4">
          <div>
            <div className="flex items-center gap-2.5 font-rajdhani text-xl font-bold uppercase tracking-wider text-white">
              <History size={20} className="text-amber-400" />
              <span>Recent Login Sessions</span>
            </div>
            <p className="mt-1 font-rajdhani text-xs font-bold uppercase tracking-widest text-[#94A3B8]">
              Last 5 Sign-Ins · IP &amp; Device
            </p>
          </div>
          <Link
            href="/dashboard/settings/login-history"
            className="font-rajdhani text-xs font-bold uppercase tracking-wider text-amber-400 transition-colors hover:text-amber-300"
          >
            View Full History →
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1E3350] font-rajdhani text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                <th className="px-3 py-2.5">Logged In</th>
                <th className="px-3 py-2.5">Logged Out</th>
                <th className="px-3 py-2.5">IP</th>
                <th className="px-3 py-2.5">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E3350]/60 font-mono text-xs text-[#94A3B8]">
              {sessionsError && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-red-400">
                    {sessionsError}
                  </td>
                </tr>
              )}
              {!sessionsError && sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-slate-500 font-rajdhani uppercase tracking-widest">
                    No sign-in history recorded yet.
                  </td>
                </tr>
              )}
              {sessions.map((row) => {
                const active = !row.logged_out_at;
                return (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-[#13203A]/70"
                  >
                    <td className="px-3 py-3 text-slate-200">
                      {formatStamp(row.logged_in_at)}
                    </td>
                    <td className="px-3 py-3">
                      {active ? (
                        <span className="font-rajdhani text-xs font-bold text-[#6ee7b7]">
                          ● Active now ({formatStamp(row.logged_in_at)})
                        </span>
                      ) : (
                        formatStamp(row.logged_out_at)
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-300">{row.ip_address ?? "—"}</td>
                    <td
                      className="max-w-xs truncate px-3 py-3 text-slate-400"
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Share Profile Settings"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="relative w-full max-w-md space-y-5 rounded-lg border border-[#1E3350] bg-[#0f172a]/95 backdrop-blur-md p-6 shadow-none">
            <button
              type="button"
              onClick={() => setModal(null)}
              aria-label="Close"
              className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-white"
            >
              <X size={16} />
            </button>

            <div>
              <h3 className="font-rajdhani text-xl font-bold text-white">
                Share Profile Settings
              </h3>
              <p className="mt-1.5 font-inter text-sm leading-relaxed text-[#94A3B8]">
                Select the configurations you want to share, then generate your code.
              </p>
            </div>

            <div>
              <label className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Select Settings to Share
              </label>
              <div className="mt-2 space-y-3 rounded-lg border border-[#1E3350] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                {SHARE_SECTIONS.map((section) => {
                  const on = shareSections.includes(section.id);
                  return (
                    <label
                      key={section.id}
                      className="flex cursor-pointer items-center gap-3 font-inter text-sm text-white"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          toggle(shareSections, section.id, setShareSections)
                        }
                        className="h-4 w-4 rounded accent-[#10B981]"
                      />
                      {section.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Profile Share Code
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  readOnly
                  aria-label="Profile share code"
                  placeholder="Click Generate below..."
                  value={shareCode}
                  className="w-full rounded-lg border border-[#1E3350] bg-[#0f172a]/60 px-3 py-2.5 font-mono text-xs text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyShareCode()}
                  disabled={!shareCode}
                  className="flex-none rounded-lg border border-[#273B56] bg-[#1C293D] px-4 py-2.5 font-rajdhani text-xs font-bold uppercase text-white shadow-none transition-colors hover:border-[#10B981] disabled:opacity-50"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-[#273B56] bg-[#1C293D] px-5 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-white shadow-none transition-colors hover:border-[#10B981]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateShareCode()}
                disabled={generating}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#059669] via-[#0d8293] to-[#2563eb] px-5 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-white shadow-none transition-opacity hover:opacity-95 disabled:opacity-50"
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Import Profile Settings"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div className="relative w-full max-w-md space-y-5 rounded-lg border border-[#1E3350] bg-[#0f172a]/95 backdrop-blur-md p-6 shadow-none">
            <button
              type="button"
              onClick={() => setModal(null)}
              aria-label="Close"
              className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-white"
            >
              <X size={16} />
            </button>

            <div>
              <h3 className="font-rajdhani text-xl font-bold text-white">
                Import Profile Settings
              </h3>
              <p className="mt-1.5 font-inter text-sm leading-relaxed text-[#94A3B8]">
                Paste a friend&apos;s share code below, and select which configurations you want to clone into your account.
              </p>
            </div>

            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 font-inter text-sm font-bold text-red-400">
              Warning: Importing will overwrite your current settings for the selected items!
            </p>

            <div>
              <label className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Friend&apos;s Share Code
              </label>
              <input
                type="text"
                placeholder="Enter share code here..."
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
                disabled={importing}
                className="mt-2 w-full rounded-lg border border-[#1E3350] bg-[#0f172a]/60 px-4 py-3 font-mono text-sm text-white focus:border-[#10B981] focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-rajdhani text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                Select Settings to Import
              </label>
              <div className="mt-2 space-y-3 rounded-lg border border-[#1E3350] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                {SHARE_SECTIONS.map((section) => {
                  const on = importSections.includes(section.id);
                  return (
                    <label
                      key={section.id}
                      className="flex cursor-pointer items-center gap-3 font-inter text-sm text-white"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          toggle(importSections, section.id, setImportSections)
                        }
                        className="h-4 w-4 rounded accent-[#10B981]"
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
                className="rounded-lg border border-[#273B56] bg-[#1C293D] px-5 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-white shadow-none transition-colors hover:border-[#10B981]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleImportSettings()}
                disabled={importing || !importCode.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#059669] via-[#0d8293] to-[#2563eb] px-6 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-widest text-white shadow-none transition-opacity hover:opacity-95 disabled:opacity-50"
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