import Link from "next/link";
import { ArrowUpRight, BellRing, Goal, HandCoins, UserRound } from "lucide-react";
import styles from "./widgets.module.css";

const destinations = [
  {
    title: "Donation alerts",
    description: "Configure alert styling and test the creator overlay.",
    href: "/dashboard/alerts",
    icon: BellRing,
  },
  {
    title: "Donation goals",
    description: "Set a real fundraising target and deadline.",
    href: "/dashboard/goals",
    icon: Goal,
  },
  {
    title: "Donation activity",
    description: "Review payment history from connected providers.",
    href: "/dashboard/donations",
    icon: HandCoins,
  },
  {
    title: "Creator profile",
    description: "Manage the public tipping page viewers can visit.",
    href: "/dashboard/settings",
    icon: UserRound,
  },
];

export default function WidgetsPage() {
  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Stream tools</h1>
        <p className={styles.subtitle}>
          Open the settings for each connected stream surface.
        </p>
      </header>

      <div className={styles.grid}>
        {destinations.map(({ title, description, href, icon: Icon }) => (
          <Link key={href} href={href} className={`${styles.widgetCard} card`}>
            <div className={styles.cardTop}>
              <span className={styles.widgetIcon}>
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </div>
            <h2>{title}</h2>
            <p className={styles.widgetDesc}>{description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
