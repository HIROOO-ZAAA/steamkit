import Link from "next/link";
import {
  Container,
  Footer,
  Navbar,
  SectionHeader,
} from "@/components/ui/Layout";
import { Avatar } from "@/components/ui/Content";
import { Button, SecondaryButton } from "@/components/ui/Button";
import { SteamKitMark } from "@/components/ui/SteamKitMark";
import LandingPreview from "@/components/LandingPreview";
import styles from "./landing.module.css";

const activityExamples = [
  {
    name: "Creator One",
    event: "Goal milestone reached",
    amount: "$25.00",
  },
  {
    name: "Creator Two",
    event: "New supporter message",
    amount: "$10.00",
  },
  {
    name: "Creator Three",
    event: "Alert preview completed",
    amount: "$5.00",
  },
];

const creatorTools = [
  ["Donation alerts", "Tune duration, sound, motion, and voice output."],
  ["Goals and leaderboards", "Track community milestones and supporters."],
  ["Analytics", "Review donation activity and performance over time."],
];

const streamTools = [
  ["Tipping page", "Give viewers a focused place to support your stream."],
  [
    "Spin wheel and raffle",
    "Bring audience participation into your broadcast.",
  ],
  ["Subathon timer", "Keep stream milestones visible and in sync."],
  ["OBS overlays", "Add transparent browser sources to your scene."],
  ["YouTube and Telegram", "Plan creator integrations from one workspace."],
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <Navbar className={styles.navbar}>
        <Container className={styles.navInner}>
          <Link
            href="/"
            className={styles.brand}
            aria-label="Steam Kit Stream home"
          >
            <SteamKitMark size={30} />
            <span>STEAM KIT</span>
          </Link>
          <div className={styles.navLinks}>
            <a href="#capabilities">Capabilities</a>
            <a href="#activity">Activity preview</a>
          </div>
          <div className={styles.navActions}>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth?mode=signin">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth?mode=signup">Launch room</Link>
            </Button>
          </div>
        </Container>
      </Navbar>

      <main>
        <section className={styles.hero}>
          <Container className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>STREAM CONTROL / 01</p>
              <h1>Live tools for creators who need signal, not clutter.</h1>
              <p className={styles.heroDescription}>
                Bring supporter activity, overlays, and creator workflows into
                one clear control room built for the pace of a live stream.
              </p>
              <div className={styles.herotions}>
                <Button size="lg" asChild>
                  <Link href="/auth?mode=signup">Launch your room</Link>
                </Button>
                <SecondaryButton size="lg" asChild>
                  <Link href="#capabilities">View controls</Link>
                </SecondaryButton>
              </div>
              <div className={styles.heroFootnote}>
                DONATIONS  OBS OVERLAYS  STREAM TOOLS
              </div>
            </div>
            <LandingPreview />
          </Container>
        </section>

        <section
          id="activity"
          className={styles.activitySection}
          aria-labelledby="activity-title"
        >
          <Container>
            <div className={styles.activityHeading}>
              <div>
                <p className={styles.sectionLabel}>ACTIVITY PREVIEW</p>
                <h2 id="activity-title">The small moments, in view.</h2>
              </div>
              <p className={styles.sampleNote}>SAMPLE DATA</p>
            </div>
            <div className={styles.activityRail}>
              {activityExamples.map((item) => (
                <article className={styles.activityItem} key={item.name}>
                  <Avatar name={item.name} size="sm" />
                  <div className={styles.activityText}>
                    <strong>{item.name}</strong>
                    <span>{item.event}</span>
                  </div>
                  <div className={styles.activityAmount}>
                    <strong>{item.amount}</strong>
                  </div>
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section id="capabilities" className={styles.capabilities}>
          <Container>
            <SectionHeader
              eyebrow="CREATOR TOOLKIT / 02"
              title="A calmer control room for your stream."
              description="Configure the moments viewers see and keep the important signals close at hand."
            />
            <div className={styles.capabilityGrid}>
              <article className={styles.primaryFeature}>
                <p className={styles.sectionLabel}>EVENT TO OVERLAY</p>
                <h3>One verified event. Every stream surface.</h3>
                <p>
                  Build toward a trusted flow from supporter activity to alert,
                  goal progress, and creator reporting.
                </p>
                <ol className={styles.eventFlow}>
                  <li>
                    <span>01</span>
                    <strong>Receive</strong>
                    <small>Donation intent</small>
                  </li>
                  <li>
                    <span>02</span>
                    <strong>Verify</strong>
                    <small>Provider status</small>
                  </li>
                  <li>
                    <span>03</span>
                    <strong>Broadcast</strong>
                    <small>Creator event</small>
                  </li>
                </ol>
                <p className={styles.safetyNote}>
                  Payment confirmation must come from the payment provider, not
                  the browser.
                </p>
              </article>

              <div className={styles.toolColumn}>
                <div className={styles.toolGroup}>
                  <p className={styles.sectionLabel}>CREATOR CONTROL</p>
                  {creatorTools.map(([title, description], index) => (
                    <article className={styles.toolRow} key={title}>
                      <span className={styles.toolIndex}>0{index + 1}</span>
                      <div>
                        <h3>{title}</h3>
                        <p>{description}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className={styles.toolGroup}>
                  <p className={styles.sectionLabel}>STREAM CONNECTIONS</p>
                  {streamTools.map(([title, description], index) => (
                    <article className={styles.toolRow} key={title}>
                      <span className={styles.toolIndex}>0{index + 4}</span>
                      <div>
                        <h3>{title}</h3>
                        <p>{description}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section className={styles.callTotion}>
          <Container className={styles.ctaInner}>
            <div>
              <p className={styles.sectionLabel}>YOUR NEXT STREAM / 03</p>
              <h2>Set up your creator workspace.</h2>
            </div>
            <Button size="lg" asChild>
              <Link href="/auth?mode=signup">Set up your room</Link>
            </Button>
          </Container>
        </section>
      </main>

      <Footer className={styles.footer}>
        <Container className={styles.footerInner}>
          <Link href="/" className={styles.brand}>
            <SteamKitMark size={30} />
            <span>STEAM KIT</span>
          </Link>
          <span className={styles.footerNote}>
            CREATOR TOOLS / STREAM CONTROL
          </span>
          <span className={styles.copyright}>Â© 2026 Steam Kit</span>
        </Container>
      </Footer>
    </div>
  );
}


