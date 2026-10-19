"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dashboardNavigation } from "@/config/navigation";
import styles from "./DashboardNav.module.css";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/Button";
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

export default function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, readCollapsed, () => false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const pulsingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SignOutIcon = dashboardNavigation.actions.signOutIcon;

  useEffect(() => {
    return () => {
      if (pulsingRef.current) clearTimeout(pulsingRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  }

  function toggleCollapsed() {
    persistCollapsed(!collapsed);
  }

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    el.style.setProperty("--ry", `${((e.clientX - rect.left) / rect.width - 0.5) * 6}deg`);
    el.style.setProperty("--rx", `${((e.clientY - rect.top) / rect.height - 0.5) * -6}deg`);
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  }, []);

  const handlePress = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--px", `${e.clientX - rect.left}px`);
    el.style.setProperty("--py", `${e.clientY - rect.top}px`);

    el.classList.remove(styles.pulsing);
    void el.offsetWidth;
    el.classList.add(styles.pulsing);

    if (pulsingRef.current) clearTimeout(pulsingRef.current);
    pulsingRef.current = setTimeout(() => el.classList.remove(styles.pulsing), 700);
  }, []);

  const sections = [
    { title: "Creator Studio", items: dashboardNavigation.creatorTools },
    { title: "Stream Modules", items: dashboardNavigation.streamingWidgets },
    { title: "Integrations", items: dashboardNavigation.integrations },
    { title: "Account", items: dashboardNavigation.accountItems },
  ];

  let itemIndex = -1;

  const renderNavItems = (items: typeof dashboardNavigation.creatorTools) => {
    return items.map((item) => {
      const Icon = item.icon;
      itemIndex += 1;
      const index = itemIndex;
      const isActive =
        activeLabel === item.label ||
        (activeLabel === null &&
          (item.href === "/dashboard"
            ? pathname === "/dashboard" && item.label === "Dashboard"
            : pathname === item.href || pathname.startsWith(`${item.href}/`)));

      return (
        <Link
          key={item.href}
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={`${styles.navLink} ${isActive ? styles.active : ""}`}
          style={{ "--i": index } as React.CSSProperties}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePress}
          onClick={() => {
            setActiveLabel(item.label);
            setMobileOpen(false);
          }}
        >
          <span className={styles.accent} aria-hidden="true" />
          <span className={styles.pulseRing} aria-hidden="true" />
          <span className={styles.icon}>
            <Icon size={16} strokeWidth={2} />
          </span>
          <span className={styles.linkText}>{item.label}</span>
          <span className={styles.sheen} aria-hidden="true" />
        </Link>
      );
    });
  };

  return (
    <>
      {/* Mobile Top Header */}
      <header className={styles.mobileHeader}>
        <span className={styles.mobileBrandSlot} aria-hidden="true" />
        <button
          type="button"
          className={`${styles.mobileToggleBtn} ${mobileOpen ? styles.mobileToggleActive : ""}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile Scrim */}
      <div
        className={`${styles.scrim} ${mobileOpen ? styles.scrimVisible : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Main Sidebar */}
      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.mobileVisible : ""} ${collapsed ? styles.collapsed : ""}`}
      >
        <div className={styles.glowLayer} aria-hidden="true" />

        <button
          type="button"
          className={`${styles.collapseBtn} ${collapsed ? styles.collapseBtnRotated : ""}`}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
        >
          <span className={styles.collapseHalo} aria-hidden="true" />
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <nav className={styles.nav}>
          {sections.map((section) => (
            <div key={section.title} className={styles.navGroup}>
              <div className={styles.sectionLabel}>
                <span className={styles.sectionText}>{section.title}</span>
                <span className={styles.sectionRule} aria-hidden="true" />
              </div>
              <div className={styles.navItems}>{renderNavItems(section.items)}</div>
            </div>
          ))}
        </nav>

        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            <div className={styles.avatarRing} aria-hidden="true" />
            <div className={styles.avatar}>
              {user.email ? user.email.charAt(0).toUpperCase() : "C"}
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userEmail}>{user.email}</span>
              <span className={styles.userRole}>Standard Plan</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className={styles.signOutBtn}
          >
            <span className={styles.signOutIcon}>
              <SignOutIcon size={16} strokeWidth={1.8} />
            </span>
            <span className={styles.linkText}>Sign Out</span>
          </Button>
        </div>
      </aside>
    </>
  );
}