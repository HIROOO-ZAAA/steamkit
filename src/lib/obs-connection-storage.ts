export const OBS_CONNECTION_STORAGE_KEY = "streamkit-obs-connection";

export function parseSavedObsConnection(raw: string | null): { host: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { host?: unknown };
    return { host: typeof parsed.host === "string" ? parsed.host : "" };
  } catch {
    return null;
  }
}

export function serializeObsConnection(host: string): string {
  return JSON.stringify({ host });
}
