import type { GuideVisualName } from "./guideWalkthroughMeta";
import styles from "./setup-guides.module.css";

type GuideVisualProps = {
  visual: GuideVisualName;
  step: number;
  caption: string;
};

function focus(step: number, index: number) {
  return step === index ? "true" : undefined;
}

function AccountVisual({ step }: { step: number }) {
  return (
    <div className={styles.accountVisual}>
      <div className={styles.authMock} data-active={focus(step, 0)}>
        <span className={styles.mockKicker}>CREATE ACCOUNT</span>
        <div className={styles.mockField}>
          <span>Full name</span>
          <i />
        </div>
        <div className={styles.mockField}>
          <span>Email address</span>
          <i />
        </div>
        <div className={styles.mockField}>
          <span>Password</span>
          <i />
        </div>
        <span className={styles.mockPrimary}>Create account</span>
        <span className={styles.mockDivider}>or</span>
        <span className={styles.mockSecondary}>Continue with Google</span>
      </div>

      <div className={styles.authSide}>
        <div className={styles.mockMiniCard} data-active={focus(step, 1)}>
          <span className={styles.mockKicker}>VERIFY</span>
          <strong>Confirmation email</strong>
          <p>Open the message, then return to sign in.</p>
        </div>
        <div className={styles.mockMiniCard} data-active={focus(step, 2)}>
          <span className={styles.mockKicker}>SIGN IN</span>
          <div className={styles.mockInlineField}>Email</div>
          <div className={styles.mockInlineField}>Password</div>
          <span className={styles.mockPrimary}>Sign in</span>
        </div>
        <div className={styles.mockMiniCard} data-active={focus(step, 3)}>
          <span className={styles.mockKicker}>DASHBOARD</span>
          <strong>Creator workspace</strong>
          <p>Private route. Sign-in required.</p>
        </div>
      </div>
    </div>
  );
}

function SetupVisual({ step }: { step: number }) {
  const stages = ["Dashboard", "Identity", "Tips", "Alerts", "Tools"];

  return (
    <div className={styles.setupVisual}>
      <div className={styles.setupRail}>
        {stages.map((stage, index) => (
          <span
            key={stage}
            className={styles.setupStage}
            data-active={focus(step, index)}
          >
            <i>{String(index + 1).padStart(2, "0")}</i>
            {stage}
          </span>
        ))}
      </div>

      <div className={styles.setupMock}>
        <div className={styles.mockHeader}>
          <span className={styles.mockBrandMark}>SK</span>
          <span className={styles.mockHeaderLine} />
          <span className={styles.mockHeaderPill}>Dashboard</span>
        </div>
        <div className={styles.mockMetricRow}>
          <span>
            <i>ALERTS</i>
            <strong>Overlay ready</strong>
          </span>
          <span>
            <i>TIPS</i>
            <strong>Public page</strong>
          </span>
          <span>
            <i>VOICE</i>
            <strong>Optional</strong>
          </span>
        </div>
        <div className={styles.mockLinksCard} data-active={focus(step, 3)}>
          <span className={styles.mockKicker}>OBS LINKS</span>
          <div className={styles.mockLinkRow}>
            <span>Alert widget</span>
            <span className={styles.mockCopy}>Copy link</span>
          </div>
          <div className={styles.mockLinkRow}>
            <span>Donation dock</span>
            <span className={styles.mockCopy}>Copy link</span>
          </div>
        </div>
        <div className={styles.mockNavRail} data-active={focus(step, 4)}>
          <span>Goals</span>
          <span>Leaderboard</span>
          <span>Widgets</span>
          <span>Telegram</span>
        </div>
      </div>
    </div>
  );
}

