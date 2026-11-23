import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  CreditCard,
  Database,
  Dices,
  Gift,
  Goal,
  HandCoins,
  Mic2,
  MonitorPlay,
  QrCode,
  Send,
  Sparkles,
  TimerReset,
  Trophy,
  UserPlus,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import ThemeToggle from "@/components/dashboard/ThemeToggle";
import LandingPreview from "@/components/LandingPreview";
import "./dashboard/dashboard-theme.css";
import styles from "./landing.module.css";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    icon: HandCoins,
    title: "Public tip page",
    description:
      "Share one focused link. Supporters can choose USD or KHR, pick an amount, and leave a message, photo, or voice note.",
  },
  {
    icon: BellRing,
    title: "Donation alerts",
    description:
      "Every verified tip can trigger an on-screen alert with your choice of animation, sound, and duration.",
  },
  {
    icon: Mic2,
    title: "Voice alerts",
    description:
      "Let alerts read supporter messages aloud with your chosen voice, or play the voice note they recorded.",
  },
  {
    icon: Goal,
    title: "Goals",
    description:
      "Live progress bars fill as support arrives, with target amounts and overlay styling that fit your scene.",
  },
  {
    icon: Trophy,
    title: "Leaderboards and tickers",
    description:
      "Keep top supporters and recent activity visible with transparent leaderboard and ticker widgets.",
  },
  {
    icon: Dices,
    title: "Spin wheel",
    description:
      "Set a tip threshold and let a custom wheel pick the prize live on stream.",
  },
  {
    icon: Gift,
    title: "Raffles",
    description:
      "Collect entries, draw a winner, and keep the result in front of your audience.",
  },
  {
    icon: TimerReset,
    title: "Subathon timer",
    description:
      "Run a countdown that extends with donations and can be paused or reset from your dashboard.",
  },
  {
    icon: MonitorPlay,
    title: "OBS overlays",
    description:
      "Copy a browser-source URL into OBS. Alerts, goals, and widgets sit transparently over your scene.",
  },
];

const integrations = [
  { icon: MonitorPlay, label: "OBS Studio" },
  { icon: QrCode, label: "Bakong KHQR" },
  { icon: CreditCard, label: "ABA PayWay" },
  { icon: Send, label: "Telegram" },
  { icon: Database, label: "Supabase" },
  { icon: WalletCards, label: "USD + KHR" },
];

const steps = [
  {
    number: "01",
    title: "Create your room",
    description:
      "Sign up with email or Google, then set your display name and public creator handle.",
    tag: "Email or Google",
  },
  {
    number: "02",
    title: "Shape the experience",
    description:
      "Choose currencies, preset amounts, alert styling, and an optional voice. Copy your OBS source when you are ready.",
    tag: "Tip settings + OBS",
  },
  {
    number: "03",
    title: "Share and go live",
    description:
      "Publish your tip page. Confirmed support arrives as alerts and updates your stream widgets automatically.",
    tag: "Public tip link",
  },
];

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

