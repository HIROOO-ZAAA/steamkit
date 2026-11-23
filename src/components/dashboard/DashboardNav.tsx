"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  dashboardNavigation,
  type DashboardNavItem,
} from "@/config/dashboardNavigation";
import styles from "./DashboardNav.module.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import ThemeToggle from "@/components/dashboard/ThemeToggle";
import { SIDEBAR_COLLAPSE_KEY, SIDEBAR_W, SIDEBAR_W_COLLAPSED } from "@/lib/sidebar";

interface DashboardNavProps {
  user: {
    email?: string;
    id: string;
  };
}

const STORAGE_KEY = SIDEBAR_COLLAPSE_KEY;
const SIDEBAR_EVENT = "streamkit:sidebar-state";

function subscribeSidebar(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_EVENT, onChange);
  };
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistCollapsed(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  document.documentElement.style.setProperty(
    "--sidebar-w",
    next ? SIDEBAR_W_COLLAPSED : SIDEBAR_W,
  );
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

function isCurrentRoute(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SteamKitGlyph() {
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

export default function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, readCollapsed, () => false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const SignOutIcon = dashboardNavigation.actions.signOutIcon;

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const onChange = () => {
      if (desktop.matches) setMobileOpen(false);
    };

    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const main =
      document.getElementById("dashboard-main") ??
      document.getElementById("guide-content");
    main?.setAttribute("inert", "");

    const sidebar = sidebarRef.current;
    const focusables = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    const currentRoute = sidebar?.querySelector<HTMLElement>('[aria-current="page"]');
    const focusTarget = currentRoute ?? focusables()[0];
    // The drawer becomes visible after its 220ms transition; focus it then.
    const focusTimer = window.setTimeout(() => focusTarget?.focus(), 250);

    const nav = sidebar?.querySelector<HTMLElement>("nav");
    if (nav) {
      nav.scrollTop = 0;
      nav
        .querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileToggleRef.current?.focus();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = focusables();
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      main?.removeAttribute("inert");
    };
  }, [mobileOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  function toggleCollapsed() {
    persistCollapsed(!collapsed);
  }

  function closeMobileDrawer() {
    setMobileOpen(false);
    mobileToggleRef.current?.focus();
  }

  function handleNavItemClick() {
    if (mobileOpen) closeMobileDrawer();
  }

  const sections = dashboardNavigation.sections;

  const renderNavItems = (items: DashboardNavItem[]) => {
    return items.map((item) => {
      const Icon = item.icon;
      const active = isCurrentRoute(pathname, item.href);

      return (
        <Link
          key={item.href}
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={`${styles.navLink} ${active ? styles.active : ""}`}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          onClick={handleNavItemClick}
        >
          <span className={styles.icon}>
            <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className={styles.linkText}>{item.label}</span>
          {item.badge && (
            <span className={styles.badge}>{item.badge}</span>
          )}
        </Link>
      );
    });
  };

  return (
    <>
      <header className={styles.mobileHeader}>
        <Link
          href="/dashboard"
          className={styles.mobileBrand}
          aria-label="Steam Kit dashboard"
          onClick={() => setMobileOpen(false)}
        >
          <span className={styles.brandMark} aria-hidden="true">
            <SteamKitGlyph />
          </span>
          <span className={styles.mobileBrandText}>Steam Kit</span>
        </Link>
        <div className={styles.mobileActions}>
          <ThemeToggle compact />
          <button
            ref={mobileToggleRef}
            type="button"
            className={`${styles.mobileToggleBtn} ${mobileOpen ? styles.mobileToggleActive : ""}`}
            onClick={() => {
              if (mobileOpen) closeMobileDrawer();
              else setMobileOpen(true);
            }}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="dashboard-navigation"
          >
            {mobileOpen ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <div
        className={`${styles.scrim} ${mobileOpen ? styles.scrimVisible : ""}`}
        onClick={closeMobileDrawer}
        aria-hidden="true"
      />

      <aside
        id="dashboard-navigation"
        ref={sidebarRef}
        data-sidebar-collapsed={collapsed ? "true" : "false"}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Dashboard navigation"
        className={`${styles.sidebar} ${mobileOpen ? styles.mobileVisible : ""} ${collapsed ? styles.collapsed : ""}`}
      >
        <Link
          href="/dashboard"
          className={styles.brand}
          aria-label="Steam Kit dashboard"
          onClick={() => setMobileOpen(false)}
        >
          <span className={styles.brandMark} aria-hidden="true">
            <SteamKitGlyph />
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>Steam Kit</span>
            <span className={styles.brandSub}>Creator control room</span>
          </span>
        </Link>

        <button
          type="button"
          className={`${styles.collapseBtn} ${collapsed ? styles.collapseBtnRotated : ""}`}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
        >
          {collapsed ? (
            <ChevronRight size={14} aria-hidden="true" />
          ) : (
            <ChevronLeft size={14} aria-hidden="true" />
          )}
        </button>

        <nav className={styles.nav} aria-label="Dashboard sections">
          {sections.map((section) => (
            <div key={section.id} className={styles.navGroup}>
              <div className={styles.sectionLabel}>
                <span className={styles.sectionText}>{section.label}</span>
                <span className={styles.sectionRule} aria-hidden="true" />
              </div>
              <div className={styles.navItems}>{renderNavItems(section.items)}</div>
            </div>
          ))}
        </nav>

        <div className={styles.userSection}>
          <Link
            href="/dashboard/settings"
            className={styles.userInfo}
            aria-label="Open account settings"
            onClick={handleNavItemClick}
          >
            <div className={styles.avatar} aria-hidden="true">
              {user.email ? user.email.charAt(0).toUpperCase() : "C"}
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userEmail} title={user.email}>
                {user.email}
              </span>
              <span className={styles.userRole}>Creator account</span>
            </div>
          </Link>
          <div className={styles.footerActions}>
            <div className={styles.themeSlot}>
              <ThemeToggle compact />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className={styles.signOutBtn}
              aria-label="Sign out"
            >
              <span className={styles.signOutIcon}>
                <SignOutIcon size={16} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className={styles.linkText}>Sign Out</span>
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