function ObsVisual({ step }: { step: number }) {
  return (
    <div className={styles.obsVisual}>
      <div className={styles.sceneMock} data-active={focus(step, 1)}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>SCENE</span>
          <span className={styles.mockHeaderLine} />
        </div>
        <span className={styles.sourceRow} data-active={focus(step, 0)}>
          <i className={styles.sourceType}>B</i>
          Alert overlay
        </span>
        <span className={styles.sourceRow}>
          <i className={styles.sourceType}>B</i>
          Goal widget
        </span>
        <span className={styles.sourceRow} data-active={focus(step, 2)}>
          <i className={styles.sourceType}>B</i>
          Custom widget
        </span>
        <span className={styles.sourceRow}>
          <i className={styles.sourceType}>C</i>
          Game capture
        </span>
      </div>

      <div className={styles.sourceMock}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>BROWSER SOURCE</span>
          <span className={styles.mockHeaderLine} />
        </div>
        <div className={styles.mockField} data-active={focus(step, 0)}>
          <span>URL</span>
          <i>https://your-app/overlay/alerts?token=••••••</i>
        </div>
        <div className={styles.sizeGrid} data-active={focus(step, 1)}>
          <span>
            <i>WIDTH</i>
            <strong>1920</strong>
          </span>
          <span>
            <i>HEIGHT</i>
            <strong>1080</strong>
          </span>
        </div>
        <div className={styles.audioMock} data-active={focus(step, 3)}>
          <span>Control audio via OBS</span>
          <span className={styles.meter} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <p className={styles.mockHint}>Token masked in this illustration.</p>
      </div>
    </div>
  );
}

