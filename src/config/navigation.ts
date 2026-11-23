import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart2,
  Bell,
  BookOpen,
  CreditCard,
  Dices,
  Gift,
  HandCoins,
  History,
  LayoutDashboard,
  LogOut,
  Mic,
  MonitorPlay,
  Send,
  Settings,
  Target,
  TimerReset,
  Trophy,
  WalletCards,
  Zap,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  badge?: string;
};

export type DashboardNavSection = {
  id: string;
  label: string;
  items: DashboardNavItem[];
};

export const dashboardNavigation = {
  sections: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
        { label: "System health", href: "/dashboard/health", icon: Activity },
      ],
    },
    {
      id: "revenue",
      label: "Donations",
      items: [
        { label: "Donations", href: "/dashboard/payments/donations", icon: HandCoins },
        { label: "Tips & Payments", href: "/dashboard/payments/tips", icon: WalletCards },
        { label: "Subscriptions", href: "/dashboard/payments/subscriptions", icon: CreditCard },
      ],
    },
    {
      id: "widgets",
      label: "Widgets",
      items: [
        { label: "Widgets overview", href: "/dashboard/widgets", icon: MonitorPlay },
        { label: "Alerts", href: "/dashboard/widgets/alerts", icon: Bell },
        { label: "Alert History", href: "/dashboard/alert-history", icon: History },
        { label: "Goals", href: "/dashboard/widgets/goals", icon: Target },
        { label: "Leaderboard", href: "/dashboard/widgets/leaderboard", icon: Trophy },
        { label: "Subathon", href: "/dashboard/widgets/subathon", icon: TimerReset },
        { label: "Spin Wheel", href: "/dashboard/widgets/spin-wheel", icon: Dices },
        { label: "Raffle", href: "/dashboard/widgets/raffle", icon: Gift },
        { label: "Chat", href: "/dashboard/widgets/chat", icon: Send },
        { label: "Media Share", href: "/dashboard/widgets/media-share", icon: MonitorPlay },
      ],
    },
    {
      id: "integrations",
      label: "Integrations",
      items: [
        { label: "Go Live", href: "/dashboard/integrations/go-live", icon: Zap },
        { label: "Telegram", href: "/dashboard/integrations/telegram", icon: Send },
        { label: "Kit Client", href: "/dashboard/integrations/kit-client", icon: Zap },
        { label: "OBS Control", href: "/dashboard/integrations/obs", icon: MonitorPlay },
        { label: "Voice Settings", href: "/dashboard/settings/voice-settings", icon: Mic },
      ],
    },
    {
      id: "account",
      label: "Account & Help",
      items: [
        { label: "Setup Guides", href: "/setup-guides", icon: BookOpen },
        { label: "Settings", href: "/dashboard/settings", icon: Settings },
      ],
    },
  ] satisfies DashboardNavSection[],
  actions: { signOutIcon: LogOut },
};