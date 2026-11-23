import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  LayoutDashboard,
  LifeBuoy,
  WalletCards,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  minRole: "super_admin" | "platform_admin" | "billing_admin" | "support_admin" | "creator_admin";
};

export type AdminNavSection = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export const adminNavigation = {
  sections: [
    {
      id: "overview",
      label: "Platform",
      items: [
        { label: "Overview", href: "/admin", icon: LayoutDashboard, minRole: "platform_admin" },
      ],
    },
    {
      id: "money",
      label: "Money",
      items: [
        { label: "Subscription Tiers", href: "/admin/billing", icon: Banknote, minRole: "billing_admin" },
      ],
    },
  ] satisfies AdminNavSection[],
  actions: {
    backIcon: LifeBuoy,
    signOutIcon: WalletCards,
  },
};
