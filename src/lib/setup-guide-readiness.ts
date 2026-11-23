export type SetupReadinessStatus =
  | "ready"
  | "needs_setup"
  | "optional"
  | "review"
  | "unavailable";

export type SetupReadinessItem = {
  id: string;
  title: string;
  status: SetupReadinessStatus;
  detail: string;
  href: string;
  actionLabel: string;
};

export type SelectedCloneReadiness = "ready" | "not_selected" | "needs_setup";

type ReadinessInput = {
  profile: { username: string | null; displayName: string | null } | null;
  profileUnavailable: boolean;
  overlayCredentialExists: boolean;
  overlayUnavailable: boolean;
  selectedCloneReadiness: SelectedCloneReadiness;
  voiceUnavailable: boolean;
  telegramGroupLinked: boolean;
  telegramUnavailable: boolean;
};

export function getSelectedCloneReadiness(
  cloningEnabled: boolean,
  activeCloneId: string | null,
  clones: ReadonlyArray<{
    id: string;
    consentAt: string | null;
    voiceStudioVoiceId: string | null;
  }>,
): SelectedCloneReadiness {
  if (!cloningEnabled || !activeCloneId) return "not_selected";

  const speakable = clones.some(
    (clone) =>
      clone.id === activeCloneId &&
      Boolean(clone.consentAt && clone.voiceStudioVoiceId),
  );

  return speakable ? "ready" : "needs_setup";
}

export function getSetupReadiness(input: ReadinessInput): SetupReadinessItem[] {
  const hasPublicIdentity = Boolean(
    input.profile?.username?.trim() && input.profile.displayName?.trim(),
  );

  return [
    {
      id: "profile",
      title: "Creator profile",
      status: input.profileUnavailable
        ? "unavailable"
        : hasPublicIdentity
          ? "ready"
          : "needs_setup",
      detail: input.profileUnavailable
        ? "Saved profile details could not be checked."
        : hasPublicIdentity
          ? "Display name and public username are saved."
          : "Add a display name and public username to finish your profile.",
      href: "/dashboard/settings#settings-display-name",
      actionLabel: "Edit profile",
    },
    {
      id: "tip-page",
      title: "Public tip page",
      status: input.profileUnavailable
        ? "unavailable"
        : input.profile?.username?.trim()
          ? "ready"
          : "needs_setup",
      detail: input.profileUnavailable
        ? "The public page address could not be checked."
        : input.profile?.username?.trim()
          ? "A public page address is available. Payment provider readiness still needs review."
          : "A public username is needed before the tip page can be shared.",
      href: "/dashboard/tips",
      actionLabel: "Open tip settings",
    },
    {
      id: "overlay",
      title: "OBS alert link",
      status: input.overlayUnavailable
        ? "unavailable"
        : input.overlayCredentialExists
          ? "ready"
          : "needs_setup",
      detail: input.overlayUnavailable
        ? "The saved overlay link could not be checked."
        : input.overlayCredentialExists
          ? "An alert link credential exists. OBS playback is not verified here."
          : "Open Alerts to initialize the saved alert link.",
      href: "/dashboard/widgets/alerts",
      actionLabel: "Open alerts",
    },
    {
      id: "payment-methods",
      title: "Payment methods",
      status: "review",
      detail:
        "This page cannot verify ABA or Bakong credentials. Review their status in Tips & Payments.",
      href: "/dashboard/tips",
      actionLabel: "Review payments",
    },
    {
      id: "voice-clone",
      title: "Voice clone",
      status: input.voiceUnavailable
        ? "unavailable"
        : input.selectedCloneReadiness === "ready"
          ? "ready"
          : input.selectedCloneReadiness === "needs_setup"
            ? "needs_setup"
            : "optional",
      detail: input.voiceUnavailable
        ? "Saved clone selection could not be checked."
        : input.selectedCloneReadiness === "ready"
          ? "A consented clone is selected. Read-aloud still follows the alert settings."
          : input.selectedCloneReadiness === "needs_setup"
            ? "A clone is selected, but it is not ready to speak. Complete consent or clone setup in Voice Settings before using cloned speech."
            : "Optional. Preset or fallback speech can be used without a clone.",
      href: "/dashboard/voice-settings",
      actionLabel: "Manage voices",
    },
    {
      id: "telegram",
      title: "Telegram group",
      status: input.telegramUnavailable
        ? "unavailable"
        : input.telegramGroupLinked
          ? "ready"
          : "optional",
      detail: input.telegramUnavailable
        ? "Saved Telegram group state could not be checked."
        : input.telegramGroupLinked
          ? "A group is linked. The local bridge connection is checked in Kit Client."
          : "Optional unless you use the ABA PayWay Telegram bridge.",
      href: "/dashboard/kit-client",
      actionLabel: "Open Kit Client",
    },
  ];
}
