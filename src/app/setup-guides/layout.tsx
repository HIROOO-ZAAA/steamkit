import type { Metadata } from "next";
import Link from "next/link";
import DashboardNav from "@/components/dashboard/DashboardNav";
import ThemeToggle from "@/components/dashboard/ThemeToggle";
import { createClient } from "@/lib/supabase/server";
import dashboardLayoutStyles from "../dashboard/layout.module.css";
import "../dashboard/dashboard-theme.css";
import styles from "./setup-guides-redesign.module.css";

export const metadata: Metadata = {
  description:
    "Interactive walkthroughs for configuring Steam Kit features, overlays, alerts, tipping, and integrations.",
};

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M8 6v12M8 12l7-6M8 12l7 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function SetupGuidesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return (
      <div className={`dashboard-shell ${dashboardLayoutStyles.layout}`}>
        <a className={dashboardLayoutStyles.skipLink} href="#guide-content">
          Skip to setup guides
        </a>
        <DashboardNav user={user} />
        <main
          id="guide-content"
          className={dashboardLayoutStyles.main}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`dashboard-shell ${styles.publicShell}`}>
      <a href="#guide-content" className={styles.skipLink}>
        Skip to setup guides
      </a>

      <header className={styles.publicHeader}>
        <div className={styles.publicHeaderInner}>
          <Link href="/" className={styles.publicBrand}>
            <span className={styles.publicMark}>
              <BrandMark />
            </span>
            <span className={styles.publicBrandText}>
              <span className={styles.publicBrandName}>Steam Kit</span>
              <span className={styles.publicBrandMeta}>Setup guides</span>
            </span>
          </Link>

          <div className={styles.publicActions}>
            <ThemeToggle />
            <Link href="/auth" className={styles.publicSignIn}>
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main id="guide-content" className={styles.publicMain} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
