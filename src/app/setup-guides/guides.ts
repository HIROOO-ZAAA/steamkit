export const guideCategories = [
  {
    id: "getting-started",
    label: "Getting Started",
    description: "Create an account and put the essentials in place.",
  },
  {
    id: "obs",
    label: "OBS Studio",
    description: "Add browser sources, size them, and fix common display issues.",
  },
  {
    id: "donations",
    label: "Donations & Tipping",
    description: "Share your tip page and configure supported payment methods.",
  },
  {
    id: "alerts",
    label: "Alerts & Text-to-Speech",
    description: "Build donation alerts and give them a voice.",
  },
  {
    id: "creator-tools",
    label: "Donation Goals & Creator Tools",
    description: "Run goals, leaderboards, wheels, raffles, and subathons.",
  },
  {
    id: "integrations",
    label: "External Uplinks",
    description: "Connect the services Steam Kit supports.",
  },
] as const;

export type GuideCategoryId = (typeof guideCategories)[number]["id"];

export type GuideIconName =
  | "rocket"
  | "monitor"
  | "hand-coins"
  | "bell"
  | "trophy"
  | "send";

export type GuideLink = {
  label: string;
  href: string;
};

export type GuideStep = {
  title: string;
  body: string[];
  points?: string[];
  warning?: {
    title: string;
    text: string;
  };
  tip?: string;
  details?: {
    summary: string;
    body: string[];
  };
  links?: GuideLink[];
};

export type GuideTroubleshootingItem = {
  problem: string;
  solution: string;
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  category: GuideCategoryId;
  icon: GuideIconName;
  intro: string;
  prerequisites: string[];
  steps: GuideStep[];
  troubleshooting: GuideTroubleshootingItem[];
  related: string[];
  keywords: string[];
  flow?: {
    title: string;
    steps: string[];
  };
  closing?: string;
};

export type GuideSummary = {
  slug: string;
  title: string;
  description: string;
  category: GuideCategoryId;
  icon: GuideIconName;
  steps: number;
  readingMinutes: number;
  keywords: string[];
  featured?: boolean;
};

