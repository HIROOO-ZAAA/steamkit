"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LifeBuoy,
  Menu,
  WalletCards,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  adminNavigation,
  type AdminNavItem,
  type AdminNavSection,
} from "@/config/adminNavigation";
import styles from "./AdminNav.module.css";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PlatformRole, PLATFORM_ROLE_HIERARCHY } from "@/lib/auth/platformRoles";

interface AdminNavProps {
  userRole: PlatformRole;
  isSuperAdmin: boolean;
}

function isRouteAccessible(item: AdminNavItem, userRole: PlatformRole, isSuperAdmin: boolean): boolean {
  if (item.minRole === "super_admin") {
    return isSuperAdmin;
  }

  const userLevel = PLATFORM_ROLE_HIERARCHY[userRole] || 0;
  const minLevel = PLATFORM_ROLE_HIERARCHY[item.minRole] || 0;

  return userLevel >= minLevel;
}

export default function AdminNav({ userRole, isSuperAdmin }: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);

  const isCurrentRoute = (href: string): boolean => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const sections = adminNavigation.sections;

  const renderNavItems = (items: AdminNavItem[]) => {
    return items
      .filter((item) => isRouteAccessible(item, userRole, isSuperAdmin))
      .map((item) => {
        const Icon = item.icon;
        const active = isCurrentRoute(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`${styles.navLink} ${active ? styles.active : ""}`}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => setMobileOpen(false)}
          >
            <span className={styles.icon}>
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className={styles.linkText}>{item.label}</span>
          </Link>
        );
      });
  };

  const renderSectionIcon = (section: AdminNavSection) => {
    const firstItem = section.items[0];
    if (!firstItem) return null;
    const Icon = firstItem.icon;
    return <Icon size={14} aria-hidden="true" />;
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <>
      <header className={styles.mobileHeader}>
        <Link
          href="/admin"
          className={styles.mobileBrand}
          aria-label="Admin panel"
          onClick={() => setMobileOpen(false)}
        >
          <LifeBuoy size={18} aria-hidden="true" />
          <span className={styles.mobileBrandText}>Admin</span>
        </Link>
        <div className={styles.mobileActions}>
          <button
            ref={mobileToggleRef}
            type="button"
            className={`${styles.mobileToggleBtn} ${mobileOpen ? styles.mobileToggleActive : ""}`}
            onClick={() => {
              if (mobileOpen) setMobileOpen(false);
              else setMobileOpen(true);
            }}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="admin-navigation"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <div
        className={`${styles.scrim} ${mobileOpen ? styles.scrimVisible : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="admin-navigation"
        ref={sidebarRef}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Admin navigation"
        className={`${styles.sidebar} ${mobileOpen ? styles.mobileVisible : ""}`}
      >
        <Link
          href="/admin"
          className={styles.brand}
          aria-label="Admin panel"
          onClick={() => setMobileOpen(false)}
        >
          <LifeBuoy size={20} aria-hidden="true" />
          <span className={styles.brandText}>
            <span className={styles.brandName}>Admin</span>
            <span className={styles.brandSub}>Platform control</span>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Admin sections">
          {sections.map((section) => (
            <div key={section.id} className={styles.navGroup}>
              <div className={styles.sectionLabel}>
                <span className={styles.icon}>
                  {renderSectionIcon(section)}
                </span>
                <span className={styles.sectionText}>{section.label}</span>
                <span className={styles.sectionRule} aria-hidden="true" />
              </div>
              <div className={styles.navItems}>{renderNavItems(section.items)}</div>
            </div>
          ))}
        </nav>

        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            <div className={styles.avatar} aria-hidden="true">
              {userRole.charAt(0).toUpperCase()}
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userRole}>{itemRoleLabel(userRole)}</span>
              {isSuperAdmin && (
                <span className={styles.superAdminBadge}>Super Admin</span>
              )}
            </div>
          </div>

          <div className={styles.footerActions}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className={styles.signOutBtn}
              aria-label="Sign out"
            >
              <span className={styles.signOutIcon}>
                <WalletCards size={16} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className={styles.linkText}>Sign Out</span>
            </Button>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => router.push("/dashboard")}
              aria-label="Return to main dashboard"
            >
              <LifeBuoy size={16} aria-hidden="true" />
              <span className={styles.linkText}>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function itemRoleLabel(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}