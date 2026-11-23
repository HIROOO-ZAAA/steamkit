"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  MonitorPlay,
  RefreshCw,
  Server,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  eventStatusLabel,
  telegramBridgeSnapshot,
  ttsHealthSnapshot,
  type HealthLevel,
} from "@/lib/dashboard/health";
import PageHeader from "@/components/ui/PageHeader";
import styles from "./health.module.css";

const BRIDGE = "http://127.0.0.1:3113";
const BRIDGE_HEADERS = { "X-Kit-Client": "streamkit-dashboard" };
const REFRESH_MS = 30_000;

type EventItem = { at: string; status: string; source: string };
type Observation = {
  at: string;
  stage: "started" | "provider_audio" | "failed" | "audio_ready";
  result: "started" | "audio" | "failed";
  voiceSource?: "clone" | "fallback";
  providerStatus?: number;
  failureKind?: "timeout" | "provider" | "transport" | "invalid_audio" | "storage";
};
type HealthPayload = {
  checkedAt: string;
  database: { level: HealthLevel; detail: string };
  recentEvents: { level: HealthLevel; detail: string; items: EventItem[] };
  tts: {
    configured: boolean;
    enabled: boolean | null;
    cloneReadiness: "ready" | "not_selected" | "needs_setup" | "unknown";
    observation: Observation | null;
    detail: string;
  };
  overlay: { level: HealthLevel; detail: string };
  issues: string[];
};

function timeLabel(value: string | null | undefined) {
  if (!value) return "Not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not reported" : date.toLocaleString();
}

function StatusIcon({ level }: { level: HealthLevel }) {
  if (level === "healthy") return <CheckCircle2 aria-hidden="true" />;
  if (level === "degraded") return <AlertTriangle aria-hidden="true" />;
  if (level === "offline") return <XCircle aria-hidden="true" />;
  return <CircleHelp aria-hidden="true" />;
}

