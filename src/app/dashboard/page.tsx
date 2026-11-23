import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  BookOpen,
  CheckCircle2,
  Film,
  HandCoins,
  MonitorPlay,
  ReceiptText,
  Send,
  TrendingUp,
  WalletCards,
  Zap,
} from "lucide-react";
import { alertHistorySourceLabel } from "@/lib/overlay/alert-history";
import { getDashboardDisplayName } from "@/lib/dashboard/display-name";
import ObsLinkRow from "./ObsLinkRow";
import DonationsOverview from "./DonationsOverview";
import styles from "./dashboard.module.css";

export const metadata = {
  title: "Dashboard | Steam Kit",
};

type Tip = {
  id: string;
  tipper_name: string;
  amount: number;
  currency: string;
  message: string | null;
  payment_method: string | null;
  payment_status: string | null;
  created_at: string;
};

type ChartTip = Pick<
  Tip,
  "amount" | "currency" | "payment_method" | "payment_status" | "created_at"
>;

type CurrencySummary = {
  total: number;
  aba: number;
  bakong: number;
  count: number;
  abaCount: number;
  bakongCount: number;
};

export type DailyDonationPoint = {
  key: string;
  label: string;
  total: number;
};

const DASHBOARD_TIME_ZONE = "Asia/Phnom_Penh";
const CHART_DAYS = 31;
const ABA_METHODS = ["aba", "aba_payway"] as const;

function amountLabel(amount: number, currency: string) {
  return currency === "KHR"
    ? `KHR ${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : `$${Number(amount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: DASHBOARD_TIME_ZONE,
  });
}

function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function chartStartIso() {
  const today = dayKey(new Date());
  const start = new Date(`${today}T00:00:00+07:00`);
  start.setUTCDate(start.getUTCDate() - (CHART_DAYS - 1));
  return start.toISOString();
}

function buildDailySeries(
  rows: ChartTip[],
  currency: string,
): DailyDonationPoint[] {
  const today = dayKey(new Date());
  const keys = Array.from({ length: CHART_DAYS }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (CHART_DAYS - 1 - index));
    return date.toISOString().slice(0, 10);
  });

  const totals = new Map(keys.map((key) => [key, 0]));

  for (const tip of rows) {
    if (tip.currency !== currency || tip.payment_status !== "successful") {
      continue;
    }

    const key = dayKey(tip.created_at);
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + Number(tip.amount));
  }

  return keys.map((key) => ({
    key,
    label: new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    total: totals.get(key) ?? 0,
  }));
}

