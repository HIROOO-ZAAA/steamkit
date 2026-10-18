/** Build the authenticated browser request used by the overlay TTS endpoint. */
export function createOverlaySynthesisRequest(
  overlayToken: string | null | undefined,
  text: string,
  donationId?: string,
  requireClone = false,
): RequestInit | null {
  if (!overlayToken) return null;

  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overlayToken, text, donationId, requireClone }),
  };
}
