import { redirect } from "next/navigation";
import { getPlatformRole } from "@/lib/auth/getPlatformRole";
import { PLATFORM_ROLE_HIERARCHY } from "@/lib/auth/platformRoles";
import AdminNav from "@/components/admin/AdminNav";
import OfflineNotice from "@/components/dashboard/OfflineNotice";
import styles from "./admin.module.css";

export const metadata = {
  title: "Admin | Steam Kit",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getPlatformRole();

  if (!ctx) {
    redirect("/dashboard");
  }

  // Only platform_admin and above may reach the admin area.
  if (ctx.platformRole === "viewer" || ctx.platformRole === "creator_admin") {
    redirect("/dashboard");
  }

  const isSuperAdmin = ctx.platformRole === "super_admin";

  return (
    <div className={`dashboard-shell ${styles.adminShell}`}>
      <a className={styles.skipLink} href="#admin-main">
        Skip to admin content
      </a>
      <AdminNav
        userRole={ctx.platformRole}
        isSuperAdmin={isSuperAdmin}
      />
      <main id="admin-main" className={styles.main} tabIndex={-1}>
        <OfflineNotice />
        {children}
      </main>
    </div>
  );
}

export function roleLabel(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function roleLevel(role: string): number {
  return (
    PLATFORM_ROLE_HIERARCHY[role as keyof typeof PLATFORM_ROLE_HIERARCHY] ?? 0
  );
}