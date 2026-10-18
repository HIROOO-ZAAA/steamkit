/**
 * Coalesces simultaneous duplicate deliveries in this process. The database
 * conditional update remains the authoritative cross-instance claim.
 */
const claimsInFlight = new Set<string>();

export async function claimAlertOnce(
  tipId: string,
  claimInDatabase: () => Promise<boolean>,
): Promise<boolean> {
  if (claimsInFlight.has(tipId)) return false;
  claimsInFlight.add(tipId);
  try {
    return await claimInDatabase();
  } finally {
    claimsInFlight.delete(tipId);
  }
}