function TroubleshootVisual({ step }: { step: number }) {
  const rows = [
    ["Browser source type", "OK"],
    ["URL matches dashboard", "Re-copy"],
    ["Source size", "1920 × 1080"],
    ["Audio track", "Check"],
  ];

  return (
    <div className={styles.troubleshootVisual}>
      <div className={styles.diagnosticHeader}>
        <span className={styles.mockKicker}>OVERLAY CHECK</span>
        <span className={styles.diagnosticStatus}>NOT LIVE YET</span>
      </div>
      <div className={styles.diagnosticList}>
        {rows.map(([label, value], index) => (
          <div
            key={label}
            className={styles.diagnosticRow}
            data-active={focus(step, index)}
          >
            <span className={styles.diagnosticDot} />
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className={styles.diagnosticFix} data-active={focus(step, 2)}>
        <span className={styles.mockSecondary}>Refresh cache of current page</span>
        <p>Refresh one source before restarting OBS.</p>
      </div>
      <div className={styles.audioPath} data-active={focus(step, 3)}>
        <span>Browser source</span>
        <span className={styles.flowArrow}>→</span>
        <span>Broadcast track</span>
        <span className={styles.meter} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

function TipVisual({ step }: { step: number }) {
  return (
    <div className={styles.tipVisual}>
      <div className={styles.tipDashboardMock} data-active={focus(step, 0)}>
        <span className={styles.mockKicker}>TIPS &amp; PAYMENTS</span>
        <div className={styles.tipUrlMock}>
          <span>/pay/</span>
          <strong>your-name</strong>
          <span className={styles.mockCopy}>Copy Tips URL</span>
        </div>
        <div className={styles.tipIdentityRow}>
          <span className={styles.mockAvatar} />
          <span>
            <strong>Creator display name</strong>
            <i>Public page identity</i>
          </span>
        </div>
        <div className={styles.mockLinkRow} data-active={focus(step, 1)}>
          <span>Live Feed URL</span>
          <span className={styles.privateTag}>Private</span>
        </div>
      </div>

      <div className={styles.tipPhoneMock} data-active={focus(step, 2)}>
        <span className={styles.mockKicker}>SUPPORT THE STREAM</span>
        <strong>Creator display name</strong>
        <div className={styles.currencyRow}>
          <span data-active="true">USD</span>
          <span>KHR</span>
        </div>
        <div className={styles.amountPills}>
          <i>$1</i>
          <i>$5</i>
          <i>$10</i>
        </div>
        <div className={styles.mockInlineField}>Display name</div>
        <div className={styles.mockInlineField}>Message</div>
        <span className={styles.mockPrimary}>Continue to pay</span>
        <p className={styles.mockHint}>Example interface. No payment is sent.</p>
      </div>

      <div className={styles.shareMock} data-active={focus(step, 3)}>
        <span className={styles.mockKicker}>SHARE THE RIGHT LINK</span>
        <span className={styles.shareGood}>/pay/your-name → public</span>
        <span className={styles.shareBad}>Live feed / overlay URL → keep private</span>
      </div>
    </div>
  );
}

function PaymentVisual({ step }: { step: number }) {
  return (
    <div className={styles.paymentVisual}>
      <div className={styles.paymentSettingsMock} data-active={focus(step, 0)}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>TIPS &amp; PAYMENTS</span>
          <span className={styles.mockHeaderLine} />
          <span className={styles.mockHeaderPill}>USD active</span>
        </div>
        <div className={styles.settingRow} data-active={focus(step, 1)}>
          <span>
            <strong>ABA PayWay</strong>
            <i>Merchant link (USD / KHR)</i>
          </span>
          <span className={styles.settingValue}>Private</span>
        </div>
        <div className={styles.settingRow} data-active={focus(step, 1)}>
          <span>
            <strong>Bakong ID</strong>
            <i>Merchant name above QR</i>
          </span>
          <span className={styles.settingValue}>Private</span>
        </div>
        <div className={styles.settingRow} data-active={focus(step, 2)}>
          <span>
            <strong>Currency rules</strong>
            <i>Presets · minimum · maximum</i>
          </span>
          <span className={styles.settingValue}>USD / KHR</span>
        </div>
        <div className={styles.mockButtonRow}>
          <span className={styles.mockSecondary}>Preview</span>
          <span className={styles.mockPrimary} data-active={focus(step, 2)}>
            Save Tip Settings
          </span>
        </div>
      </div>

      <div className={styles.paymentFlow}>
        <span className={styles.flowNode} data-active={focus(step, 3)}>
          <i>01</i>
          Public form
        </span>
        <span className={styles.flowArrow}>→</span>
        <span className={styles.flowNode} data-active={focus(step, 4)}>
          <i>02</i>
          Provider QR
        </span>
        <span className={styles.flowArrow}>→</span>
        <span className={styles.flowNode} data-active={focus(step, 5)}>
          <i>03</i>
          Donations
        </span>
      </div>
      <p className={styles.paymentNote} data-active={focus(step, 4)}>
        Provider-confirmed, not a preview
      </p>
    </div>
  );
}

function AlertsVisual({ step }: { step: number }) {
  return (
    <div className={styles.alertsVisual}>
      <div className={styles.alertPreviewMock} data-active={focus(step, 4)}>
        <div className={styles.alertPreviewTop}>
          <span className={styles.mockKicker}>ALERT PREVIEW</span>
          <span className={styles.liveTag}>LIVE CANVAS</span>
        </div>
        <div className={styles.alertBox}>
          <span className={styles.alertAvatar} />
          <div>
            <strong>Supporter</strong>
            <p>sent $5.00</p>
            <span>Great stream!</span>
          </div>
        </div>
        <div className={styles.alertGraphic} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className={styles.mockButtonRow}>
          <span className={styles.mockSecondary}>PREVIEW</span>
          <span className={styles.mockPrimary} data-active={focus(step, 4)}>
            TEST
          </span>
        </div>
      </div>

      <div className={styles.alertControlsMock} data-active={focus(step, 0)}>
        <div className={styles.controlRow} data-active={focus(step, 1)}>
          <span>Profile</span>
          <strong>Default + amount tiers</strong>
        </div>
        <div className={styles.controlRow} data-active={focus(step, 2)}>
          <span>Visual &amp; sound</span>
          <strong>Layout · animation · audio</strong>
        </div>
        <div className={styles.controlRow} data-active={focus(step, 3)}>
          <span>Text-to-speech</span>
          <strong>Voice clone · message template</strong>
        </div>
        <div className={styles.saveScopeMock}>
          <span className={styles.mockKicker}>SAVE SCOPE</span>
          <span className={styles.mockInlineField}>Selected setting</span>
          <span className={styles.mockInlineField}>All settings</span>
        </div>
      </div>
    </div>
  );
}

function VoiceVisual({ step }: { step: number }) {
  return (
    <div className={styles.voiceVisual}>
      <div className={styles.voiceRecorderMock} data-active={focus(step, 1)}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>VOICE SAMPLE</span>
          <span className={styles.mockHeaderPill}>00:08 / 00:35</span>
        </div>
        <div className={styles.waveform} aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <div className={styles.mockInlineField}>Transcript matches this clip</div>
        <span className={styles.consentMock}>Consent confirmed</span>
      </div>

      <div className={styles.voiceLibraryMock}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>VOICE LIBRARY</span>
          <span className={styles.mockHeaderLine} />
        </div>
        <div className={styles.cloneRow} data-active={focus(step, 2)}>
          <span className={styles.mockAvatar} />
          <span>
            <strong>My alert voice</strong>
            <i>Consent + provider ID</i>
          </span>
          <span className={styles.readyTag}>READY</span>
        </div>
        <div className={styles.cloneRow} data-active={focus(step, 3)}>
          <span>Alert voice</span>
          <span className={styles.settingValue}>Clone / Automatic</span>
        </div>
        <div className={styles.audioPath} data-active={focus(step, 4)}>
          <span>Alert TTS</span>
          <span className={styles.flowArrow}>→</span>
          <span>OBS source</span>
          <span className={styles.meter} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}

function GoalsVisual({ step }: { step: number }) {
  return (
    <div className={styles.goalsVisual}>
      <div className={styles.goalMock} data-active={focus(step, 0)}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>ACTIVE GOAL</span>
          <span className={styles.readyTag}>LIVE</span>
        </div>
        <strong>New stream equipment</strong>
        <div className={styles.progressTrack}>
          <i style={{ width: "62%" }} />
        </div>
        <div className={styles.goalNumbers}>
          <span>$310 raised</span>
          <span>$500 goal</span>
        </div>
        <div className={styles.mockButtonRow}>
          <span className={styles.mockSecondary} data-active={focus(step, 1)}>
            Copy widget URL
          </span>
          <span className={styles.mockSecondary} data-active={focus(step, 3)}>
            Simulate
          </span>
        </div>
      </div>

      <div className={styles.leaderboardMock} data-active={focus(step, 2)}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>LEADERBOARD</span>
          <span className={styles.mockHeaderPill}>This month</span>
        </div>
        <div className={styles.leaderRow}>
          <span>01</span>
          <i className={styles.mockAvatar} />
          <strong>Supporter one</strong>
          <span>$80</span>
        </div>
        <div className={styles.leaderRow}>
          <span>02</span>
          <i className={styles.mockAvatar} />
          <strong>Supporter two</strong>
          <span>$45</span>
        </div>
        <div className={styles.leaderRow}>
          <span>03</span>
          <i className={styles.mockAvatar} />
          <strong>Supporter three</strong>
          <span>$25</span>
        </div>
        <p className={styles.mockHint}>Example rows. Totals come from completed tips.</p>
      </div>
    </div>
  );
}

function WidgetsVisual({ step }: { step: number }) {
  return (
    <div className={styles.widgetsVisual}>
      <div className={styles.widgetMock} data-active={focus(step, 0)}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>SPIN WHEEL</span>
          <span className={styles.mockHeaderLine} />
        </div>
        <div className={styles.wheelGraphic} aria-hidden="true">
          <i />
          <span />
        </div>
        <div className={styles.mockButtonRow}>
          <span className={styles.mockSecondary}>Save wheel</span>
          <span className={styles.mockPrimary}>Test spin</span>
        </div>
      </div>

      <div className={styles.widgetMock} data-active={focus(step, 1)}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>RAFFLE</span>
          <span className={styles.readyTag}>DASHBOARD</span>
        </div>
        <div className={styles.ticketRow}>
          <span>Supporter A</span>
          <strong>3 tickets</strong>
        </div>
        <div className={styles.ticketRow}>
          <span>Supporter B</span>
          <strong>1 ticket</strong>
        </div>
        <span className={styles.mockPrimary}>Draw winner</span>
      </div>

      <div className={styles.widgetMock} data-active={focus(step, 2)}>
        <div className={styles.mockHeader}>
          <span className={styles.mockKicker}>SUBATHON</span>
          <span className={styles.mockHeaderPill}>Manual</span>
        </div>
        <strong className={styles.timerMock}>02:14:08</strong>
        <div className={styles.mockButtonRow}>
          <span className={styles.mockSecondary}>+ Time</span>
          <span className={styles.mockPrimary}>Start</span>
        </div>
        <p className={styles.mockHint}>No automatic donation extension.</p>
      </div>

      <div className={styles.widgetSupportRow} data-active={focus(step, 3)}>
        <span>OBS copy action</span>
        <span className={styles.readyTag}>GOALS</span>
        <span className={styles.readyTag}>ALERTS</span>
        <span className={styles.privateTag}>WHEEL / RAFFLE / TIMER</span>
      </div>
    </div>
  );
}

function TelegramVisual({ step }: { step: number }) {
  return (
    <div className={styles.telegramVisual}>
      <div className={styles.bridgeMock} data-active={focus(step, 0)}>
        <span className={styles.mockKicker}>LOCAL BRIDGE</span>
        <strong>127.0.0.1:3113</strong>
        <span className={styles.bridgeStatus}>
          <i />
          Bridge status
        </span>
        <p>Runs outside the dashboard process.</p>
      </div>

      <span className={styles.flowArrow}>→</span>

      <div className={styles.telegramPhoneMock} data-active={focus(step, 1) || focus(step, 2)}>
        <span className={styles.mockKicker}>TELEGRAM LINK</span>
        <div className={styles.qrGhost} aria-hidden="true">
          {Array.from({ length: 16 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <span>Link Desktop Device</span>
        <p>QR illustration · never share it</p>
      </div>

      <span className={styles.flowArrow}>→</span>

      <div className={styles.groupMock} data-active={focus(step, 3) || focus(step, 4)}>
        <span className={styles.mockKicker}>PAYWAY GROUP</span>
        <div className={styles.groupRow}>
          <span className={styles.readyTag}>BOT</span>
          PayWay notifications
        </div>
        <div className={styles.groupRow}>
          <span className={styles.readyTag}>ON</span>
          Listener active
        </div>
        <div className={styles.logRow}>
          <span>Transaction log</span>
          <strong>Latest rows</strong>
        </div>
      </div>
    </div>
  );
}

function VisualContent({
  visual,
  step,
}: {
  visual: GuideVisualName;
  step: number;
}) {
  switch (visual) {
    case "account":
      return <AccountVisual step={step} />;
    case "setup":
      return <SetupVisual step={step} />;
    case "obs":
      return <ObsVisual step={step} />;
    case "troubleshoot":
      return <TroubleshootVisual step={step} />;
    case "tip":
      return <TipVisual step={step} />;
    case "payment":
      return <PaymentVisual step={step} />;
    case "alerts":
      return <AlertsVisual step={step} />;
    case "voice":
      return <VoiceVisual step={step} />;
    case "goals":
      return <GoalsVisual step={step} />;
    case "widgets":
      return <WidgetsVisual step={step} />;
    case "telegram":
      return <TelegramVisual step={step} />;
  }
}

export function GuideVisual({ visual, step, caption }: GuideVisualProps) {
  return (
    <figure className={styles.guideVisual} data-visual={visual}>
      <div className={styles.visualChrome}>
        <span className={styles.visualDots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.visualWindowLabel}>Steam Kit · example interface</span>
        <span className={styles.visualTag}>Illustration</span>
      </div>

      <div
        className={styles.visualCanvas}
        role="img"
        aria-label={`Illustration: ${caption}. Example interface, not a live screenshot.`}
      >
        <VisualContent visual={visual} step={step} />
      </div>

      <figcaption className={styles.visualCaption}>
        <span>Step focus</span>
        {caption}
      </figcaption>
    </figure>
  );
}
