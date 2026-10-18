type VoiceSelection = {
  cloning_enabled?: unknown;
  active_clone_id?: unknown;
} | null | undefined;

/** Resolve only the creator's persisted selection; never guess another clone. */
export function selectedCloneId(settings: VoiceSelection): string | null {
  if (settings?.cloning_enabled !== true) return null;
  return typeof settings.active_clone_id === "string" && settings.active_clone_id.trim()
    ? settings.active_clone_id.trim()
    : null;
}