export default function HealthDashboardPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [bridge, setBridge] = useState(() => telegramBridgeSnapshot({ reachable: false }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    const healthRequest = fetch("/api/dashboard/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const bridgeRequest = fetch(`${BRIDGE}/state`, {
      cache: "no-store",
      headers: BRIDGE_HEADERS,
      signal: AbortSignal.timeout(3_000),
    });

    const [healthResult, bridgeResult] = await Promise.allSettled([healthRequest, bridgeRequest]);

    if (healthResult.status === "fulfilled" && healthResult.value.ok) {
      const payload = await healthResult.value.json().catch(() => null) as HealthPayload | null;
      if (payload?.checkedAt) setData(payload);
      else setError("Health status returned an unreadable response.");
    } else if (healthResult.status === "fulfilled") {
      setError(healthResult.value.status === 401
        ? "Your session expired. Sign in again to load health status."
        : "Health status could not be loaded. Try refreshing.");
    } else {
      setError("Health status could not be reached. Try refreshing.");
    }

    if (bridgeResult.status === "fulfilled" && bridgeResult.value.ok) {
      const raw = await bridgeResult.value.json().catch(() => null) as {
        status?: unknown;
        listening?: unknown;
        error?: unknown;
      } | null;
      setBridge(telegramBridgeSnapshot({
        reachable: true,
        status: raw?.status,
        listening: raw?.listening,
        hasError: Boolean(raw?.error),
      }));
    } else {
      setBridge(telegramBridgeSnapshot({ reachable: false }));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!previewing) return;
    const timer = window.setTimeout(() => setPreviewing(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [previewing]);

  const tts = data ? ttsHealthSnapshot(data.tts) : { level: "unknown" as const, label: "Loading", detail: "Checking available TTS signals." };
  const issues = [
    ...(data?.issues ?? []),
    ...(data?.tts.configured === false ? ["TTS backend is not configured."] : []),
    ...(data?.tts.enabled === false ? ["Text-to-speech is disabled in saved alert settings."] : []),
    ...(data?.tts.cloneReadiness === "not_selected" ? ["No enabled voice clone is selected. Choose one in Voice Settings before testing cloned speech."] : []),
    ...(data?.tts.cloneReadiness === "needs_setup" ? ["The selected voice clone is not ready to speak. Review it in Voice Settings."] : []),
    ...(data?.tts.cloneReadiness === "unknown" ? ["The selected voice clone could not be verified."] : []),
    ...(data?.tts.observation?.result === "failed" ? [tts.detail] : []),
    ...(bridge.level === "degraded" ? [bridge.detail] : []),
  ];

  const cards: Array<{ title: string; level: HealthLevel; label: string; detail: string; icon: ReactNode; meta?: string; action?: { href: string; label: string } }> = [
    {
      title: "Telegram bridge",
      level: bridge.level,
      label: bridge.label,
      detail: bridge.detail,
      icon: <Wifi aria-hidden="true" />,
      meta: "Last successful connection: not exposed by the local bridge",
    },
    {
      title: "Voice synthesis",
      level: tts.level,
      label: tts.label,
      detail: tts.detail,
      icon: <AudioLines aria-hidden="true" />,
      meta: data?.tts.observation ? `Last result: ${timeLabel(data.tts.observation.at)}` : "Last result: none observed on this app process",
      action: data?.tts.cloneReadiness === "not_selected" || data?.tts.cloneReadiness === "needs_setup"
        ? {
            href: "/dashboard/voice-settings",
            label: data.tts.cloneReadiness === "not_selected" ? "Choose a voice clone" : "Fix selected clone",
          }
        : undefined,
    },
    {
      title: "OBS overlay",
      level: data?.overlay.level ?? "unknown",
      label: "Unknown",
      detail: data?.overlay.detail ?? "Checking whether a reliable overlay heartbeat is available.",
      icon: <MonitorPlay aria-hidden="true" />,
      meta: "No browser-source heartbeat is configured",
    },
    {
      title: "Database checks",
      level: data?.database.level ?? "unknown",
      label: data?.database.level === "healthy" ? "Responding" : data?.database.level === "degraded" ? "Degraded" : "Unknown",
      detail: data?.database.detail ?? "Waiting for authenticated database status checks.",
      icon: <Server aria-hidden="true" />,
      meta: data?.tts.cloneReadiness === "unknown"
        ? "Saved clone selection: unable to verify"
        : data?.tts.cloneReadiness === "ready"
          ? "Saved clone selection: ready to speak"
          : data?.tts.cloneReadiness === "needs_setup"
            ? "Saved clone selection: needs setup"
            : data
              ? "Saved clone selection: none enabled"
              : "Saved clone selection: checking",
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Steam Kit // Health"
        title="Health & Alerts"
        description="Service signals and recent alert processing, with unknown states shown when a check is unavailable."
        actions={
          <div className={styles.headerActions}>
            <span className={styles.checkedAt}><Clock3 size={14} aria-hidden="true" /> Last checked: {timeLabel(data?.checkedAt)}</span>
            <button type="button" className={styles.refreshButton} onClick={() => { setLoading(true); void refresh(); }} disabled={loading}>
              <RefreshCw size={15} className={loading ? styles.spin : ""} aria-hidden="true" /> Refresh
            </button>
          </div>
        }
      />

      {error && <div className={styles.errorBanner} role="alert">{error}</div>}

      <section className={styles.statusGrid} aria-label="Service status">
        {cards.map((card) => (
          <article key={card.title} className={`${styles.statusCard} ${styles[`level_${card.level}`]}`}>
            <div className={styles.cardTop}>
              <span className={styles.icon}>{card.icon}</span>
              <span className={`${styles.badge} ${styles[`badge_${card.level}`]}`}><StatusIcon level={card.level} />{card.label}</span>
            </div>
            <h2>{card.title}</h2>
            <p>{card.detail}</p>
            {card.meta && <span className={styles.meta}>{card.meta}</span>}
            {card.action && <Link href={card.action.href} className={styles.cardAction}>{card.action.label}<ExternalLink size={13} aria-hidden="true" /></Link>}
          </article>
        ))}
      </section>

      <section className={styles.contentGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.kicker}>EVENT FEED</p><h2>Recent alert events</h2></div>
            <Activity size={18} aria-hidden="true" />
          </div>
          <p className={styles.panelDescription}>{data?.recentEvents.detail ?? "Loading recent event status."}</p>
          {data?.recentEvents.items.length ? (
            <ul className={styles.eventList}>
              {data.recentEvents.items.map((event, index) => {
                const status = eventStatusLabel(event.status);
                return <li key={`${event.at}-${index}`}>
                  <span className={`${styles.eventDot} ${styles[`dot_${status.level}`]}`} />
                  <span className={styles.eventSource}>{event.source.replaceAll("_", " ")}</span>
                  <span className={styles.eventStatus}>{status.label}</span>
                  <time dateTime={event.at}>{timeLabel(event.at)}</time>
                </li>;
              })}
            </ul>
          ) : (
            <div className={styles.emptyState}>{loading ? "Loading recent events…" : "No recent donation or test events were found."}</div>
          )}
          <p className={styles.privacyNote}>Donor names, messages, and payment amounts are omitted from this status view.</p>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.kicker}>SAFE CHECK</p><h2>Alert preview</h2></div>
            <MonitorPlay size={18} aria-hidden="true" />
          </div>
          <p className={styles.panelDescription}>Preview is local to this dashboard. It does not create a donation, send an OBS alert, or start speech.</p>
          <div className={styles.previewCanvas} aria-live="polite">
            {previewing ? (
              <div className={styles.previewAlert}>
                <span className={styles.previewAvatar}>A</span>
                <div><strong>Alex donated $5.00</strong><p>Hello StreamKit, this is a preview alert.</p></div>
              </div>
            ) : <span>Click preview to show a 2-second sample alert</span>}
          </div>
          <div className={styles.previewActions}>
            <button type="button" className={styles.primaryButton} onClick={() => setPreviewing(true)}>Preview locally</button>
            <Link href="/dashboard/widgets/alerts" className={styles.secondaryButton}>Open alert test controls <ExternalLink size={14} aria-hidden="true" /></Link>
          </div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div><p className={styles.kicker}>SAFE DIAGNOSTICS</p><h2>Recent issues</h2></div>
          <AlertTriangle size={18} aria-hidden="true" />
        </div>
        {issues.length ? (
          <ul className={styles.issueList}>{[...new Set(issues)].map((issue) => <li key={issue}><AlertTriangle size={15} aria-hidden="true" />{issue}</li>)}</ul>
        ) : (
          <div className={styles.clearState}><CheckCircle2 size={17} aria-hidden="true" /> No recorded issues in the available checks.</div>
        )}
        <p className={styles.privacyNote}>Provider text, private URLs, tokens, donor messages, and raw database errors are never displayed here.</p>
      </section>
    </div>
  );
}
