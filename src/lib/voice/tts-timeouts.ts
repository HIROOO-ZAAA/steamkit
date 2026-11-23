/** Leave room for VoiceStudio's observed cold-start and generation time. */
export const ALERT_TTS_GENERATION_TIMEOUT_MS = 55_000;
export const ALERT_TTS_BROWSER_TIMEOUT_MS = 65_000;
export const ALERT_TTS_ROUTE_MAX_DURATION_SECONDS = 60;

export function remainingTtsGenerationBudget(deadlineMs: number, nowMs = Date.now()): number {
  return Math.max(0, deadlineMs - nowMs);
}

export function ttsGenerationFailureStatus(timedOut: boolean): 502 | 504 {
  return timedOut ? 504 : 502;
}
