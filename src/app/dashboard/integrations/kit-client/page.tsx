"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Info,
  LoaderCircle,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/ui/PageHeader";
import styles from "./kit-client.module.css";

const BRIDGE = "http://127.0.0.1:3113";

/**
 * How long to wait for the bridge to hand over a QR before admitting it is not
 * coming. Telegram tokens are generated within a second of boot; anything past
 * this is a real failure, not slow work.
 */
const QR_WAIT_SECONDS = 20;

/**
 * Headers every bridge call must carry.
 *
 * The bridge binds to loopback, which stops remote hosts but not web pages: any
 * site the creator opened could fetch it and read the response. The bridge now
 * refuses any origin that is not loopback, and requires this header so the
 * browser has to complete a CORS preflight first -- which it fails, because the
 * preflight is answered from the same allowlist.
 *
 * The value is deliberately not a secret. It ships in this bundle; its job is to
 * make the request non-simple so the origin check gets a say, not to be a
 * credential.
 */
const BRIDGE_HEADERS = { "X-Kit-Client": "streamkit-dashboard" };

type BridgeState = {
  status: string;
  qr: string | null;
  groups: { id: string; title: string; avatar: string | null; isPublic: boolean }[];
  error: string | null;
  needs2fa: boolean;
  listening: { chatId: string; botUsername: string } | null;
};

type TelegramGroup = {
  id: string;
  title: string;
  avatar: string | null;
  isPublic: boolean;
};

type TipRow = {
  id: string;
  tipper_name: string;
  amount: number;
  currency: string;
  message: string | null;
  created_at: string;
  payment_method?: string | null;
  payment_status?: string | null;
  creator_id?: string | null;
  telegram_chat_id?: string | number | null;
  chatId?: string | number | null;
};

const STORAGE_KEY = "Kit Steam-active-telegram-group";
const CLEARED_AT_KEY = "kit-client-tips-cleared-at";

function GroupAvatar({ src, title }: { src?: string | null; title: string }) {
  const [error, setError] = useState(false);

  if (src && !error) {
    return <img src={src} alt={title} className={styles.avatarImg} onError={() => setError(true)} />;
  }

  return <span className={styles.avatar}>{title ? title.charAt(0).toUpperCase() : "G"}</span>;
}

function StatusBadge({ children, variant = "live" }: { children: React.ReactNode; variant?: "live" | "muted" }) {
  return (
    <span className={`${styles.badge} ${variant === "live" ? styles.badgeLive : styles.badgeMuted}`}>
      {children}
    </span>
  );
}

