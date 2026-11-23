export type HealthLevel = "healthy" | "degraded" | "offline" | "unknown";

export type TelegramBridgeSnapshot = {
  level: HealthLevel;
  label: string;
  detail: string;
};

export type TtsHealthSnapshot = {
  level: HealthLevel;
  label: string;
  detail: string;
};

export type TtsCloneReadiness = "ready" | "not_selected" | "needs_setup" | "unknown";

/** TTS is available if any saved alert tier enables it; no rows means unknown/default. */
export function savedTtsEnabled(
  rows: ReadonlyArray<{ tts_enabled: boolean | null }>,
): boolean | null {
  if (rows.length === 0) return null;
  return rows.some((row) => row.tts_enabled !== false);
}

export type TtsHealthInput = {
  configured: boolean;
  enabled: boolean | null;
  cloneReadiness: TtsCloneReadiness;
  observation: {
    stage: "started" | "provider_audio" | "failed" | "audio_ready";
    result: "started" | "audio" | "failed";
    voiceSource?: "clone" | "fallback";
    failureKind?: "timeout" | "provider" | "transport" | "invalid_audio" | "storage";
    providerStatus?: number;
  } | null;
  detail: string;
};

/** Report the current saved TTS prerequisites before interpreting an older synthesis result. */
export function ttsHealthSnapshot(data: TtsHealthInput): TtsHealthSnapshot {
  if (!data.configured) {
    return { level: "degraded", label: "Not configured", detail: "The server reports that the TTS backend is not configured." };
  }
  if (data.enabled === false) {
    return { level: "degraded", label: "Disabled", detail: "Text-to-speech is off in the saved alert settings." };
  }
  if (data.cloneReadiness === "not_selected") {
    return {
      level: "degraded",
      label: "No clone selected",
      detail: "Choose and enable the voice clone in Voice Settings before testing cloned speech. A fallback voice may still be available.",
    };
  }
  if (data.cloneReadiness === "needs_setup") {
    return {
      level: "degraded",
      label: "Selected clone not ready",
      detail: "The saved clone selection is missing consent or its VoiceStudio voice ID. Review that clone in Voice Settings.",
    };
  }
  if (data.cloneReadiness === "unknown") {
    return { level: "unknown", label: "Clone selection unknown", detail: "The saved voice-clone selection could not be checked." };
  }
  if (data.observation?.stage === "provider_audio") {
    return {
      level: "unknown",
      label: "Audio received, preparing playback",
      detail: "The provider returned audio; validation, storage, and playback URL setup are not complete yet.",
    };
  }
  if (data.observation?.result === "audio" && data.observation.stage === "audio_ready") {
    if (data.observation.voiceSource === "fallback") {
      return {
        level: "degraded",
        label: "Fallback audio ready",
        detail: "The configured fallback voice produced audio; the selected clone was not used for this result.",
      };
    }
    if (data.observation.voiceSource === "clone") {
      return {
        level: "healthy",
        label: "Clone audio ready",
        detail: "The selected cloned voice produced audio, and a playback URL was prepared. This does not confirm that OBS played it audibly.",
      };
    }
    return { level: "healthy", label: "Audio ready", detail: data.detail };
  }
  if (data.observation?.result === "failed") {
    const reason = data.observation.failureKind === "timeout"
      ? "The latest synthesis timed out."
      : data.observation.failureKind === "invalid_audio"
        ? "The provider returned audio in an unexpected format."
        : data.observation.failureKind === "storage"
          ? "The audio could not be stored or signed for playback."
          : data.observation.failureKind === "transport"
            ? "The provider connection failed without a confirmed response; fallback was not attempted to avoid overlapping work."
          : data.observation.providerStatus
            ? `The provider returned HTTP ${data.observation.providerStatus}.`
            : "The latest synthesis failed.";
    return { level: "degraded", label: "Last synthesis failed", detail: reason };
  }
  return {
    level: "unknown",
    label: data.observation ? "Synthesis in progress" : "No result yet",
    detail: data.observation ? "A synthesis request started; no result has been recorded yet." : data.detail,
  };
}

/** Interpret only the bridge fields the dashboard needs; never forward its raw error or QR value. */
export function telegramBridgeSnapshot(input: {
  reachable: boolean;
  status?: unknown;
  listening?: unknown;
  hasError?: boolean;
}): TelegramBridgeSnapshot {
  if (!input.reachable) {
    return {
      level: "unknown",
      label: "Unknown",
      detail: "The local bridge could not be checked from this browser. It may be offline or blocked.",
    };
  }

  if (input.hasError) {
    return {
      level: "degraded",
      label: "Needs attention",
      detail: "The bridge reports an error. Private bridge details are hidden.",
    };
  }

  // A live listener outranks the status string. The bridge reports `listening`
  // as a { chatId, botUsername } object (or null), never a boolean, so the
  // previous `input.listening === true` comparison could not match a real
  // payload. That mattered: a bridge reporting a transitional "starting" while
  // a handler was genuinely attached -- exactly what a no-op POST /configure
  // produced -- was graded "Not listening" on a perfectly healthy listener.
  if (input.status === "listening" || Boolean(input.listening)) {
    return {
      level: "healthy",
      label: "Listening",
      detail: "The local Telegram bridge reports an active listener.",
    };
  }

  if (input.status === "error") {
    return {
      level: "degraded",
      label: "Needs attention",
      detail: "The bridge is running but reports an error. Private details are hidden.",
    };
  }

  if (["booting", "starting", "groups", "qr", "password"].includes(String(input.status))) {
    return {
      level: "degraded",
      label: "Not listening",
      detail: "The bridge is reachable, but it does not report an active Telegram listener.",
    };
  }

  return {
    level: "unknown",
    label: "Unknown",
    detail: "The bridge returned a status this dashboard does not recognize.",
  };
}

export function eventStatusLabel(value: unknown): { label: string; level: HealthLevel } {
  switch (value) {
    case "successful":
    case "completed":
    case "test":
      return { label: value === "test" ? "Test alert" : "Completed", level: "healthy" };
    case "failed":
      return { label: "Failed", level: "degraded" };
    case "review_required":
      return { label: "Needs review", level: "degraded" };
    case "pending":
    case "processing":
      return { label: value === "pending" ? "Pending" : "Processing", level: "unknown" };
    default:
      return { label: "Unknown", level: "unknown" };
  }
}

