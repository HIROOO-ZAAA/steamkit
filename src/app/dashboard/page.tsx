import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Link2,
  ScrollText,
  Settings,
  SkipForward,
  Cpu,
  Tv,
  Zap,
} from "lucide-react";
import Clock from "./Clock";
import ObsLinkRow from "./ObsLinkRow";
import DonationsOverview from "./DonationsOverview";
import styles from "./dashboard.module.css";

export const metadata = {
  title: "Dashboard – Kit Steam",
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

function DiscordIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user!.id)
    .maybeSingle();

  const { data: activeGroup } = await supabase
    .from("telegram_groups")
    .select("group_title")
    .eq("creator_id", user!.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: tips } = await supabase
    .from("tips")
    .select(
      "id, tipper_name, amount, currency, message, payment_method, payment_status, created_at",
    )
    .eq("creator_id", user!.id)
    .in("payment_status", ["successful", "test"])
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (tips as Tip[] | null) ?? [];
  const byMethod = new Map<string, { total: number; currency: string }>();
  for (const t of rows) {
    const key = (t.payment_method ?? "other").toLowerCase();
    const cur = byMethod.get(key) ?? { total: 0, currency: t.currency };
    cur.total += Number(t.amount);
    byMethod.set(key, cur);
  }
  const methodTotal = (m: string) => byMethod.get(m)?.total ?? 0;
  const usdTotal = rows
    .filter((t) => t.currency === "USD")
    .reduce((s, t) => s + Number(t.amount), 0);
  const khrTotal = rows
    .filter((t) => t.currency === "KHR")
    .reduce((s, t) => s + Number(t.amount), 0);

  const groupName = activeGroup?.group_title ?? null;
  const displayName =
    profile?.username ?? profile?.display_name ?? user!.email?.split("@")[0] ?? "Creator";

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.commandHeader}>
        <div>
          <p className={styles.kicker}>{"// STEAM KIT COMMAND CENTER"}</p>
          <h1 className={styles.welcome}>
            WELCOME BACK,
            <br />
            <span className={styles.welcomeName}>{displayName}</span>◆
          </h1>
          <p className={styles.welcomeSub}>
            <span className={styles.dot} />
            {groupName ? groupName.toUpperCase() : "WAITING_GROUP"}
            <span className={styles.sep}>·</span> {groupName ? "Monitoring live streams" : "Monitoring live streams"}
          </p>
        </div>
        <div className={styles.headerRight}>
          <Clock />
        </div>
      </div>

      {/* Status module cards */}
      <div className={styles.statusRow}>
        <div className={styles.statusCard}>
          <span className={`${styles.iconTile} ${styles.iconOk}`}>
            <Cpu size={20} />
          </span>
          <div>
            <p className={styles.statusLabel}>SYSTEM MANAGER</p>
            <strong className={styles.statusValue}>Active</strong>
          </div>
        </div>

        <Link href="/dashboard/kit-client" className={styles.statusCard}>
          <span
            className={`${styles.iconTile} ${groupName ? styles.iconOk : styles.iconWarn}`}
          >
            <Link2 size={20} />
          </span>
          <div>
            <p className={styles.statusLabel}>BOT SIGNAL</p>
            {groupName ? (
              <strong className={styles.statusValue}>Receiving</strong>
            ) : (
              <>
                <strong className={`${styles.statusValue} ${styles.statusWarn}`}>
                  SETUP
                  <br />
                  REQUIRED
                </strong>
                <p className={styles.cardMeta}>Please link a group in settin...</p>
              </>
            )}
          </div>
        </Link>

        <Link href="/dashboard/settings" className={styles.statusCard}>
          <span className={`${styles.iconTile} ${styles.iconMuted}`}>
            <DiscordIcon size={20} />
          </span>
          <div>
            <p className={styles.statusLabel}>DISCORD</p>
            <strong className={styles.statusValue}>Unlinked</strong>
            <p className={styles.cardMeta}>Click to link account</p>
          </div>
        </Link>

        <div className={styles.statusCard}>
          <span className={`${styles.iconTile} ${styles.iconOk}`}>
            <Tv size={20} />
          </span>
          <div>
            <p className={styles.statusLabel}>OBS LINKS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <ObsLinkRow label="Alert Widget" path="/overlay/alerts" />
              <ObsLinkRow label="Donation Dock" path="/overlay/feed" />
            </div>
          </div>
        </div>
      </div>

      {/* Donations overview + recent */}
      <div className={styles.grid2}>
        <DonationsOverview
          usd={{
            aba: rows
              .filter((t) => t.currency === "USD" && (t.payment_method ?? "").toLowerCase() === "aba_payway")
              .reduce((s, t) => s + Number(t.amount), 0),
            bakong: rows
              .filter((t) => t.currency === "USD" && (t.payment_method ?? "").toLowerCase() === "bakong")
              .reduce((s, t) => s + Number(t.amount), 0),
          }}
          khr={{
            aba: rows
              .filter((t) => t.currency === "KHR" && (t.payment_method ?? "").toLowerCase() === "aba_payway")
              .reduce((s, t) => s + Number(t.amount), 0),
            bakong: rows
              .filter((t) => t.currency === "KHR" && (t.payment_method ?? "").toLowerCase() === "bakong")
              .reduce((s, t) => s + Number(t.amount), 0),
          }}
        />

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h3>
              <span className={styles.vBar} /> Recent Donations
            </h3>
            <span className={styles.liveChip}>
              <span className={styles.dot} /> LIVE
            </span>
          </div>
          {rows.length === 0 ? (
            <div className={styles.recentEmpty}>
              <span className={styles.emptyIcon}>
                <ScrollText size={26} />
              </span>
              <strong>No Recent Activity</strong>
              <p className={styles.cardMeta}>
                Your latest donations will appear here.
              </p>
            </div>
          ) : (
            <div className={styles.recentList}>
              {rows.slice(0, 5).map((t) => (
                <div key={t.id} className={styles.recentRow}>
                  <span>
                    {t.currency === "KHR"
                      ? `KHR ${Number(t.amount).toLocaleString()}`
                      : `$${Number(t.amount).toFixed(2)}`}
                  </span>
                  <span className={styles.cardMeta}>{t.tipper_name}</span>
                  <span className={styles.cardMeta}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick commands */}
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <h3>
            <span className={styles.vBar} /> Quick Commands
          </h3>
        </div>
        <div className={styles.cmdGrid}>
          <Link href="/dashboard/donations" className={styles.cmdCard}>
            <span className={`${styles.iconTile} ${styles.iconOk}`}>
              <ScrollText size={18} />
            </span>
            <h4>View Donation Logs</h4>
            <p className={styles.cardMeta}>
              Access detailed transaction history and analytics.
            </p>
            <span className={styles.cmdAction}>View Logs →</span>
          </Link>
          <Link href="/dashboard/alerts" className={styles.cmdCard}>
            <span className={`${styles.iconTile} ${styles.iconOk}`}>
              <Settings size={18} />
            </span>
            <h4>Configure Alerts</h4>
            <p className={styles.cardMeta}>
              Customize your OBS widget appearance and sounds.
            </p>
            <span className={styles.cmdAction}>Settings →</span>
          </Link>
          <Link
            href="/dashboard/alerts"
            className={`${styles.cmdCard} ${styles.cmdDanger}`}
          >
            <span className={`${styles.iconTile} ${styles.iconDanger}`}>
              <SkipForward size={18} />
            </span>
            <h4>Skip Alert / Video</h4>
            <p className={styles.cardMeta}>
              Instantly stop current TTS or Media Share on OBS.
            </p>
            <span className={`${styles.execute} ${styles.cmdAction}`}>
              Execute <Zap size={13} />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
