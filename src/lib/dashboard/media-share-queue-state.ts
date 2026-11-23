export type MediaShareQueueState = "loading" | "error" | "empty" | "ready";

export function mediaShareQueueState(
  loading: boolean,
  hasError: boolean,
  itemCount: number,
): MediaShareQueueState {
  if (hasError) return "error";
  if (loading && itemCount === 0) return "loading";
  if (itemCount === 0) return "empty";
  return "ready";
}