export default function LandingPage() {
  return (
    <div className={`dashboard-shell ${styles.page}`}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>

      <header className={styles.topbar}>
        <div className={`${styles.navInner} ${styles.container}`}>
          <Link href="/" className={styles.brand} aria-label="Steam Kit home">
            <span className={styles.brandMark}>
              <BrandMark />
            </span>
            <span className={styles.brandCopy}>
              <span className={styles.brandName}>STEAM KIT</span>
              <span className={styles.brandMeta}>Creator control room</span>
            </span>
          </Link>

          <nav className={styles.navLinks} aria-label="Landing page">
            <a href="#preview">Preview</a>
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <Link href="/setup-guides">Guides</Link>
          </nav>

          <div className={styles.navActions}>
            <ThemeToggle compact />
            <Link className={styles.navSignIn} href="/auth?mode=signin">
              Sign in
            </Link>
            <Button size="sm" asChild>
              <Link href="/auth?mode=signup">
                <UserPlus size={14} aria-hidden="true" />
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.container}>
            <div className={styles.heroCopy}>
              <p className={styles.heroBadge}>
                <Sparkles size={14} aria-hidden="true" />
                Creator control room
              </p>
              <h1 className={styles.heroTitle} id="hero-title">
                Supercharge your stream
                <span> with Steam Kit.</span>
              </h1>
              <p className={styles.heroDescription}>
                Tips, alerts, goals, and OBS overlays in one focused workspace,
                so you can stay with your audience instead of juggling tabs.
              </p>

              <div className={styles.heroActions}>
                <Button size="lg" asChild>
                  <Link href="/auth?mode=signup">
                    <UserPlus size={18} aria-hidden="true" />
                    Create free account
                  </Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/auth?mode=signin">
                    Sign in
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              <div className={styles.heroChecks} aria-label="Platform highlights">
                <span>
                  <CheckCircle2 size={13} aria-hidden="true" />
                  Email or Google
                </span>
                <span>
                  <CheckCircle2 size={13} aria-hidden="true" />
                  OBS-ready
                </span>
                <span>
                  <CheckCircle2 size={13} aria-hidden="true" />
                  USD + KHR
                </span>
              </div>
            </div>

            <div id="preview" className={styles.previewWrap}>
              <LandingPreview />
            </div>
          </div>
        </section>

        <section className={styles.stack} aria-label="Built around your stream stack">
          <div className={styles.container}>
            <p className={styles.stackLabel}>Built around the tools behind your stream</p>
            <div className={styles.stackRow}>
              {integrations.map(({ icon: Icon, label }) => (
                <span className={styles.stackItem} key={label}>
                  <Icon size={17} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section
          id="features"
          className={styles.section}
          aria-labelledby="features-title"
        >
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.eyebrow}>Everything in one place</p>
              <h2 className={styles.sectionTitle} id="features-title">
                Everything you need for your stream.
              </h2>
              <p className={styles.sectionDescription}>
                Real tools for the moments that matter, from the first tip to the
                final goal.
              </p>
            </div>

            <div className={styles.featureGrid}>
              {features.map(({ icon: Icon, title, description }) => (
                <article className={styles.featureCard} key={title}>
                  <span className={styles.featureIcon}>
                    <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className={styles.howSection}
          aria-labelledby="how-title"
        >
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.eyebrow}>From sign-up to live</p>
              <h2 className={styles.sectionTitle} id="how-title">
                Live in three clear steps.
              </h2>
              <p className={styles.sectionDescription}>
                Set up your room, connect your overlay, and keep the focus on
                your stream.
              </p>
            </div>

            <div className={styles.steps}>
              {steps.map((step) => (
                <article className={styles.step} key={step.number}>
                  <div className={styles.stepTop}>
                    <span className={styles.stepNumber}>{step.number}</span>
                    <span className={styles.stepRule} aria-hidden="true" />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <span className={styles.stepTag}>{step.tag}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.ctaSection} aria-labelledby="cta-title">
          <div className={styles.container}>
            <div className={styles.ctaCard}>
              <div className={styles.ctaGlow} aria-hidden="true" />
              <p className={styles.eyebrow}>Your next stream starts here</p>
              <h2 className={styles.ctaTitle} id="cta-title">
                Ready to bring your stream into focus?
              </h2>
              <p className={styles.ctaDescription}>
                Create your room and keep the moments that matter in one place.
              </p>
              <div className={styles.ctaActions}>
                <Button size="lg" asChild>
                  <Link href="/auth?mode=signup">
                    <UserPlus size={18} aria-hidden="true" />
                    Create free account
                  </Link>
                </Button>
                <Link className={styles.ctaSignIn} href="/auth?mode=signin">
                  Already have a room? Sign in
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.footerInner} ${styles.container}`}>
          <Link href="/" className={styles.footerBrand} aria-label="Steam Kit home">
            <span className={styles.footerMark}>
              <BrandMark />
            </span>
            <span className={styles.footerBrandName}>STEAM KIT</span>
          </Link>

          <nav className={styles.footerLinks} aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <Link href="/setup-guides">Setup guides</Link>
            <Link href="/auth?mode=signin">Sign in</Link>
            <Link href="/auth?mode=signup">Create account</Link>
          </nav>

          <p className={styles.copyright}>© 2026 Steam Kit</p>
        </div>
      </footer>
    </div>
  );
}