const guideList: Guide[] = [
  {
    slug: "create-account",
    title: "Create your account and sign in",
    description:
      "Open a Steam Kit account, confirm your email, and reach your creator dashboard for the first time.",
    category: "getting-started",
    icon: "rocket",
    intro:
      "Your Steam Kit account is the creator workspace behind your public tip page, alerts, and overlays. This guide takes you from the public site to the dashboard without changing any stream settings.",
    prerequisites: [
      "An email address you can access",
      "A password of at least 6 characters, or a Google account",
    ],
    flow: {
      title: "From visitor to creator",
      steps: ["Open sign-up", "Confirm your email", "Sign in", "Dashboard"],
    },
    steps: [
      {
        title: "Open the sign-up screen",
        body: [
          "From the Steam Kit home page, choose Get started. You can also use the Create an account link in this guide.",
          "The sign-up form asks for your full name, email address, and a password. Read the helper text under the password field so you know the current minimum length.",
        ],
        points: [
          "Choose a password you do not reuse on another site.",
          "If Continue with Google is available, it opens the Google sign-in flow instead of the email form.",
        ],
        links: [
          { label: "Open sign-up", href: "/auth?mode=signup" },
          { label: "Open sign-in", href: "/auth?mode=signin" },
        ],
      },
      {
        title: "Submit the form and check your email",
        body: [
          "Choose Create account. If the project has email confirmation enabled, check the inbox for the address you entered and open the confirmation message.",
          "After confirmation, return to Steam Kit and sign in with the same email and password. A successful sign-in takes you to the dashboard.",
        ],
        tip: "If confirmation is enabled, check the spam or promotions folder before requesting another message. Use the same email address on the confirmation and sign-in screens.",
        details: {
          summary: "Google sign-in instead of an email and password",
          body: [
            "Choose Continue with Google and complete the Google prompt. If Google sign-in is not configured for this deployment, use the email form instead. The sign-in screen reports the error instead of creating a partial account.",
          ],
        },
      },
      {
        title: "Sign in for future sessions",
        body: [
          "Use Sign in on the home page, or open the sign-in screen directly. Your dashboard route is private: if you open it while signed out, Steam Kit sends you to the sign-in page.",
        ],
        links: [{ label: "Go to sign in", href: "/auth?mode=signin" }],
      },
      {
        title: "Continue with initial setup",
        body: [
          "Reaching the dashboard is only the first step. Your display name, username, tip page, and overlay links are configured separately.",
          "Continue with Complete your initial setup before you share a tipping link or add a browser source to OBS.",
        ],
        links: [
          { label: "Open the dashboard", href: "/dashboard" },
          {
            label: "Read Complete your initial setup",
            href: "/setup-guides?guide=initial-setup",
          },
        ],
      },
    ],
    troubleshooting: [
      {
        problem: "The confirmation email has not arrived",
        solution:
          "Check the spam or promotions folder, confirm the address is spelled correctly, and wait a moment before requesting another message from the sign-in screen.",
      },
      {
        problem: "The password is rejected",
        solution:
          "Meet the minimum length shown under the password field. If you already created the account, use the sign-in form so the error describes the existing account instead of the sign-up form.",
      },
      {
        problem: "Google sign-in returns an error",
        solution:
          "The Google provider may not be configured on this deployment. Use the email and password form, or ask the Steam Kit operator to check the auth provider configuration.",
      },
    ],
    related: ["initial-setup", "tip-page"],
    keywords: [
      "account",
      "sign up",
      "signup",
      "sign in",
      "signin",
      "login",
      "email",
      "Google",
      "password",
      "confirmation",
      "access",
      "dashboard",
    ],
  },
  {
    slug: "initial-setup",
    title: "Complete your initial setup",
    description:
      "Set your creator identity, claim your public tip page, connect your payment settings, and prepare your first overlay.",
    category: "getting-started",
    icon: "rocket",
    intro:
      "This is the shortest path from a new account to a usable creator setup. Move through the dashboard in order: identity first, then tipping, then alerts and overlays. You can leave optional tools for later.",
    prerequisites: [
      "A Steam Kit account you can sign in to",
      "Your creator name and desired public username",
      "Payment details for a supported method if you plan to accept tips now",
    ],
    flow: {
      title: "Setup order that avoids rework",
      steps: ["Identity", "Tip page", "Alerts", "OBS source"],
    },
    steps: [
      {
        title: "Get familiar with the dashboard",
        body: [
          "The sidebar groups your work into Creator Studio, Donations, Stream Modules, External Uplinks, and Account. Creator Studio holds the dashboard and setup guides; Donations holds payment logs, analytics, and tip settings; Stream Modules holds alerts, voice settings, goals, and creator tools; External Uplinks holds Telegram and Kit Client.",
          "On the dashboard, the OBS LINKS card is the quickest place to copy the Alert Widget and Donation Dock browser sources once your account is ready.",
        ],
        links: [{ label: "Open the dashboard", href: "/dashboard" }],
      },
      {
        title: "Set your display name and username",
        body: [
          "Open Account Settings and start with Identity Matrix. Set the display name supporters should see, then scroll to Basic Information and set a username.",
          "The username becomes your public tip-page handle. Use the Visit Tip Page action after saving to confirm the page loads at the expected address.",
        ],
        points: [
          "The display name appears in the creator experience; the username is the public address.",
          "Choose a username you are comfortable sharing in chat and on social profiles.",
        ],
        warning: {
          title: "Your username controls a public link",
          text: "Changing the username later changes the address of your tip page. Update any posted links after a username change.",
        },
        links: [{ label: "Open Account Settings", href: "/dashboard/settings" }],
      },
      {
        title: "Configure tips and payment methods",
        body: [
          "Open Tips & Payments. Start with your supported payment method and merchant credentials, then set the currency, preset amounts, and allowed range.",
          "Choose Save Tip Settings after making changes. The Tip and Live Feed URL section is where you can copy the public link or open the live feed.",
        ],
        warning: {
          title: "A setup banner can limit what saves",
          text: "If the page warns that a database update is pending, per-currency payment options and some alert preferences may not save yet. Configure only the settings the page confirms, and ask the Steam Kit operator to apply the pending update.",
        },
        links: [{ label: "Open Tips & Payments", href: "/dashboard/payments/tips" }],
      },
      {
        title: "Prepare your first alert and overlay",
        body: [
          "Open Alerts and review the default donation profile. Choose a layout, animation, sound, and text-to-speech option, then save and test the alert.",
          "Copy the full browser-source URL from the alerts page or the dashboard OBS LINKS card. Add it to OBS as a Browser source. The alert page recommends a 1920 by 1080 source.",
        ],
        warning: {
          title: "Treat overlay links like passwords",
          text: "A full overlay URL includes a private token. Copy it into OBS, but do not post it in chat, a public document, or a screenshot.",
        },
        links: [
          { label: "Open Alerts", href: "/dashboard/widgets/alerts" },
          {
            label: "Read Add a donation alert to OBS",
            href: "/setup-guides?guide=add-obs-overlay",
          },
        ],
      },
      {
        title: "Add optional creator tools",
        body: [
          "You do not need every module on day one. Add the tools that match your stream plan, confirm each one saves, and test it before going live.",
        ],
        points: [
          "Voice alerts: create and test a voice clone before enabling text-to-speech.",
          "Goals and leaderboards: configure a goal or widget, then copy its separate overlay URL.",
          "Spin wheel, raffle, and subathon: these are managed from the dashboard; only the pages that show a copyable URL are documented as OBS sources.",
          "Telegram: connect through the local Kit Client bridge if you use ABA PayWay payments.",
        ],
        links: [
          { label: "Read the voice guide", href: "/setup-guides?guide=voice-alerts" },
          {
            label: "Read the goals and leaderboards guide",
            href: "/setup-guides?guide=goals-leaderboards",
          },
          { label: "Read the Telegram guide", href: "/setup-guides?guide=connect-telegram" },
        ],
      },
    ],
    troubleshooting: [
      {
        problem: "The Visit Tip Page action is missing",
        solution:
          "The public page needs a username. Save a username in Account Settings, refresh the page, then look for the Visit Tip Page action again.",
      },
      {
        problem: "Tip settings will not save",
        solution:
          "Check for a setup or migration warning at the top of Tips & Payments, confirm the active currency has a valid preset and range, and make sure required merchant fields are filled for the selected method.",
      },
      {
        problem: "The alert URL is not ready",
        solution:
          "Open the Alerts page while signed in and wait for the overlay credential to load. Copy the complete URL from the page rather than editing a previous link.",
      },
    ],
    related: ["create-account", "tip-page", "add-obs-overlay"],
    keywords: [
      "start",
      "setup",
      "onboarding",
      "initial",
      "identity",
      "display name",
      "username",
      "tip page",
      "payment",
      "overlay",
      "OBS",
      "first stream",
    ],
  },
  {
    slug: "add-obs-overlay",
    title: "Add a donation alert to OBS",
    description:
      "Copy a Steam Kit browser-source link and place the alert overlay in OBS with the right size and audio.",
    category: "obs",
    icon: "monitor",
    intro:
      "Steam Kit overlays are web pages. OBS loads them with a Browser source, so you do not need a plugin or a separate capture window. The alert and donation dock links are available from the dashboard; goals, leaderboards, and custom widgets each have their own link.",
    prerequisites: [
      "A signed-in Steam Kit account with an overlay credential",
      "OBS Studio or another broadcaster that supports Browser sources",
      "Your alert settings saved at least once",
    ],
    flow: {
      title: "From dashboard to broadcast",
      steps: ["Copy overlay URL", "Add Browser source", "Set size and audio", "Test"],
    },
    steps: [
      {
        title: "Copy the overlay link from the dashboard",
        body: [
          "Sign in and open the dashboard. Find the OBS LINKS card and choose the copy action for Alert Widget or Donation Dock.",
          "The copied value is a complete URL, including the private overlay credential. Use the copy action rather than typing the address by hand. If the button has nothing to copy yet, wait for the page to finish loading your overlay credential.",
        ],
        warning: {
          title: "Do not share the full link",
          text: "The token in the URL is effectively a key to your overlay. Keep it inside OBS and your private setup notes. Do not put the full URL in a public guide, chat message, or support screenshot.",
        },
        links: [{ label: "Open the dashboard", href: "/dashboard" }],
      },
      {
        title: "Add a Browser source in OBS",
        body: [
          "In OBS, open the Sources panel for the scene where the overlay should appear, choose the add-source button, and select Browser.",
          "Give the source a recognizable name such as Steam Kit Alerts. Paste the copied URL into the URL field. Leave the page in the same browser source; do not open the link in a normal tab.",
        ],
        points: [
          "For the main alert overlay, start with a width of 1920 and a height of 1080. The alerts page recommends this size.",
          "If you use a smaller canvas, keep the same aspect ratio so the alert is not cropped.",
          "Put the browser source above your gameplay source in the scene list if the alert should be visible over the stream.",
        ],
      },
      {
        title: "Bring in additional widgets only when needed",
        body: [
          "The alert overlay is separate from goals, leaderboards, and the custom widget overlay. Each page that exposes a copyable URL gives you a browser-source link for that widget.",
          "Use the Alerts page for the alert-specific link. Use Goals, Leaderboard, or Widget Overlays when you want those widgets on stream. The spin wheel, raffle, and subathon pages do not currently expose a copyable overlay link in the dashboard.",
        ],
        points: [
          "Goals: copy the widget URL from the Goals page.",
          "Leaderboard: copy the widget URL from the Leaderboard page.",
          "Custom widgets: copy the widget URL from Widget Overlays.",
        ],
        links: [
          { label: "Open Alerts", href: "/dashboard/widgets/alerts" },
          { label: "Open Goals", href: "/dashboard/widgets/goals" },
          { label: "Open Leaderboard", href: "/dashboard/widgets/leaderboard" },
          { label: "Open Widget Overlays", href: "/dashboard/widget-overlays" },
        ],
      },
      {
        title: "Confirm the source is live",
        body: [
          "Send a test alert from the Alerts page after saving. Keep the OBS preview or program output visible so you can confirm the alert appears, then check that its sound reaches the stream.",
          "In OBS, open the Browser source properties and confirm Control audio via OBS is selected if you want OBS to mix the alert audio. Check the Advanced Audio Properties if the source is muted or routed to a track you do not broadcast.",
        ],
        warning: {
          title: "Test is not a donation",
          text: "The TEST action sends a simulated alert to OBS and stores a donation-history entry marked TEST. It does not create a real payment or verify provider payment capture.",
        },
      },
    ],
    troubleshooting: [
      {
        problem: "The browser source is blank",
        solution:
          "Re-copy the complete URL from the dashboard and paste it again. Confirm the source type is Browser, not Media Source, and temporarily increase the source size to 1920 by 1080 to rule out cropping.",
      },
      {
        problem: "The alert appears but there is no sound",
        solution:
          "Enable Control audio via OBS in the Browser source properties, unmute the source in the OBS audio mixer, and confirm the alert sound is enabled and saved on the Alerts page.",
      },
      {
        problem: "A second widget does not appear",
        solution:
          "Goals, leaderboards, and custom widgets use separate URLs. Copy the matching URL from that specific page instead of reusing the alert link.",
      },
    ],
    related: ["configure-alerts", "fix-obs-overlay", "goals-leaderboards"],
    keywords: [
      "OBS",
      "browser source",
      "overlay",
      "alert widget",
      "donation dock",
      "alerts",
      "copy URL",
      "scene",
      "audio",
      "1920",
      "1080",
      "layout",
    ],
  },
  {
    slug: "fix-obs-overlay",
    title: "Fix a missing or misplaced OBS overlay",
    description:
      "Work through the usual causes of a blank overlay, a cropped widget, or an alert with no audio before changing your settings.",
    category: "obs",
    icon: "monitor",
    intro:
      "Most overlay problems come from the source URL, the source type, or the size of the Browser source. Check those three things first. This guide does not ask you to change alert playback logic or overlay code.",
    prerequisites: [
      "Access to the OBS scene and the Steam Kit dashboard",
      "The overlay page already configured and saved",
    ],
    steps: [
      {
        title: "Check the source type and URL",
        body: [
          "Open the source properties in OBS. The source must be a Browser source, and the URL must be complete.",
          "Return to the dashboard and copy the link again. A partial URL, an extra space, or a link pasted from an old note can produce a blank page. Copying a fresh link also avoids debugging a stale value.",
        ],
        warning: {
          title: "Do not publish the replacement link",
          text: "Re-copying solves a private-source problem, but the new URL is still sensitive. Keep the replacement out of public messages.",
        },
      },
      {
        title: "Restore the recommended size",
        body: [
          "For the main alert overlay, set the Browser source to 1920 by 1080. If your canvas is a different size, keep the same 16:9 ratio so elements are not cropped.",
          "For a goal, leaderboard, or custom widget, use a size that matches the widget's layout. If the widget is cut off, widen the source first, then adjust the height.",
        ],
        points: [
          "A source that is too small can hide the right or bottom edge of a widget.",
          "A source that is much larger than the canvas can make text look small or place the widget outside the visible frame.",
        ],
      },
      {
        title: "Refresh the browser source",
        body: [
          "Open the Browser source properties and choose Refresh cache of current page, then close the dialog. Wait a few seconds for the page to reconnect.",
          "If only one widget is affected, refresh that source rather than restarting OBS. If every overlay is blank, confirm you are signed in to the dashboard in the browser where you copied the links.",
        ],
      },
      {
        title: "Check audio routing separately",
        body: [
          "A visible alert with no sound is usually an OBS audio-routing issue, not a URL issue. Open Advanced Audio Properties and confirm the Browser source is not muted and is assigned to a track you broadcast.",
          "Then return to Alerts, confirm the sound is enabled, save, and use TEST again. The test does not create a donation.",
        ],
        links: [
          { label: "Open Alerts", href: "/dashboard/widgets/alerts" },
          { label: "Open Widget Overlays", href: "/dashboard/widget-overlays" },
        ],
      },
    ],
    troubleshooting: [
      {
        problem: "Only the alert overlay works",
        solution:
          "That is expected when the other sources point at a different URL. Add the goal, leaderboard, or widget URL from its own dashboard page instead of reusing the alert source.",
      },
      {
        problem: "The overlay works in a browser tab but not in OBS",
        solution:
          "Confirm OBS is using a Browser source, not a browser capture or Media Source. Check that the source is visible in the active scene and above the background layer.",
      },
      {
        problem: "The overlay was working and then stopped",
        solution:
          "Refresh the source, then re-copy the link from the dashboard. If the dashboard was reset or the overlay credential changed, the previous URL may no longer be the current one.",
      },
    ],
    related: ["add-obs-overlay", "configure-alerts", "goals-leaderboards"],
    keywords: [
      "OBS",
      "overlay not showing",
      "blank",
      "black screen",
      "cropped",
      "misaligned",
      "refresh",
      "browser source",
      "audio",
      "muted",
      "size",
      "token",
    ],
  },
  {
    slug: "tip-page",
    title: "Understand and share your tip page",
    description:
      "Find your public tipping link, know what supporters see, and keep the shared address current.",
    category: "donations",
    icon: "hand-coins",
    intro:
      "Your tip page is the public form supporters use to choose an amount and pay through the method you configured. It is separate from the dashboard and does not require supporters to sign in to Steam Kit.",
    prerequisites: [
      "A username saved in Account Settings",
      "At least one supported payment method configured in Tips & Payments",
    ],
    steps: [
      {
        title: "Claim the public address",
        body: [
          "Open Account Settings and set a username. The public page uses that handle, so choose it before you promote the link.",
          "After saving, use Visit Tip Page to open the public experience and confirm it belongs to the right creator.",
        ],
        warning: {
          title: "A username change moves the page",
          text: "The handle is part of the URL. If you change it, the old address no longer identifies the same creator. Update every posted link.",
        },
        links: [{ label: "Open Account Settings", href: "/dashboard/settings" }],
      },
      {
        title: "Copy the tip link from Tips & Payments",
        body: [
          "Open Tips & Payments and find Tip and Live Feed URL. The Tips URL is the link to share with supporters. The live feed is a separate view intended for monitoring activity.",
          "Use the copy action so you do not introduce a typo. You can open the public page to verify the creator name and profile details before sharing it.",
        ],
        links: [{ label: "Open Tips & Payments", href: "/dashboard/payments/tips" }],
      },
      {
        title: "Know what supporters do",
        body: [
          "On the public page, a supporter chooses the available currency and an amount or preset, enters a display name, and can add a message. The form also offers an optional voice message and asks for the exact bank account name used for the payment.",
          "After CONTINUE TO PAY, Steam Kit requests a payment code from the configured provider. For a QR payment, the code has a limited lifetime and a countdown. The payment is only complete after the provider confirms it.",
        ],
        points: [
          "The message field is short; keep the wording stream-friendly.",
          "The exact bank account name field is required for the payment request.",
          "A voice message is optional. The public page shows the configured creator name and payment method, not private dashboard data.",
          "The form also displays a Media Share YouTube field, but this build has no verified queue-to-overlay playback flow. Do not promote that field as a working feature yet.",
        ],
        warning: {
          title: "There is no public test mode",
          text: "A submitted tip is a real payment through your configured provider. Steam Kit does not expose a simulate-payment button on the public form.",
        },
      },
      {
        title: "Share the right link in the right place",
        body: [
          "Post the Tips URL in your channel description, chat command, social profile, and stream panels. Do not share the live feed, dashboard, or OBS browser-source URL with supporters.",
          "If the page is not live yet, finish payment setup first. A valid page can exist before every payment method is configured, but supporters need a working method to complete a tip.",
        ],
      },
    ],
    troubleshooting: [
      {
        problem: "The public page says no creator was found",
        solution:
          "Check the spelling of the handle and confirm a username is saved in Account Settings. A changed username also changes the public address.",
      },
      {
        problem: "The supporter cannot continue to payment",
        solution:
          "Check the amount range and the configured payment method in Tips & Payments. The public form also requires the supporter to enter the exact bank account name.",
      },
      {
        problem: "A payment did not create an alert",
        solution:
          "Confirm the provider marked the payment as completed. Pending or failed payments do not become completed donations, and alert settings must be saved for the relevant amount.",
      },
    ],
    related: ["donation-methods", "configure-alerts", "initial-setup"],
    keywords: [
      "tip page",
      "public link",
      "share",
      "supporter",
      "donation",
      "USD",
      "KHR",
      "amount",
      "message",
      "voice note",
      "bank account",
      "QR",
      "username",
    ],
  },
  {
    slug: "donation-methods",
    title: "Configure payment methods and test a tip safely",
    description:
      "Choose the supported payment method for each currency, set amount rules, and verify the real supporter flow without confusing a preview for a payment.",
    category: "donations",
    icon: "hand-coins",
    intro:
      "Steam Kit supports ABA PayWay and Bakong fields in Tips & Payments. Configure one method at a time, save it, and verify the supporter experience before you announce the link. There is no separate in-app sandbox for the public tip form in this build.",
    prerequisites: [
      "A signed-in creator account",
      "An ABA PayWay merchant configured by the operator, or a Bakong account ID",
      "A public username so the tip page has an address",
    ],
    flow: {
      title: "Payment setup",
      steps: ["Choose method", "Add credentials", "Set amounts", "Save", "Test"],
    },
    steps: [
      {
        title: "Open the payment settings",
        body: [
          "Open Tips & Payments. The page groups the public link, merchant credentials, currency rules, and the save action.",
          "Review any warning banner before editing. A pending database update can prevent per-currency payment methods and related preferences from saving.",
        ],
        links: [{ label: "Open Tips & Payments", href: "/dashboard/payments/tips" }],
      },
      {
        title: "Add the merchant details for your method",
        body: [
          "In Merchant Credentials, paste the merchant link for each currency you want to accept. The dashboard checks an ABA link as you enter it and shows a verified state when it recognizes the format.",
          "If you use Bakong, enter the Bakong ID and the merchant name that should appear on the tip page. Fill only the fields for the methods you actually use.",
        ],
        points: [
          "ABA PayWay fields: a merchant link for each currency you enable, plus the merchant name printed above the QR.",
          "Bakong field: the Bakong account ID shown to supporters.",
          "The merchant name is the label supporters see on the public page.",
        ],
        warning: {
          title: "These fields are not the whole provider setup",
          text: "The server also needs the operator's ABA PayWay API credentials, and automatic Bakong confirmation needs the operator's API token. If payment creation fails with a provider error, do not paste server keys into this form; ask the operator to finish the provider setup.",
        },
      },
      {
        title: "Choose the method and amount rules per currency",
        body: [
          "Under the USD and KHR settings, choose the payment method available for that currency. Set the preset amounts, minimum, and maximum. KHR values must be whole numbers.",
          "At least one preset in the active currency must be greater than zero. The maximum cannot be lower than the minimum. If the page offers multiple currency tabs, save and verify each one you plan to offer.",
        ],
        details: {
          summary: "Why does a currency option refuse to save?",
          body: [
            "The form validates the active currency as a set. Check that the preset list has a positive value, the minimum is valid, and the maximum is not below the minimum. If a setup banner says the database update is pending, the per-currency fields cannot be relied on until that update is applied.",
          ],
        },
      },
      {
        title: "Save and open the public page",
        body: [
          "Choose Save Tip Settings and wait for the success message. Open the Tips URL from the same page and confirm the payment method, currency options, presets, and amount range match your settings.",
          "Check the page at both desktop and phone widths. A supporter should be able to choose an amount, enter the required details, and reach the payment step without a layout or validation problem.",
        ],
      },
      {
        title: "Test with the smallest real amount",
        body: [
          "There is no separate test-donation control on the public tip form. A submitted tip is a real payment through the configured provider. If you need to verify the full path, use the smallest amount you are prepared to pay and complete the provider flow yourself.",
          "For alert appearance only, use TEST on the Alerts page or the test action on the Leaderboard page. Those previews do not verify payment capture.",
        ],
        warning: {
          title: "A preview is not a payment test",
          text: "Alert TEST and Leaderboard test actions simulate the on-screen experience. They do not prove that the public form, provider request, or payment callback works.",
        },
        links: [
          { label: "Read Configure donation alerts", href: "/setup-guides?guide=configure-alerts" },
          { label: "Open Donations", href: "/dashboard/payments/donations" },
        ],
      },
      {
        title: "Confirm the completed payment",
        body: [
          "After the provider confirms a payment, check Donations for the transaction and its status. Then confirm the alert and any configured supporter tools responded as expected.",
          "Do not treat a page refresh or an open QR screen as proof of payment. Completion comes from the provider, not from the amount form.",
        ],
      },
    ],
    troubleshooting: [
      {
        problem: "The ABA link is not accepted",
        solution:
          "Paste the full merchant link, including the missing path or query characters the checker mentions. Wait for the automatic verification result before saving.",
      },
      {
        problem: "The dashboard warns that a database update is pending",
        solution:
          "Per-currency payment options and some related settings may not save until the update is applied. Keep the warning visible for the operator and do not rewrite or apply the migration from the guide.",
      },
      {
        problem: "A payment succeeded but no alert played",
        solution:
          "Confirm the donation appears as completed in Donations, check that the alert profile covers that amount, and send a TEST alert to verify the OBS source and audio routing.",
      },
      {
        problem: "The public page shows no payment method",
        solution:
          "Save a supported method and its required merchant fields for the currency the supporter selected. A public username alone does not configure payments.",
      },
      {
        problem: "Payment creation fails with a provider error",
        solution:
          "The visible merchant fields are not the server API credentials. Ask the operator to confirm ABA PayWay merchant credentials, or the Bakong API token for automatic confirmation, are configured for this deployment.",
      },
    ],
    related: ["tip-page", "configure-alerts", "connect-telegram"],
    keywords: [
      "payment",
      "donation methods",
      "ABA PayWay",
      "Bakong",
      "merchant",
      "credentials",
      "USD",
      "KHR",
      "preset",
      "minimum",
      "maximum",
      "currency",
      "test donation",
      "QR",
      "pending migration",
    ],
  },
  {
    slug: "configure-alerts",
    title: "Configure donation alerts",
    description:
      "Choose a default profile or amount tier, customize the alert, save it, and test it in OBS.",
    category: "alerts",
    icon: "bell",
    intro:
      "Alerts are the on-screen response to a completed donation. The Alerts page controls the default profile, optional amount tiers, the visual layout, sound, text, and text-to-speech. Save first, then test.",
    prerequisites: [
      "A signed-in creator account",
      "The Steam Kit alert overlay added to OBS",
      "A payment source that creates completed donations",
    ],
    flow: {
      title: "Alert workflow",
      steps: ["Select profile", "Customize", "Save", "Test in OBS"],
    },
    steps: [
      {
        title: "Open the alert settings",
        body: [
          "Open Alerts from Stream Modules. The page shows the OBS browser-source URL first, then the live preview and alert profiles, with the customization controls alongside.",
          "If you have not added the overlay to OBS yet, copy the URL now and keep it private.",
        ],
        links: [
          { label: "Open Alerts", href: "/dashboard/widgets/alerts" },
          { label: "Read Add a donation alert to OBS", href: "/setup-guides?guide=add-obs-overlay" },
        ],
      },
      {
        title: "Choose the profile that will play",
        body: [
          "Default Setting applies to every donation. Amount tiers can override it: a donation plays the highest tier whose minimum it clears. A donation below every tier falls back to the default.",
          "Create a tier with a name and minimum amounts, then configure and save each tier separately. Use Selected Setting to save the current profile or All Settings when you intend to update every profile.",
        ],
        details: {
          summary: "How tier selection works",
          body: [
            "The page compares the donation against the tier minimums and chooses the highest match. If no tier matches, the default donation profile is used. A tier is only useful after it has been configured and saved.",
          ],
        },
      },
      {
        title: "Customize the visual and sound",
        body: [
          "Set the on-screen message, layout, colors, animation, image, and sound. The preview updates as you edit so you can check the composition before saving.",
          "Alert duration is fixed at 2 seconds in this build. The duration control is not a general-purpose timer; use the available text delay and animation settings to shape when the message appears.",
        ],
        points: [
          "The page includes a banned-words panel, but entries are not persisted or applied by the overlay in this build. Do not rely on it for moderation; use your platform's moderation tools.",
          "Choose a sound that fits the stream and check its volume in OBS.",
          "Save the profile before sending a test.",
        ],
        warning: {
          title: "Save before you test",
          text: "TEST previews the saved alert. If you change a field and test immediately, the overlay can still play the previous settings.",
        },
      },
      {
        title: "Add text-to-speech when you want it",
        body: [
          "Enable Text-to-Speech in the TTS settings, choose a voice clone or automatic selection, and edit the message template. The template is also the alert text, so keep it readable both on screen and aloud.",
          "Choose Save Settings after changing TTS options. If the volume control shows a setup notice, the related database update has not been applied; the rest of the alert form can still be saved.",
        ],
        links: [
          { label: "Read Set up alert voice", href: "/setup-guides?guide=voice-alerts" },
        ],
      },
      {
        title: "Test the saved alert",
        body: [
          "Choose TEST to send the saved alert to the live OBS overlay. Choose PREVIEW when you only want to inspect it inside the dashboard. Confirm the alert appears over gameplay, not only in the OBS preview, and check the audio mix.",
          "The test action stores a donation-history entry marked TEST and sends a simulated alert. It does not create a real payment; use PREVIEW for an on-screen-only check.",
        ],
        links: [{ label: "Open the dashboard", href: "/dashboard" }],
      },
    ],
    troubleshooting: [
      {
        problem: "The test appears in the dashboard but not in OBS",
        solution:
          "Check that the Browser source is in the active OBS scene and visible above the background. Re-copy the OBS browser-source URL and refresh the source.",
      },
      {
        problem: "The alert uses the wrong profile",
        solution:
          "Check the tier minimums and the donation currency. The highest matching tier wins, and a donation that clears no tier uses the default setting.",
      },
      {
        problem: "Text-to-speech is silent",
        solution:
          "Enable TTS in the alert settings, save, and confirm a voice clone is ready. Then check the Browser source audio in OBS and the alert volume.",
      },
      {
        problem: "A setting did not persist",
        solution:
          "Look for a pending setup warning, save again, and reload the page. If the control is specifically TTS volume, wait for the related database update before relying on it.",
      },
    ],
    related: ["voice-alerts", "add-obs-overlay", "donation-methods"],
    keywords: [
      "alerts",
      "donation alert",
      "tier",
      "default setting",
      "animation",
      "sound",
      "layout",
      "message",
      "banned words",
      "text to speech",
      "TTS",
      "test",
      "preview",
      "OBS",
    ],
  },
  {
    slug: "voice-alerts",
    title: "Set up and test alert voice",
    description:
      "Create a consented voice clone, choose it for alerts, and verify that text-to-speech reaches the stream.",
    category: "alerts",
    icon: "bell",
    intro:
      "Steam Kit can read alert text aloud with VoiceStudio. You provide a clean sample and its transcript, confirm you have the right to clone the voice, and then choose the clone in Alerts. The browser can fall back to an available voice if the VoiceStudio service is unreachable.",
    prerequisites: [
      "A signed-in creator account",
      "A microphone or audio file with 3 to 35 seconds of clear speech",
      "The exact words spoken in the sample",
      "The VoiceStudio service configured by the Steam Kit operator",
    ],
    flow: {
      title: "Voice alert path",
      steps: ["Record sample", "Add transcript", "Create clone", "Enable TTS", "Test"],
    },
    steps: [
      {
        title: "Open Voice Settings",
        body: [
          "Open Voice Settings from Stream Modules. The page lists your voice clones and provides the create action.",
          "Listen to your sample before uploading. Use one speaker, minimal background noise, and the same language you want the clone to speak.",
        ],
        links: [{ label: "Open Voice Settings", href: "/dashboard/settings/voice-settings" }],
      },
      {
        title: "Add a clean voice sample",
        body: [
          "Record in the page or choose an audio file. Keep the sample between 3 and 35 seconds and trim it if it is longer. A WAV, MP3, or M4A recording is easiest to trim in the browser.",
          "Enter the exact transcript of the final clip. If the page offers a draft transcription, correct it by listening; an inaccurate transcript makes an inaccurate clone.",
        ],
        points: [
          "Name the clone so you can recognize it later.",
          "The transcript is required, even if the speaker's words seem obvious.",
          "Confirm the consent checkbox before creating the clone.",
        ],
        warning: {
          title: "Only clone a voice you have permission to use",
          text: "The consent confirmation is required and becomes part of the clone record. Do not upload another person's voice without their explicit permission.",
        },
      },
      {
        title: "Create the clone and confirm it is ready",
        body: [
          "Submit the sample and wait for the page to finish processing. A clone that is missing its consent record or its VoiceStudio provider ID is hidden from alert playback, so it will not appear as a usable option.",
          "If the page offers a preview phrase, play it to check pronunciation before you use the clone on stream. Rename or delete a clone from the list if you need to clean up a failed attempt.",
        ],
        details: {
          summary: "What happens if VoiceStudio is unavailable?",
          body: [
            "Voice cloning depends on the configured VoiceStudio backend. If the service is unreachable, creation or preview can fail, and alert playback may fall back to a voice the browser can provide. The fallback is not guaranteed to match the cloned voice, so test on the stream machine before going live.",
          ],
        },
      },
      {
        title: "Select the clone for alerts",
        body: [
          "Return to Alerts and find the Text-to-Speech settings. Enable TTS, then choose the clone from the Voice Clone list. Automatic selection uses an available ready clone.",
          "Choosing a clone updates the alert voice immediately. Enable TTS, adjust the template, and choose Save Settings before you send a test.",
        ],
        links: [
          { label: "Open Alerts", href: "/dashboard/widgets/alerts" },
          { label: "Read Configure donation alerts", href: "/setup-guides?guide=configure-alerts" },
        ],
      },
      {
        title: "Test the complete audio path",
        body: [
          "Send a test alert with the OBS preview visible. The test action stores a donation-history entry marked TEST; it does not create a real payment. Confirm the text appears, the voice is intelligible, and the alert audio is audible in the stream mix.",
          "Check the Browser source audio routing in OBS, not only the dashboard preview. Preview playback in the dashboard does not prove the OBS source is audible.",
        ],
      },
    ],
    troubleshooting: [
      {
        problem: "The clone is not available in Alerts",
        solution:
          "Confirm the clone finished processing, has a consent record, and has a VoiceStudio provider ID. A failed clone cannot be selected for playback.",
      },
      {
        problem: "The sample cannot be uploaded",
        solution:
          "Shorten the clip to 35 seconds or less, confirm it is at least 3 seconds, and use a common audio format. A browser that cannot trim the file should upload a WAV, MP3, or M4A recording.",
      },
      {
        problem: "Preview works but alerts are silent",
        solution:
          "Save the alert settings with TTS enabled, test again, and check the OBS Browser source audio and mixer. Also confirm the alert was sent after the clone became ready.",
      },
      {
        problem: "The voice sounds different from the preview",
        solution:
          "The VoiceStudio service may be unavailable and the browser fallback may be speaking instead. Confirm the backend is running and test from the same machine that runs OBS.",
      },
    ],
    related: ["configure-alerts", "initial-setup", "add-obs-overlay"],
    keywords: [
      "voice",
      "voice clone",
      "VoiceStudio",
      "text to speech",
      "TTS",
      "sample",
      "transcript",
      "consent",
      "preview",
      "audio",
      "microphone",
      "alert voice",
      "Khmer",
    ],
  },
  {
    slug: "goals-leaderboards",
    title: "Set up goals and leaderboards",
    description:
      "Create a donation goal or leaderboard widget, copy its own overlay link, and test it before adding it to a scene.",
    category: "creator-tools",
    icon: "trophy",
    intro:
      "Goals and leaderboards are separate stream widgets. Configure each one from its dashboard page, then copy the widget-specific browser-source URL. Do not reuse the alert overlay URL for either widget.",
    prerequisites: [
      "A signed-in creator account with completed donations or a test action available",
      "The OBS Browser source workflow",
    ],
    flow: {
      title: "Widget setup",
      steps: ["Create widget", "Style it", "Copy URL", "Add to OBS"],
    },
    steps: [
      {
        title: "Create a donation goal",
        body: [
          "Open Goals and choose Create New Goal. Enter a title, choose the style and progress display, select a currency, and set the target amount. Add an end date only if the goal should stop at a specific time.",
          "After saving, the goal appears in the queue. Use the available controls to activate or pause it, adjust progress, reset it, or delete it.",
        ],
        points: [
          "Goals can be queued and completed; only the active goal is the current campaign.",
          "The simulation controls show how the widget looks but do not save progress.",
          "Reset returns progress to zero. Delete removes the goal.",
        ],
        warning: {
          title: "Reset and delete are immediate",
          text: "Use the confirmation dialogs carefully. Resetting loses the current progress total, and deleting removes the goal and its configuration.",
        },
        links: [{ label: "Open Goals", href: "/dashboard/widgets/goals" }],
      },
      {
        title: "Copy the goal overlay URL",
        body: [
          "On Goals, choose the copy action for the widget URL. Add that complete URL to a separate OBS Browser source.",
          "Size the source to fit the goal card, then check the default and active states. The goal overlay is a different route from the alert overlay even though both are configured from the same dashboard.",
        ],
        links: [{ label: "Read Add a donation alert to OBS", href: "/setup-guides?guide=add-obs-overlay" }],
      },
      {
        title: "Create a leaderboard widget",
        body: [
          "Open Leaderboard and choose Create widget. Give it a title, choose the data source and time range, set the number of rows, and adjust the layout, colors, and text options.",
          "Save the widget, then use the copy action for its widget URL. Add it to OBS as its own Browser source and confirm the ranking rows fit the size you chose.",
        ],
        points: [
          "The leaderboard can show all-time, session, weekly, or monthly supporters. Choose the matching data source, then set the number of rows and the visual options.",
          "The test action stores a donation-history entry marked TEST and sends a simulated alert. It does not create a real payment.",
        ],
        links: [{ label: "Open Leaderboard", href: "/dashboard/widgets/leaderboard" }],
      },
      {
        title: "Test both widgets safely",
        body: [
          "Use the available preview and simulation controls to check layout. For a real donation, verify the payment in Donations before expecting the goal or leaderboard to update.",
          "If the goal amount or ranking looks wrong, check the live data source first, then refresh the Browser source in OBS. Do not reset a goal just to force a redraw.",
        ],
        links: [{ label: "Open Donations", href: "/dashboard/payments/donations" }],
      },
    ],
    troubleshooting: [
      {
        problem: "The goal widget is blank",
        solution:
          "Confirm the goal is active and that you used the goal widget URL, not the alert URL. Copy the link again from Goals and refresh the Browser source.",
      },
      {
        problem: "The leaderboard has no rows",
        solution:
          "Check the selected time range and confirm there are completed donations in Donations. A test preview is not the same as a completed payment.",
      },
      {
        problem: "Reset did not do what I expected",
        solution:
          "Reset changes the goal's progress to zero; it does not remove the goal. If you needed to remove it, use Delete with confirmation. Neither action can be undone from the widget.",
      },
    ],
    related: ["creator-tools", "add-obs-overlay", "donation-methods"],
    keywords: [
      "goals",
      "goal",
      "donation goal",
      "progress bar",
      "target",
      "leaderboard",
      "top supporters",
      "widget",
      "overlay",
      "queue",
      "pause",
      "reset",
      "delete",
      "test donation",
    ],
  },
  {
    slug: "creator-tools",
    title: "Run the spin wheel, raffle, and subathon",
    description:
      "Configure the dashboard creator tools, understand what each one can do, and know which ones expose an OBS overlay URL.",
    category: "creator-tools",
    icon: "trophy",
    intro:
      "The creator-tools pages cover three different live activities. They share a dashboard-first workflow, but they do not all expose an OBS browser source. Use this guide to set expectations before promising an on-stream widget.",
    prerequisites: [
      "A signed-in creator account",
      "The tool's core settings decided before you go live",
    ],
    flow: {
      title: "Choose the right tool",
      steps: ["Spin wheel", "Raffle", "Subathon", "Check overlay support"],
    },
    steps: [
      {
        title: "Configure the spin wheel",
        body: [
          "Open Spin Wheel, set the wheel title and minimum donation amount, and edit the slices. A saved wheel can be test-spun from the dashboard; the draw is recorded on the server so the displayed result is the actual result.",
          "Add or remove slices, then choose Save Wheel. A test spin is a real draw and is recorded; it is not only a visual animation.",
        ],
        points: [
          "Keep at least two slices.",
          "The test spin uses the same server-side draw as an automatic spin from a tip.",
        ],
        warning: {
          title: "The dashboard does not expose a copyable wheel URL",
          text: "The spin-wheel page can configure and test the wheel, but this build does not show a copy action for a permanent spin-wheel browser source. Do not promise an OBS wheel overlay unless the operator has provided a supported source.",
        },
        links: [{ label: "Open Spin Wheel", href: "/dashboard/widgets/spin-wheel" }],
      },
      {
        title: "Run a raffle",
        body: [
          "Open Raffle and add participants or tickets as the page allows. Entries are managed on this page; there is no verified donation-to-entry hook. The winner is chosen by the server, not by an animation in the browser.",
          "Record or announce the result, then reset the raffle only when you are ready to start a new round. A reset clears the current draw and entries.",
        ],
        warning: {
          title: "Raffle is a dashboard tool",
          text: "The raffle page does not expose a copyable OBS browser-source URL. Keep the dashboard visible on your own screen while running the draw.",
        },
        links: [{ label: "Open Raffle", href: "/dashboard/widgets/raffle" }],
      },
      {
        title: "Set up a subathon timer",
        body: [
          "Open Subathon and set the minutes added per USD. Use the add-time control when you need to extend the timer, then start or pause it as the stream requires.",
          "The timer is controlled from the dashboard. This page does not expose a copyable overlay URL, so do not add a subathon browser source unless a supported one is provided elsewhere.",
        ],
        points: [
          "Starting the timer begins the countdown; pausing stops it at the current value.",
          "Reset changes the timer immediately. Confirm the current value before resetting.",
          "Minutes per USD is a rate setting. Completed donations do not automatically add time in this build; use the add-time control.",
        ],
        links: [{ label: "Open Subathon", href: "/dashboard/widgets/subathon" }],
      },
      {
        title: "Check overlay support before you promote a tool",
        body: [
          "Goals, leaderboards, custom widget overlays, alerts, and the donation dock have copyable OBS links in their pages. The spin wheel, raffle, and subathon are dashboard-controlled in this build.",
          "If you need a visual on stream, use a supported widget or a scene capture of the dashboard only when you are comfortable showing that information to viewers.",
        ],
        warning: {
          title: "Do not build a tokenized URL by hand",
          text: "Overlay links are generated for your account. Guessing or assembling a URL is unreliable and can expose private values. Use only links the dashboard provides.",
        },
        links: [
          { label: "Read goals and leaderboards", href: "/setup-guides?guide=goals-leaderboards" },
          { label: "Open Widget Overlays", href: "/dashboard/widget-overlays" },
        ],
      },
    ],
    troubleshooting: [
      {
        problem: "The test spin says the overlay token is not ready",
        solution:
          "Open the dashboard OBS LINKS card or an overlay settings page once and wait for its overlay link to load, then retry from Spin Wheel. If the message persists, the account's overlay credential has not been provisioned; use the dashboard's supported copy actions and do not create a token manually.",
      },
      {
        problem: "The raffle cannot choose a winner",
        solution:
          "Confirm entries are present and the raffle is ready for a draw. A completed draw must be reset before another winner can be selected.",
      },
      {
        problem: "The subathon timer did not load",
        solution:
          "Reload the page and confirm you are signed in. If the page still fails, check the timer value before adding time so you do not double-count minutes.",
      },
    ],
    related: ["goals-leaderboards", "initial-setup", "donation-methods"],
    keywords: [
      "spin wheel",
      "wheel of fortune",
      "raffle",
      "giveaway",
      "subathon",
      "timer",
      "minutes per USD",
      "creator tools",
      "draw",
      "test spin",
      "overlay support",
    ],
  },
  {
    slug: "connect-telegram",
    title: "Connect Telegram with Kit Client",
    description:
      "Use the local Telegram bridge to scan a QR login, choose a group, and start listening for ABA PayWay payments.",
    category: "integrations",
    icon: "send",
    intro:
      "Kit Client is Steam Kit's Telegram integration for ABA PayWay payments. It runs through a local bridge on the same computer as the operator, at 127.0.0.1:3113. The dashboard shows the bridge state, QR login, group selection, and transaction listener logs.",
    prerequisites: [
      "The Steam Kit project available on the computer that will run the bridge",
      "Node.js and the project dependencies installed by the operator",
      "A Telegram account that can join the ABA PayWay notification group",
      "The Telegram account's two-step verification password, if it has one",
    ],
    flow: {
      title: "Telegram bridge path",
      steps: ["Start bridge", "Scan QR", "Enter 2FA", "Choose group", "Start listening"],
    },
    steps: [
      {
        title: "Start the local bridge",
        body: [
          "On the computer that will run the integration, open a terminal in the Steam Kit project and run npm run kit-client:bridge. The bridge listens locally at 127.0.0.1:3113.",
          "Keep that terminal running. Then open Kit Client in the dashboard and reload the page if the bridge was started after the page loaded.",
        ],
        warning: {
          title: "This is a local integration",
          text: "The dashboard cannot connect Telegram by itself. If the bridge is not running on the machine serving your session, the page shows an offline state.",
        },
        links: [{ label: "Open Kit Client", href: "/dashboard/integrations/kit-client" }],
      },
      {
        title: "Scan the Telegram login QR",
        body: [
          "When the bridge is online, Kit Client shows a QR login. In Telegram, open Settings, Devices, and Link Desktop Device. Scan the QR from the dashboard.",
          "The QR is a login credential for your Telegram account. Do not screenshot it, send it to anyone, or leave it visible on a shared screen.",
        ],
        warning: {
          title: "Protect the QR and your session",
          text: "Anyone who can use the QR can attempt to sign in. Complete the login on your own device and do not share the bridge URL or session details.",
        },
      },
      {
        title: "Complete two-step verification if asked",
        body: [
          "If the Telegram account has two-step verification enabled, enter the password when the bridge asks for it. A correct password lets the bridge continue; an incorrect one leaves the login pending or returns an error.",
          "The page reports if the bridge cannot reach Telegram. In that case, wait for it to reconnect rather than repeatedly starting new logins.",
        ],
      },
      {
        title: "Choose the payment group and bot",
        body: [
          "After login, choose the Telegram group that receives your ABA PayWay notifications. Enter the PayWay bot username shown in the integration form, then choose START LISTENING.",
          "The bridge creates a local agent for the group and begins watching for payment messages. Recent transactions appear in the listener log. Keep the dashboard tab open while you rely on the integration.",
        ],
        points: [
          "Use the group that actually receives the PayWay messages you want to capture.",
          "Use CHANGE GROUP if you need to switch to a different notification group.",
          "Use LOGOUT if you need to remove the Telegram session from the bridge.",
        ],
      },
      {
        title: "Confirm the listener is working",
        body: [
          "Check that the page shows a connected state and that new transaction rows can appear in the log. If the bridge is connected but no payments arrive, confirm the bot is posting into the selected group.",
          "Do not close the terminal running the bridge or the dashboard tab. If either is closed, the listener cannot continue reliably.",
        ],
        details: {
          summary: "Is Discord or YouTube account linking available?",
          body: [
            "This build documents Telegram only. Discord OAuth is not configured, and there is no YouTube account-linking flow in Steam Kit. Do not follow external setup steps for those integrations as though they were part of this dashboard.",
          ],
        },
      },
    ],
    troubleshooting: [
      {
        problem: "Kit Client says the bridge is offline",
        solution:
          "Start the bridge with npm run kit-client:bridge in the Steam Kit project, keep the terminal open, then reload the Kit Client page. Confirm nothing else is using port 3113.",
      },
      {
        problem: "No QR code appears",
        solution:
          "Wait for the bridge status to become ready, then reload the page. If the bridge reports that it cannot reach Telegram, let it retry before starting a new login.",
      },
      {
        problem: "The login asks for a password",
        solution:
          "Enter the Telegram two-step verification password for the account. If you do not know it, recover access in Telegram before retrying the bridge.",
      },
      {
        problem: "The group list is empty",
        solution:
          "Confirm the Telegram account is a member of the ABA PayWay notification group, then reload the group selector. A group the account cannot access will not appear.",
      },
      {
        problem: "No transactions appear in the log",
        solution:
          "Confirm START LISTENING succeeded, the selected group is the one receiving PayWay bot messages, and the bridge terminal and dashboard tab are both still open.",
      },
    ],
    related: ["donation-methods", "initial-setup"],
    keywords: [
      "Telegram",
      "Kit Client",
      "bridge",
      "QR",
      "2FA",
      "two-step verification",
      "ABA PayWay",
      "group",
      "bot",
      "listener",
      "transaction",
      "local",
      "3113",
    ],
  },
];