export default function KitClientPage() {
  const [supabase] = useState(() => createClient());
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [bridgeOffline, setBridgeOffline] = useState(false);
  const [password, setPassword] = useState("");
  const [chatId, setChatId] = useState("");
  const [botUsername, setBotUsername] = useState("@PayWayByABA_bot");
  const [logs, setLogs] = useState<TipRow[]>([]);
  const [clearedAt, setClearedAt] = useState<number>(() => {
    try {
      return typeof window === "undefined" ? 0 : Number(window.localStorage.getItem(CLEARED_AT_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  const [stage, setStage] = useState<"qr" | "2fa_required" | "authenticated" | "listening">("qr");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [ttl, setTtl] = useState(30);
  const qrRef = useRef<string | null>(null);
  const [qrStalled, setQrStalled] = useState(false);
  const logsRef = useRef<HTMLDivElement | null>(null);
  const [activeGroup, setActiveGroup] = useState<TelegramGroup | null>(null);

  // Reading localStorage must happen after hydration: a useState initializer
  // would touch window during SSR and cause a hydration mismatch.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setActiveGroup(JSON.parse(saved) as TelegramGroup);
    } catch {}
  }, []);

  useEffect(() => {
    logsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`${BRIDGE}/state`, { cache: "no-store", headers: BRIDGE_HEADERS });
        const data = (await res.json()) as BridgeState;
        if (cancelled) return;
        setBridge(data);
        setBridgeOffline(false);

        if (data.status === "listening" && stage !== "authenticated") {
          setStage("listening");
        } else if (data.status === "groups") {
          setStage((s) => (s === "listening" ? s : "authenticated"));
        } else if (data.status === "password") {
          setStage((s) => (s === "listening" ? s : "2fa_required"));
        } else if (data.status === "qr") {
          setPassword("");
          setStage((s) => (s === "listening" ? s : "qr"));
        } else if (data.status === "starting") {
          // "starting" is transitional. An attached listener (state.listening) is
          // the ground truth, so trust it over the status string. Without this
          // branch an unrecognised status left `stage` pinned at its initial
          // "qr" and the page rendered the "Generating QR code..." spinner
          // forever on a perfectly healthy, already-signed-in bridge.
          setStage((s) => (data.listening ? "listening" : s));
        }

        if (data.qr && data.qr !== qrRef.current) {
          qrRef.current = data.qr;
          setTtl(30);
          // A token finally arrived, so any earlier "no QR" verdict is void.
          setQrStalled(false);
        }
      } catch {
        if (!cancelled) setBridgeOffline(true);
      }
    }

    poll();
    const t = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [stage]);

  useEffect(() => {
    const t = window.setInterval(() => setTtl((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const isViewable = (row: TipRow) =>
      row.payment_method === "aba_payway" &&
      (row.payment_status === "successful" || row.payment_status === "test");

    async function refreshLogs() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setLogs([]);
        return;
      }

      let query = supabase
        .from("tips")
        .select("id, tipper_name, amount, currency, message, created_at, payment_method, payment_status, creator_id")
        .eq("payment_method", "aba_payway")
        .in("payment_status", ["successful", "test"])
        .order("created_at", { ascending: false })
        .limit(50);
      query = query.eq("creator_id", user.id);

      const { data } = await query;
      if (cancelled) return;
      setLogs(((data as TipRow[] | null) ?? []).filter((row) => new Date(row.created_at).getTime() > clearedAt));
    }

    async function initRealtime() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channel = supabase
        .channel("kit-client-tips")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tips",
            filter: `creator_id=eq.${user.id}`,
          },
          (payload) => {
            const row = payload.new as TipRow;
            if (!isViewable(row)) return;
            if (new Date(row.created_at).getTime() <= clearedAt) return;
            setLogs((prev) => [row, ...prev.filter((t) => t.id !== row.id)].slice(0, 50));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tips",
            filter: `creator_id=eq.${user.id}`,
          },
          () => {
            void refreshLogs();
          },
        )
        .subscribe();
      if (cancelled && channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    }

    void refreshLogs();
    void initRealtime();

    const interval = window.setInterval(refreshLogs, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, clearedAt]);

  async function submit2fa() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${BRIDGE}/2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...BRIDGE_HEADERS },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Two-step verification failed.");
      }
      setNotice("Password accepted. Loading your groups...");
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the local bridge.");
    } finally {
      setBusy(false);
    }
  }

  async function startListening(groupId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/telegram/local-agent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: groupId, paywayBotUsername: botUsername }),
      });
      const agent = await res.json();
      if (!res.ok || !agent.success) throw new Error(agent.error || "Agent creation failed.");

      const bridgeRes = await fetch(`${BRIDGE}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...BRIDGE_HEADERS },
        body: JSON.stringify({ agentToken: agent.agentToken, chatId: groupId, botUsername }),
      });
      const bridgeResult = await bridgeRes.json();
      if (!bridgeRes.ok) throw new Error(bridgeResult.error || "Bridge configuration failed.");

      const { data: { user } } = await supabase.auth.getUser();
      const group = bridge?.groups.find((g) => g.id === groupId) ?? null;
      if (group) {
        setActiveGroup(group);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(group));
        } catch {}
      }
      if (user) {
        await supabase.from("telegram_groups").upsert(
          {
            creator_id: user.id,
            group_id: groupId,
            group_title: group?.title ?? "Untitled",
            is_active: true,
            // session_data is deliberately NOT written. It used to receive the
            // cleartext Telegram MTProto session from GET /session, so a full
            // account takeover credential landed in the database. Nothing ever
            // read it back: the bridge loads its agent token from
            // telegram-local-agent.json on disk, and ingestion only uses the
            // SHA-256 token hash. Storing it added a remote copy of the session
            // with no consumer. The column still exists (see
            // 20261005000000_telegram_group_session_columns.sql); dropping it is a
            // separate, deliberate migration so this change is verifiable first.
          },
          { onConflict: "creator_id,group_id" },
        );
      }

      setStage("listening");
      setNotice(
        bridgeResult.switched
          ? "Switched to the new group and listening for ABA PayWay messages."
          : "Listening for ABA PayWay messages.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to start listener.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fetch(`${BRIDGE}/logout`, { method: "POST", headers: BRIDGE_HEADERS });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("telegram_groups")
          .update({ is_active: false })
          .eq("creator_id", user.id)
          .eq("is_active", true);
      }
      qrRef.current = null;
      setQrStalled(false);
      setChatId("");
      setPassword("");
      setActiveGroup(null);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {}
      setStage("qr");
      setNotice("Logged out. Scan the QR code to sign in again.");
    } catch {
      setError("Could not reach the local bridge.");
    } finally {
      setBusy(false);
    }
  }

  const selectedGroup = useMemo(
    () => bridge?.groups.find((g) => g.id === chatId) ?? null,
    [bridge, chatId],
  );

  const activeStage = useMemo(() => {
    if (bridgeOffline) return "offline";

    // Once the bridge answers, its status decides the screen. This used to
    // CHANGE GROUP pins the picker. The poll deliberately never overwrites a
    // stage of "authenticated", so this is the only escape hatch out of the
    // listening screen -- it must be decided before the bridge status below.
    if (stage === "authenticated") return "authenticated";

    // consult the local `stage` first, which meant every bridge status the poll
    // effect did not recognise was masked and fell through to the QR screen.
    if (bridge) {
      // A bridge in error is NOT the QR screen. It previously fell through to
      // `qr` and rendered the "Generating QR code..." placeholder, so a dropped
      // Telegram socket looked identical to a login waiting to happen. If the
      // bridge is retrying on its own there is nothing for the creator to do.
      if (bridge.status === "error") return "error";
      // An attached listener is the ground truth and outranks the status string.
      // This returns "listening", not "authenticated": returning the latter made
      // the whole listening screen unreachable, taking the transaction log and
      // the LOGOUT / CHANGE GROUP controls with it.
      if (bridge.status === "listening" || bridge.listening) return "listening";
      if (bridge.status === "groups" || bridge.status === "authenticated") return "authenticated";
      if (bridge.status === "password" || bridge.needs2fa) return "2fa";
      if (bridge.status === "qr") return "qr";
      // Transitional only -- keep the current stage rather than inventing one.
      if (bridge.status === "starting" || bridge.status === "booting") {
        return bridge.listening ? "listening" : stage;
      }
    }

    // Bridge silent or not yet polled: the local stage drives the screen, which
    // is what the 2FA / start-listening / logout actions set optimistically.
    if (stage === "2fa_required") return "2fa";
    if (stage === "listening") return "listening";
    return "qr";
  }, [bridge, bridgeOffline, stage]);

  // A missing QR must eventually say so. While the page sat on the QR stage with
  // no token it rendered an indeterminate spinner that read as "still working",
  // whether the bridge was offline, errored, or reporting a status this page
  // does not recognise. Only ever sets true here -- the reset happens when a
  // token actually arrives (see the poll above) and on logout.
  useEffect(() => {
    if (activeStage !== "qr" || bridge?.qr || qrStalled) return;
    const t = window.setTimeout(() => setQrStalled(true), QR_WAIT_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [activeStage, bridge?.qr, qrStalled]);

  return (
    <div className={styles.screen}>
      <div className={styles.pageInner}>
        <PageHeader
          eyebrow="Steam Kit // Integrations"
          title="Telegram Kit Client"
          description="Connect Telegram through the local bridge to capture ABA PayWay payments for your alerts."
        />
        <div className={styles.card}>
        <header className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Telegram bridge</h2>
          <StatusBadge variant="muted">ABA PayWay bridge</StatusBadge>
        </header>

        {activeStage === "offline" && (
          <div className={styles.offlineState}>
            <Info size={32} className={styles.warningIcon} />
            <p>Start the local bridge with <code>npm run kit-client:bridge</code>, then reload.</p>
          </div>
        )}

        {activeStage === "error" && (
          <div className={styles.offlineState} role="alert">
            <X size={32} className={styles.dangerIcon} />
            <p>
              The Telegram bridge cannot reach Telegram right now. It retries on its
              own — this screen updates as soon as the connection is back.
            </p>
          </div>
        )}

        {activeStage === "qr" && (
          <section aria-labelledby="qr-title" className={styles.section}>
            <div className={styles.hero}>
              {bridge?.qr ? (
                <div className={styles.qrWrapper}>
                  <QRCodeSVG
                    value={bridge.qr}
                    size={220}
                    level="M"
                    includeMargin={false}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                  />
                  <div className={styles.qrLogoOverlay}>
                    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
                      <circle cx="24" cy="24" r="24" fill="#0088cc" />
                      <path
                        fill="#FFFFFF"
                        d="M34.9 13.4 8.9 21.6c-1.6.6-1.6 2.9.2 3.4l6.7 2 2.6 8.3c.4 1.3 2 1.6 2.8.6l3.8-4.8 6.4 4.7c1.2.9 3 .3 3.4-1.2l4.6-17.6c.5-1.9-1.5-3.5-3.5-2.6z"
                      />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className={styles.qrPlaceholder} role={qrStalled ? "alert" : undefined}>
                  {qrStalled ? (
                    <>
                      <X size={30} className={styles.dangerIcon} />
                      <span>
                        Telegram did not send a QR code. The bridge reported{" "}
                        <code>{bridge?.status ?? "no response"}</code> — check its terminal
                        output, then reload this page.
                      </span>
                    </>
                  ) : (
                    <>
                      <LoaderCircle size={32} className={styles.spinner} />
                      <span>Generating QR code...</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <h2 id="qr-title" className={styles.h1}>LOG IN TO TELEGRAM</h2>
            <p className={styles.subCaption}>QR REFRESHES IN {String(ttl).padStart(2, "0")}s</p>
            <ol className={styles.steps}>
              <li>Open Telegram on your phone</li>
              <li>Go to Settings &gt; Devices &gt; Link Desktop Device</li>
              <li>Point your phone at this screen to confirm login</li>
              <li>If QR code doesn&apos;t show in 30sec please refresh the page</li>
            </ol>
          </section>
        )}

        {activeStage === "2fa" && (
          <section aria-labelledby="pw-title" className={styles.section}>
            <div className={styles.hero}>
              <ShieldCheck size={56} strokeWidth={1.4} className={styles.accentIcon} />
            </div>
            <h2 id="pw-title" className={styles.h1}>TWO-STEP VERIFICATION</h2>
            <input
              className={styles.input}
              type="password"
              placeholder="Telegram 2FA password"
              value={password}
              aria-label="Telegram 2FA password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void submit2fa()} disabled={busy || !password}>
              {busy ? <LoaderCircle size={16} className={styles.spinner} /> : <Lock size={16} />}
              SUBMIT PASSWORD
            </button>
          </section>
        )}

        {activeStage === "authenticated" && (
          <section aria-labelledby="group-title" className={styles.section}>
            <div className={styles.authSuccess}>
              <Check size={20} className={styles.accentIcon} />
              <span>Successfully logged in to Telegram</span>
            </div>
            <hr className={styles.divider} />
            <h2 id="group-title" className={styles.h1}>SELECT TELEGRAM GROUP</h2>
            <p className={styles.sectionDesc}>Choose the group linked with ABA PayWay for tip notifications</p>
            <div className={styles.scrollList}>
              {bridge?.groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`${styles.row} ${chatId === g.id ? styles.rowSelected : ""}`}
                  onClick={() => setChatId(g.id)}
                  aria-pressed={chatId === g.id}
                >
                  <GroupAvatar src={g.avatar} title={g.title} />
                  <div className={styles.groupInfo}>
                    <span className={styles.rowTitle}>
                      {g.title} {g.isPublic ? null : <Lock size={12} style={{ verticalAlign: "middle", marginLeft: 4 }} />}
                    </span>
                    <span className={styles.rowSub}>ID {g.id}</span>
                  </div>
                  {chatId === g.id && (
                    <span className={styles.checkBadge} aria-label="Selected">
                      <Check size={16} />
                    </span>
                  )}
                </button>
              ))}
              {(bridge?.groups.length ?? 0) === 0 && (
                <p className={styles.centered}>No groups found on this account.</p>
              )}
            </div>
            <div className={styles.botInputWrapper}>
              <label className={styles.inputLabel} htmlFor="bot-username">PAYWAY BOT USERNAME</label>
              <input
                id="bot-username"
                className={styles.input}
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value)}
                aria-label="PayWay bot username"
              />
            </div>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} onClick={() => void startListening(chatId)} disabled={busy || !chatId}>
              {busy ? <LoaderCircle size={16} className={styles.spinner} /> : <Zap size={16} />}
              START LISTENING
            </button>
          </section>
        )}

        {activeStage === "listening" && (
          <section className={styles.section}>
            <div className={`${styles.row} ${styles.rowSelected} ${styles.activeGroupRow}`}>
              <GroupAvatar src={(activeGroup ?? selectedGroup)?.avatar} title={activeGroup?.title ?? selectedGroup?.title ?? ""} />
              <div className={styles.groupInfo}>
                <span className={styles.rowTitle}>{activeGroup?.title ?? selectedGroup?.title ?? bridge?.listening?.chatId ?? "\u2014"}</span>
                <span className={styles.rowSub}>ID {bridge?.listening?.chatId ?? activeGroup?.id ?? "\u2014"} \u00B7 @{bridge?.listening?.botUsername ?? botUsername}</span>
              </div>
              <StatusBadge>Connected</StatusBadge>
            </div>

            <div className={styles.sectionHeader}>
              <h2 id="logs-title" className={styles.h2}>TRANSACTION LOGS</h2>
              <StatusBadge variant="live">LIVE</StatusBadge>
            </div>
            <hr className={styles.divider} />

            {logs.filter((row) => {
              const logChat = row.telegram_chat_id ?? row.chatId;
              return logChat == null || activeGroup == null || String(logChat) === activeGroup.id;
            }).length === 0 ? (
              <p className={styles.centered}>No transactions captured yet</p>
            ) : (
              <div className={styles.logList} ref={logsRef}>
                {logs
                  .filter((row) => {
                    const logChat = row.telegram_chat_id ?? row.chatId;
                    return logChat == null || activeGroup == null || String(logChat) === activeGroup.id;
                  })
                  .map((row) => (
                    <article className={`${styles.logRow} ${styles.logEntry}`} key={row.id}>
                      <div className={styles.logLeft}>
                        <div className={styles.logTitleLine}>
                          <span className={styles.logAmount}>
                            {row.currency === "KHR" ? `KHR ${Number(row.amount).toLocaleString()}` : `$ ${Number(row.amount).toFixed(2)}`}
                          </span>
                          <span className={styles.logName}>{row.tipper_name}</span>
                        </div>
                        {row.message ? <p className={styles.logMessage}>{row.message}</p> : null}
                      </div>
                      <div className={styles.logRight}>
                        <span className={styles.logMeta}>{new Date(row.created_at).toLocaleString()}</span>
                        <span className={styles.payBadge}>ABA PAY ✓</span>
                      </div>
                    </article>
                  ))}
              </div>
            )}

            <hr className={styles.divider} />
            <div className={styles.btnRow}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { const now = Date.now(); setClearedAt(now); setLogs([]); try { window.localStorage.setItem(CLEARED_AT_KEY, String(now)); } catch {} }}>
                <Trash2 size={15} /> CLEAR LOG
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { setChatId(""); setActiveGroup(null); try { window.localStorage.removeItem(STORAGE_KEY); } catch {} setStage("authenticated"); }}>
                <RefreshCw size={15} /> CHANGE GROUP
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => void logout()} disabled={busy}>
                {busy ? <LoaderCircle size={15} className={styles.spinner} /> : <LogOut size={15} />} LOGOUT
              </button>
            </div>

            {noticeVisible && (
              <div className={styles.notice}>
                <div className={styles.noticeLabel}><Info size={13} /> Notice</div>
                <p className={styles.noticeText}>Please keep this tab open, otherwise it won&apos;t receive transactions.</p>
                <button type="button" aria-label="Dismiss notice" className={styles.noticeClose} onClick={() => setNoticeVisible(false)}>
                  <X size={14} />
                </button>
              </div>
            )}
          </section>
        )}

        {noticeVisible && activeStage !== "listening" && (
          <div className={styles.notice}>
            <div className={styles.noticeLabel}><Info size={13} /> Notice</div>
            <p className={styles.noticeText}>
              Your Telegram session is encrypted and stored by the local bridge on this machine, not in your browser.
            </p>
            <button type="button" aria-label="Dismiss notice" className={styles.noticeClose} onClick={() => setNoticeVisible(false)}>
              <X size={14} />
            </button>
          </div>
        )}

        <p className={styles.statusBar} aria-live="polite">
          {error || notice || `Bridge: ${bridge?.status ?? "offline"}`}
        </p>
        </div>
      </div>
    </div>
  );
}
