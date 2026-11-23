export type LeaderboardHistoryState = "loading" | "error" | "empty" | "ready";
export type LeaderboardPeriodFilter = "all" | "30d" | "7d";

export function getLeaderboardSince(
  period: LeaderboardPeriodFilter,
  now = Date.now(),
): string | null {
  if (period === "all") return null;
  const days = period === "30d" ? 30 : 7;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

export function getLeaderboardHistoryState({
  loading,
  failed,
  entryCount,
}: {
  loading: boolean;
  failed: boolean;
  entryCount: number;
}): LeaderboardHistoryState {
  if (loading) return "loading";
  if (failed) return "error";
  return entryCount > 0 ? "ready" : "empty";
}