export const guides: Guide[] = guideList;

export function getGuide(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}

export function getCategory(id: GuideCategoryId) {
  return guideCategories.find((category) => category.id === id);
}

function getGuideText(guide: Guide): string {
  const stepText = guide.steps.flatMap((step) => [
    step.title,
    ...step.body,
    ...(step.points ?? []),
    step.tip ?? "",
    step.warning?.text ?? "",
    ...(step.details?.body ?? []),
  ]);

  return [
    guide.intro,
    ...guide.prerequisites,
    ...stepText,
    ...guide.troubleshooting.flatMap((item) => [item.problem, item.solution]),
  ].join(" ");
}

export function getReadingMinutes(guide: Guide): number {
  const words = getGuideText(guide)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(2, Math.ceil(words / 180));
}

export const guideSummaries: GuideSummary[] = guides.map((guide) => ({
  slug: guide.slug,
  title: guide.title,
  description: guide.description,
  category: guide.category,
  icon: guide.icon,
  steps: guide.steps.length,
  readingMinutes: getReadingMinutes(guide),
  keywords: guide.keywords,
  featured: guide.slug === "initial-setup",
}));

export function getGuideSummary(slug: string): GuideSummary | undefined {
  return guideSummaries.find((guide) => guide.slug === slug);
}

export function getRelatedGuides(guide: Guide): GuideSummary[] {
  return guide.related
    .map((slug) => getGuideSummary(slug))
    .filter((related): related is GuideSummary => Boolean(related));
}
