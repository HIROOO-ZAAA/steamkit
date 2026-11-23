export type GuideVisualName =
  | "account"
  | "setup"
  | "obs"
  | "troubleshoot"
  | "tip"
  | "payment"
  | "alerts"
  | "voice"
  | "goals"
  | "widgets"
  | "telegram";

/**
 * The visual is deliberately one diagram per feature, not a fake screenshot.
 * `step` highlights the part of the diagram the current instruction is about.
 */
const visualByGuide: Record<string, GuideVisualName> = {
  "create-account": "account",
  "initial-setup": "setup",
  "add-obs-overlay": "obs",
  "fix-obs-overlay": "troubleshoot",
  "tip-page": "tip",
  "donation-methods": "payment",
  "configure-alerts": "alerts",
  "voice-alerts": "voice",
  "goals-leaderboards": "goals",
  "creator-tools": "widgets",
  "connect-telegram": "telegram",
};

const fallbackCheckpoint =
  "Confirm the change is visible on the page before continuing to the next step.";

/**
 * A concrete expected result for every step. These describe the controls and
 * states that exist in this build; they never claim that a creator's live
 * integration is configured.
 */
const checkpointsByGuide: Record<string, string[]> = {
  "create-account": [
    "The sign-up form shows fields for your full name, email address, and password, plus the Create Account action.",
    "After confirming the email, the sign-in form accepts the same address and password and opens /dashboard.",
    "Opening /dashboard while signed out sends you to the sign-in screen; a successful sign-in returns you to the dashboard.",
    "The dashboard loads with the sidebar, OBS LINKS card, and page content visible.",
  ],
  "initial-setup": [
    "The dashboard loads without a redirect and the OBS LINKS card is visible alongside the main summary.",
    "Saving the identity form reports success, and Visit Tip Page opens the public page for your saved username.",
    "Save Tip Settings reports success, and the public page opens with the currency and payment method you selected.",
    "The alert profile saves, and TEST produces an on-screen preview in the OBS Browser source.",
    "Each optional tool you open loads without a setup warning, and any test action you use is clearly marked as a preview.",
  ],
  "add-obs-overlay": [
    "The copy action places the full overlay URL on your clipboard. Keep that value private; do not paste it into a guide or public chat.",
    "The new source is a Browser source, contains the copied URL, and renders the alert page in OBS.",
    "The additional widget uses its own URL and opens its own overlay route instead of reusing the alert source.",
    "TEST appears in the OBS scene and the audio meter moves when a sound or spoken alert is enabled.",
  ],
  "fix-obs-overlay": [
    "The source type is Browser, the URL is complete, and the current dashboard copy is the value in OBS.",
    "The Browser source is sized for the widget—1920 by 1080 for the main alert overlay—and no edge is cut off.",
    "Refresh cache of current page reloads the source and the overlay returns without restarting the whole scene.",
    "The Browser source is unmuted and assigned to an audio track you broadcast; TEST produces visible and audible output.",
  ],
  "tip-page": [
    "Visit Tip Page opens /pay/[username] and the page shows your creator name and profile details.",
    "The copy action copies the Tips URL, which begins with your site origin and /pay/.",
    "The public form shows the active currency, an amount control, the configured payment method, and the Continue to Pay action.",
    "The same public form opens in a signed-out window or a phone browser at the address you plan to share.",
  ],
  "donation-methods": [
    "Tips & Payments loads with the Tips URL, Live Feed URL, merchant fields, currency rules, and Save Tip Settings action.",
    "The ABA checker reaches a verified state, or the Bakong ID is present, and no credential is shown outside its input.",
    "The active currency has a positive preset, a valid minimum, and a maximum that is not below the minimum; Save Tip Settings reports success.",
    "The public page shows the same payment method, currency, presets, and amount limits that you saved.",
    "The provider confirms the smallest real payment you are prepared to make; there is no in-app test-donation control.",
    "Donations lists the completed transaction, and any alert or supporter tool responds only after the provider confirms it.",
  ],
  "configure-alerts": [
    "Alerts shows the overlay URL, live preview, tier selector, and customization panel.",
    "The active profile or tier is clearly selected, and you know whether the next save affects only it or all settings.",
    "PREVIEW shows the updated layout, colors, animation, and message, and Save Settings reports success.",
    "The TTS toggle is enabled, the chosen voice is shown, and saving completes without a settings error.",
    "TEST produces the saved alert in OBS without creating a completed donation. Use PREVIEW when you only want to inspect the dashboard canvas.",
  ],
  "voice-alerts": [
    "Voice Settings loads the voice library and the Add voice clone action.",
    "The sample is between 3 and 35 seconds, the transcript is present, consent is checked, and the create action is enabled.",
    "The new clone appears in the library with a ready state and can be previewed.",
    "The clone is selected as the alert voice, or Automatic is selected, before you save the alert settings.",
    "TEST produces intelligible speech in OBS, and the spoken text matches the alert template.",
  ],
  "goals-leaderboards": [
    "The goal appears in the list with its target, current amount, and active or paused state.",
    "The goal widget URL is copied from Goals and renders the goal in its own OBS Browser source.",
    "The leaderboard widget saves, its URL copies, and the overlay shows rows for the selected data source.",
    "A preview changes only the preview. Real totals come from completed tips, so verify the payment before resetting anything.",
  ],
  "creator-tools": [
    "Save Wheel reports success and a test spin returns a recorded result. A missing overlay token warning means no draw was made.",
    "Participants and ticket counts persist after a refresh, and a draw records one winner; reset clears the entries.",
    "The timer value persists after refresh, and start, pause, and manual add-time change the countdown as expected.",
    "Only a tool with a visible copy action is used as an OBS source. The wheel, raffle, and subathon remain dashboard-controlled.",
  ],
  "connect-telegram": [
    "Kit Client shows the local bridge as online, or clearly explains that it is offline.",
    "A QR login appears, and the Telegram account you intended accepts it. Never share the QR or session details.",
    "Two-step verification either continues the login or reports a clear error without creating a second session.",
    "The group and PayWay bot are selected, START LISTENING reports an active listener, and transaction rows can load.",
    "A new PayWay message in the selected group appears in the listener log while the bridge and dashboard remain open.",
  ],
};

