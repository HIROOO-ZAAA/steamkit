export type PublicSupportersState = "unavailable" | "empty" | "ready";

export function getPublicSupportersState(
  hasError: boolean,
  supporterCount: number,
): PublicSupportersState {
  if (hasError) return "unavailable";
  return supporterCount > 0 ? "ready" : "empty";
}
