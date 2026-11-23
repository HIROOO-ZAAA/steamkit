export type TtsObservation = {
  at: string;
  stage: "started" | "provider_audio" | "failed" | "audio_ready";
  result: "started" | "audio" | "failed";
  voiceSource?: "clone" | "fallback";
  providerStatus?: number;
  failureKind?: "timeout" | "provider" | "transport" | "invalid_audio" | "storage";
};

type TtsHealthGlobal = typeof globalThis & {
  __streamkitTtsObservations?: Map<string, TtsObservation>;
};

function observations(): Map<string, TtsObservation> {
  const root = globalThis as TtsHealthGlobal;
  return (root.__streamkitTtsObservations ??= new Map());
}

/** Bounded process-local status keyed per creator; returned observations contain no text, IDs, URLs, or credentials. */
export function recordTtsObservation(
  creatorId: string,
  observation: Omit<TtsObservation, "at">,
  now = new Date(),
): void {
  const entries = observations();
  entries.delete(creatorId);
  entries.set(creatorId, {
    ...observation,
    at: now.toISOString(),
  });
  if (entries.size > 100) {
    const oldest = entries.keys().next().value;
    if (oldest) entries.delete(oldest);
  }
}

export function getTtsObservation(creatorId: string): TtsObservation | null {
  const observation = observations().get(creatorId);
  return observation ? { ...observation } : null;
}
