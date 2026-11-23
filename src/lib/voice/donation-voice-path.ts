const DONATION_VOICE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:webm|ogg|m4a|mp3|wav)$/i;

export function isDonationVoicePath(value: unknown): value is string {
  return typeof value === "string" && DONATION_VOICE_PATH.test(value);
}
