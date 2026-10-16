import type { LucideIcon } from "lucide-react";
import {
  Bell,
  ChartNoAxesCombined,
  Dices,
  Gift,
  HandCoins,
  LayoutDashboard,
  Mic,
  MonitorUp,
  Network,
  Settings,
  Star,
  Target,
  TimerReset,
  Trophy,
  LogOut,
  Zap,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const dashboardNavigation = {
  creatorTools: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Donations", href: "/dashboard/donations", icon: HandCoins },
    { label: "Analytics", href: "/dashboard/analytics", icon: ChartNoAxesCombined },
  ] satisfies DashboardNavItem[],
  streamingWidgets: [
    { label: "Alerts", href: "/dashboard/alerts", icon: Bell },
    { label: "Voice Settings", href: "/dashboard/voice-settings", icon: Mic },
    { label: "Widget Overlays", href: "/dashboard/widget-overlays", icon: Network },
    { label: "Goals", href: "/dashboard/goals", icon: Target },
    { label: "Leaderboard", href: "/dashboard/leaderboard", icon: Trophy },
    { label: "Spin Wheel", href: "/dashboard/spin-wheel", icon: Dices },
    { label: "Raffle", href: "/dashboard/raffle", icon: Gift },
    { label: "Subathon", href: "/dashboard/subathon", icon: TimerReset },
  ] satisfies DashboardNavItem[],
  integrations: [
    { label: "Kit Client", href: "/dashboard/kit-client", icon: Zap },
    
    { label: "Tips", href: "/dashboard/tips", icon: HandCoins },
  ] satisfies DashboardNavItem[],
  accountItems: [
    { label: "Subscriptions", href: "/dashboard/subscriptions", icon: Star },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
    { label: "Dock Appearance", href: "/dashboard/browser-source", icon: MonitorUp },
  ] satisfies DashboardNavItem[],
  actions: { signOutIcon: LogOut },
};