export function getGuideVisual(slug: string): GuideVisualName {
  return visualByGuide[slug] ?? "setup";
}

export function getStepCheckpoint(slug: string, step: number): string {
  return checkpointsByGuide[slug]?.[step] ?? fallbackCheckpoint;
}

export function getVisualCaption(
  visual: GuideVisualName,
  step: number,
): string {
  const captions: Record<GuideVisualName, string[]> = {
    account: [
      "Sign-up form and the Google option",
      "Email confirmation before the first sign-in",
      "Sign-in and the private dashboard redirect",
      "Dashboard entry point after authentication",
    ],
    setup: [
      "Dashboard areas used during initial setup",
      "Identity settings and the public tip address",
      "Tips & Payments and per-currency rules",
      "Alert profile and OBS Browser source",
      "Optional creator tools in the sidebar",
    ],
    obs: [
      "Copy a private Browser source URL",
      "Add the URL to a Browser source",
      "Use a separate source for each widget",
      "Check visibility and audio routing",
    ],
    troubleshoot: [
      "Check source type and URL first",
      "Match the source size to the widget",
      "Refresh only the affected source",
      "Isolate audio from layout problems",
    ],
    tip: [
      "Identity settings and the public handle",
      "Tips URL and Live Feed URL",
      "What a supporter sees on the public form",
      "Share the public form, never the private feed",
    ],
    payment: [
      "Tips & Payments overview",
      "Merchant identity fields",
      "Currency rules and amount limits",
      "Saved settings on the public form",
      "Provider-confirmed payment flow",
      "Completed transaction in Donations",
    ],
    alerts: [
      "Alert preview and overlay URL",
      "Default profile and amount tiers",
      "Visual, sound, and message controls",
      "Text-to-speech settings",
      "Test delivery and preview states",
    ],
    voice: [
      "Voice library entry point",
      "Recording, trim, transcript, and consent",
      "A ready clone in the voice library",
      "Choose the clone used by alerts",
      "Verify speech through the OBS source",
    ],
    goals: [
      "Goal list and active campaign",
      "Goal overlay URL",
      "Leaderboard widget configuration",
      "Preview versus live totals",
    ],
    widgets: [
      "Spin wheel configuration and test draw",
      "Raffle entries and server-recorded draw",
      "Persisted subathon timer",
      "Overlay-supported versus dashboard-only tools",
    ],
    telegram: [
      "Local bridge outside the browser",
      "Telegram QR device login",
      "Two-step verification challenge",
      "Group, bot, and listener state",
      "Listener log and transaction flow",
    ],
  };

  return captions[visual]?.[step] ?? "Example interface for this step";
}