function summarizeCurrency(
  rows: ChartTip[],
  currency: string,
): CurrencySummary {
  const completed = rows.filter(
    (tip) => tip.currency === currency && tip.payment_status === "successful",
  );

  const sum = (methods: readonly string[]) =>
    completed
      .filter((tip) =>
        methods.includes((tip.payment_method ?? "").toLowerCase()),
      )
      .reduce((total, tip) => total + Number(tip.amount), 0);

  return {
    total: completed.reduce((total, tip) => total + Number(tip.amount), 0),
    aba: sum(ABA_METHODS),
    bakong: sum(["bakong"]),
    count: completed.length,
    abaCount: completed.filter((tip) =>
      ABA_METHODS.includes(
        (tip.payment_method ?? "").toLowerCase() as (typeof ABA_METHODS)[number],
      ),
    ).length,
    bakongCount: completed.filter(
      (tip) => (tip.payment_method ?? "").toLowerCase() === "bakong",
    ).length,
  };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: activeGroup, error: groupError } = await supabase
    .from("telegram_groups")
    .select("group_title")
    .eq("creator_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: recentTips, error: recentError } = await supabase
    .from("tips")
    .select(
      "id, tipper_name, amount, currency, message, payment_method, payment_status, created_at",
    )
    .eq("creator_id", user.id)
    .in("payment_status", ["successful", "test"])
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: chartTips, error: chartError } = await supabase
    .from("tips")
    .select("amount, currency, payment_method, payment_status, created_at")
    .eq("creator_id", user.id)
    .eq("payment_status", "successful")
    .gte("created_at", chartStartIso())
    .order("created_at", { ascending: false })
    .limit(1000);

  const { data: goals } = await supabase
    .from("donation_goals")
    .select("id, title, target_amount, current_amount, bar_color, is_active, currency")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const { data: alerts, error: alertsError } = await supabase
    .from("alert_settings")
    .select("id, duration_seconds, sound_url, animation_type, font_color, tts_enabled")
    .eq("user_id", user.id)
    .limit(1);

  const rows = (recentTips as Tip[] | null) ?? [];
  const chartRows = (chartTips as ChartTip[] | null) ?? [];
  const groupName = activeGroup?.group_title?.trim() || null;
  const groupUnavailable = Boolean(groupError);
  const paymentsUnavailable = Boolean(recentError);
  const overviewUnavailable = Boolean(chartError);
  const failedChecks = [
    profileError,
    groupError,
    recentError,
    chartError,
    alertsError,
  ].filter(Boolean).length;
  const overviewDataAvailable = failedChecks === 0;

  const usdSummary = summarizeCurrency(chartRows, "USD");
  const khrSummary = summarizeCurrency(chartRows, "KHR");
  const usdSeries = buildDailySeries(chartRows, "USD");
  const khrSeries = buildDailySeries(chartRows, "KHR");
  const completedPayments = usdSummary.count + khrSummary.count;
  const completedPaymentLabel = `${completedPayments} completed ${completedPayments === 1 ? "payment" : "payments"}`;

  const displayName = getDashboardDisplayName(profile, user.email);
  const activeGoal = goals?.find((goal) => goal.is_active);
  const goalProgress =
    activeGoal && activeGoal.target_amount > 0
      ? Math.min(
          100,
          Math.round(
            (activeGoal.current_amount / activeGoal.target_amount) * 100,
          ),
        )
      : 0;

  function goalAmountLabel(amount: number, currency?: string | null) {
    if (currency === "KHR") {
      return `៛ ${Number(amount).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })}`;
    }
    return `$${Number(amount).toFixed(2)}`;
  }

  const alertConfig = alerts?.[0] ?? null;
  const alertConfigured = Boolean(alertConfig);
  const ttsEnabled = Boolean(alertConfig?.tts_enabled);
  const alertDurationLabel = alertConfig?.duration_seconds
    ? `${alertConfig.duration_seconds}s alert window`
    : "Default alert duration";
  const nextStep = alertsError
    ? {
        kicker: "Needs attention",
        title: "Check alert settings",
        description: "The dashboard could not read your alert setup.",
        href: "/dashboard/health",
        action: "Open health",
      }
    : groupUnavailable
      ? {
          kicker: "Needs attention",
          title: "Check Telegram status",
          description: "The dashboard could not confirm your linked group.",
          href: "/dashboard/health",
          action: "Open health",
        }
      : !alertConfigured
        ? {
            kicker: "Before your next stream",
            title: "Set up your first alert",
            description: "Choose what viewers see when they support you.",
            href: "/dashboard/widgets/alerts",
            action: "Configure alerts",
          }
        : !groupName
          ? {
              kicker: "Connect your community",
              title: "Link a Telegram group",
              description: "Send stream activity to your creator chat.",
              href: "/dashboard/kit-client",
              action: "Connect Telegram",
            }
          : {
              kicker: "Ready for your next stream",
              title: "Check your OBS controls",
              description: "Review your browser sources before going live.",
              href: "/dashboard/obs",
              action: "Open OBS controls",
            };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Creator command center</p>
          <h1 className={styles.title}>
            <span className={styles.heroGreeting}>Welcome back,</span>
            {displayName}
          </h1>
          <p className={styles.heroDescription}>
            See recent donations, alert settings, and stream tools at a glance.
          </p>
          <div className={styles.heroMeta}>
            <Link href="/dashboard/analytics" className={styles.heroLink}>
              View analytics
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <aside className={styles.heroAside} aria-label="Next step for your stream">
          <div className={styles.nextStepCard}>
            <p className={styles.nextStepKicker}>{nextStep.kicker}</p>
            <strong className={styles.nextStepTitle}>{nextStep.title}</strong>
            <p className={styles.nextStepDescription}>
              {nextStep.description}
            </p>
            <Link href={nextStep.href} className={styles.nextStepLink}>
              {nextStep.action}
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </header>

      <div className={styles.sectionHead}>
        <div>
          <p className={styles.sectionKicker}>Workspace</p>
          <h2 className={styles.sectionTitle}>At a glance</h2>
        </div>
        <p className={styles.sectionNote}>
          Recent payments and stream setup in one place.
        </p>
      </div>

      <section className={styles.statusGrid} aria-label="Workspace status">
        <article
          className={`${styles.statCard} ${
            overviewDataAvailable ? styles.statCardHealthy : styles.statCardWarning
          }`}
        >
          <div className={styles.statTop}>
            <span className={styles.statIcon}>
              <Activity size={16} aria-hidden="true" />
            </span>
            <span className={styles.statLabel}>Data checks</span>
            <span
              className={`${styles.statFlag} ${
                overviewDataAvailable ? styles.statFlagOk : styles.statFlagWarn
              }`}
            >
              {overviewDataAvailable ? (
                <CheckCircle2 size={11} aria-hidden="true" />
              ) : (
                <AlertTriangle size={11} aria-hidden="true" />
              )}
              {overviewDataAvailable ? "Loaded" : "Partial"}
            </span>
          </div>
          <strong className={styles.statValue}>
            {overviewDataAvailable
              ? "Dashboard data available"
              : `${failedChecks} data source${failedChecks === 1 ? "" : "s"} unavailable`}
          </strong>
          <p className={styles.statMeta}>
            {overviewDataAvailable
              ? "Profile, payments, Telegram, alerts, and analytics loaded."
              : "Some dashboard data could not be loaded."}
          </p>
          <Link href="/dashboard/health" className={styles.statLink}>
            Review health
            <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statIcon}>
              <Send size={16} aria-hidden="true" />
            </span>
            <span className={styles.statLabel}>Telegram</span>
            <span
              className={`${styles.statFlag} ${
                groupUnavailable
                  ? styles.statFlagWarn
                  : groupName
                    ? styles.statFlagOk
                    : styles.statFlagIdle
              }`}
            >
              {groupUnavailable ? "Unavailable" : groupName ? "Linked" : "Not linked"}
            </span>
          </div>
          <strong className={styles.statValue} title={groupName ?? undefined}>
            {groupUnavailable ? "Unavailable" : groupName ?? "Not linked"}
          </strong>
          <p className={styles.statMeta}>
            {groupUnavailable
              ? "Could not check Telegram groups."
              : groupName
                ? "Active group in Kit Client."
                : "No active Telegram group is linked yet."}
          </p>
          {!groupUnavailable && !groupName ? (
            <Link href="/dashboard/kit-client" className={styles.statLink}>
              Link a group
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          ) : (
            <Link href="/dashboard/kit-client" className={styles.statLink}>
              Open Kit Client
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          )}
        </article>

        <article className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statIcon}>
              <HandCoins size={16} aria-hidden="true" />
            </span>
            <span className={styles.statLabel}>Payments</span>
            <span className={`${styles.statFlag} ${styles.statFlagIdle}`}>
              Last 31 days
            </span>
          </div>
          <strong className={styles.statValue}>
            {overviewUnavailable
              ? "Unavailable"
              : completedPaymentLabel}
          </strong>
          <p className={styles.statMeta}>
            {overviewUnavailable
              ? "Payment totals could not be loaded."
              : `${amountLabel(usdSummary.total, "USD")} USD · ${amountLabel(khrSummary.total, "KHR")}`}
          </p>
          <Link href="/dashboard/donations" className={styles.statLink}>
            Review donations
            <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </article>

        <article className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statIcon}>
              <BellRing size={16} aria-hidden="true" />
            </span>
            <span className={styles.statLabel}>Alerts</span>
            <span
              className={`${styles.statFlag} ${
                alertsError
                  ? styles.statFlagWarn
                  : alertConfigured
                    ? styles.statFlagOk
                    : styles.statFlagIdle
              }`}
            >
              {alertsError
                ? "Attention"
                : ttsEnabled
                  ? "Speech on"
                  : "Speech off"}
            </span>
          </div>
          <strong className={styles.statValue}>
            {alertsError
              ? "Unavailable"
              : alertConfigured
                ? "Settings saved"
                : "Not configured"}
          </strong>
          <p className={styles.statMeta}>
            {alertsError
              ? "Alert settings could not be loaded."
              : alertConfigured
                ? `${alertDurationLabel} · speech setting ${ttsEnabled ? "on" : "off"}`
                : "Create an alert before going live."}
          </p>
          <Link
            href={alertConfigured ? "/dashboard/voice-settings" : "/dashboard/widgets/alerts"}
            className={styles.statLink}
          >
            {alertConfigured ? "Voice settings" : "Configure alerts"}
            <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </article>
      </section>

      <section className={styles.mainGrid} aria-label="Donation activity">
        <DonationsOverview
          usd={usdSummary}
          khr={khrSummary}
          usdSeries={usdSeries}
          khrSeries={khrSeries}
          unavailable={overviewUnavailable}
        />

        <section
          className={`${styles.panel} ${styles.recentPanel}`}
          aria-labelledby="recent-donations-title"
        >
          <div className={styles.panelHead}>
            <div className={styles.panelTitleGroup}>
              <p className={styles.panelKicker}>Latest activity</p>
              <h2 id="recent-donations-title" className={styles.panelTitle}>
                Recent Donations
              </h2>
            </div>
            <span className={styles.snapshotBadge}>
              <span className={styles.snapshotDot} aria-hidden="true" />
              Latest 5
            </span>
          </div>

          {paymentsUnavailable ? (
            <div className={styles.errorState} role="alert">
              <strong>Donations unavailable</strong>
              <p>
                The latest payment rows could not be loaded. Refresh to try
                again.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className={styles.emptyState} role="status">
              <span className={styles.emptyIcon}>
                <HandCoins size={20} aria-hidden="true" />
              </span>
              <strong>No recent payments</strong>
              <p>Completed and test donations will appear here.</p>
            </div>
          ) : (
            <ul className={styles.recentList}>
              {rows.slice(0, 5).map((tip) => (
                <li key={tip.id} className={styles.recentItem}>
                  <span className={styles.recentAmount}>
                    {amountLabel(Number(tip.amount), tip.currency)}
                  </span>
                  <span className={styles.recentIdentity}>
                    <strong className={styles.recentDonor}>
                      {tip.tipper_name}
                    </strong>
                    {tip.message ? (
                      <span className={styles.recentMessage} title={tip.message}>
                        {tip.message}
                      </span>
                    ) : null}
                    <span className={styles.recentMeta}>
                      {alertHistorySourceLabel(tip.payment_method)}
                      <span
                        className={tip.payment_status === "test" ? styles.testTag : styles.paidTag}
                      >
                        {tip.payment_status === "test" ? "Test" : "Paid"}
                      </span>
                    </span>
                  </span>
                  <time className={styles.recentDate} dateTime={tip.created_at}>
                    {shortDate(tip.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.panelFooter}>
            <Link href="/dashboard/donations" className={styles.textLink}>
              Open donation history
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </section>

      <section className={styles.block} aria-labelledby="quick-commands-title">
        <div className={styles.blockHead}>
          <div>
            <h2 id="quick-commands-title" className={styles.blockTitle}>
              Quick actions
            </h2>
          </div>
          <p className={styles.blockNote}>
            Open common controls before or during a stream.
          </p>
        </div>

        <div className={styles.commandGrid}>
          <Link
            href="/dashboard/donations"
            className={`${styles.commandCard} ${styles.commandPrimary}`}
          >
            <span className={`${styles.commandIcon} ${styles.commandIconPrimary}`}>
              <ReceiptText size={17} aria-hidden="true" />
            </span>
            <span className={styles.commandCopy}>
              <strong>Review donations</strong>
              <span>Check payment status, filters, and history.</span>
            </span>
            <ArrowUpRight
              className={styles.commandArrow}
              size={15}
              aria-hidden="true"
            />
          </Link>

          <Link href="/dashboard/widgets/alerts" className={styles.commandCard}>
            <span className={styles.commandIcon}>
              <BellRing size={17} aria-hidden="true" />
            </span>
            <span className={styles.commandCopy}>
              <strong>Configure alerts</strong>
              <span>Update alert content and test the OBS overlay.</span>
            </span>
            <ArrowUpRight
              className={styles.commandArrow}
              size={15}
              aria-hidden="true"
            />
          </Link>

          <Link
            href="/dashboard/media-share"
            className={styles.commandCard}
          >
            <span className={styles.commandIcon}>
              <Film size={17} aria-hidden="true" />
            </span>
            <span className={styles.commandCopy}>
              <strong>Review media queue</strong>
              <span>Check queued videos and skip one.</span>
            </span>
            <ArrowUpRight
              className={styles.commandArrow}
              size={15}
              aria-hidden="true"
            />
          </Link>

          <Link href="/dashboard/goals" className={styles.commandCard}>
            <span className={styles.commandIcon}>
              <TrendingUp size={17} aria-hidden="true" />
            </span>
            <span className={styles.commandCopy}>
              <strong>Manage goals</strong>
              <span>Create or update a fundraising target.</span>
            </span>
            <ArrowUpRight
              className={styles.commandArrow}
              size={15}
              aria-hidden="true"
            />
          </Link>
        </div>
      </section>

      {activeGoal ? (
        <section className={styles.block} aria-labelledby="active-goal-title">
          <div className={styles.blockHead}>
            <div>
              <p className={styles.panelKicker}>Active goal</p>
              <h2 id="active-goal-title" className={styles.blockTitle}>
                {activeGoal.title}
              </h2>
            </div>
            <Link href="/dashboard/goals" className={styles.textLink}>
              Manage goals
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <div
            className={styles.goalCard}
            style={
              {
                "--bar-color": activeGoal.bar_color || "var(--dash-action)",
              } as React.CSSProperties
            }
          >
            <div className={styles.goalTop}>
              <span className={styles.goalProgress}>{goalProgress}%</span>
              <span className={styles.goalAmounts}>
                {goalAmountLabel(activeGoal.current_amount, activeGoal.currency)}
                <span> of </span>
                {goalAmountLabel(activeGoal.target_amount, activeGoal.currency)}
              </span>
            </div>
            <div
              className={styles.goalBarTrack}
              role="progressbar"
              aria-label={`${activeGoal.title} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={goalProgress}
            >
              <div
                className={styles.goalBarFill}
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <div className={styles.goalFooter}>
              <span>Fundraising target</span>
              <Link href="/dashboard/goals" className={styles.textLink}>
                Open goals
                <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.block} aria-labelledby="tools-setup-title">
        <div className={styles.blockHead}>
          <div>
            <p className={styles.panelKicker}>Output & help</p>
            <h2 id="tools-setup-title" className={styles.blockTitle}>
              Tools & Setup
            </h2>
          </div>
          <p className={styles.blockNote}>
            Keep OBS and the desktop client aligned.
          </p>
        </div>

        <div className={styles.supportGrid}>
          <section
            id="obs-links"
            className={styles.panel}
            aria-labelledby="overlay-links-title"
          >
            <div className={styles.panelHead}>
              <div className={styles.panelTitleGroup}>
                <p className={styles.panelKicker}>Browser sources</p>
                <h3 id="overlay-links-title" className={styles.panelTitle}>
                  OBS Overlay Links
                </h3>
              </div>
              <span className={styles.panelIcon}>
                <MonitorPlay size={15} aria-hidden="true" />
              </span>
            </div>
            <p className={styles.panelDescription}>
              Copy an overlay URL into OBS as a browser source. Each link uses
              your saved overlay credential.
            </p>
            <div className={styles.overlayList}>
              <ObsLinkRow label="Alert widget" path="/overlay/alerts" />
              <ObsLinkRow label="Donation dock" path="/overlay/feed" />
            </div>
            <p className={styles.note}>
              If a link is unavailable, open{" "}
              <Link href="/dashboard/widgets/alerts">Alerts</Link> once to initialize
              your overlay credential, then return here.
            </p>
          </section>

          <section className={styles.panel} aria-labelledby="setup-shortcuts-title">
            <div className={styles.panelHead}>
              <div className={styles.panelTitleGroup}>
                <p className={styles.panelKicker}>Creator studio</p>
                <h3 id="setup-shortcuts-title" className={styles.panelTitle}>
                  Continue Setting Up
                </h3>
              </div>
              <span className={styles.panelIcon}>
                <BookOpen size={15} aria-hidden="true" />
              </span>
            </div>
            <p className={styles.panelDescription}>
              Follow a walkthrough, check service health, or manage the desktop
              client.
            </p>
            <ul className={styles.shortcutList}>
              <li>
                <Link href="/setup-guides" className={styles.shortcut}>
                  <span className={styles.shortcutIcon}>
                    <BookOpen size={14} aria-hidden="true" />
                  </span>
                  <span className={styles.shortcutCopy}>
                    <strong>Setup Guides</strong>
                    <span>
                      Step-by-step walkthroughs for alerts, Telegram, tipping,
                      and overlays.
                    </span>
                  </span>
                  <ArrowUpRight
                    className={styles.shortcutArrow}
                    size={13}
                    aria-hidden="true"
                  />
                </Link>
              </li>
              <li>
                <Link href="/dashboard/health" className={styles.shortcut}>
                  <span className={styles.shortcutIcon}>
                    <MonitorPlay size={14} aria-hidden="true" />
                  </span>
                  <span className={styles.shortcutCopy}>
                    <strong>Health & alerts</strong>
                    <span>
                      Review service signals and recent alert events before
                      going live.
                    </span>
                  </span>
                  <ArrowUpRight
                    className={styles.shortcutArrow}
                    size={13}
                    aria-hidden="true"
                  />
                </Link>
              </li>
              <li>
                <Link href="/dashboard/kit-client" className={styles.shortcut}>
                  <span className={styles.shortcutIcon}>
                    <Zap size={14} aria-hidden="true" />
                  </span>
                  <span className={styles.shortcutCopy}>
                    <strong>Kit Client</strong>
                    <span>
                      Manage the desktop client and your active Telegram group.
                    </span>
                  </span>
                  <ArrowUpRight
                    className={styles.shortcutArrow}
                    size={13}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <p className={styles.pageNote}>
        <WalletCards size={12} aria-hidden="true" />
        Donation totals use completed payments from the last {CHART_DAYS} days in
        ICT. Test events stay labeled in recent activity.
      </p>
    </div>
  );
}
