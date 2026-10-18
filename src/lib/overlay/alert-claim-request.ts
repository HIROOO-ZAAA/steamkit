/** Build the token-authenticated request that atomically claims an alert. */
export function createOverlayAlertClaimRequest(
  overlayToken: string | null | undefined,
  tipId: string,
): RequestInit | null {
  if (!overlayToken || !tipId) return null;
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overlayToken, tipId }),
  };
}
