export type HealthLevel = "healthy" | "degraded" | "offline" | "unknown";

export type TelegramBridgeSnapshot = {
  level: HealthLevel;
  label: string;
  detail: string;
};

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

