export type WidgetSettingsState = "loading" | "error" | "empty" | "ready";

export function getWidgetSettingsState({
  loading,
  failed,
  widgetCount,
}: {
  loading: boolean;
  failed: boolean;
  widgetCount: number;
}): WidgetSettingsState {
  if (loading) return "loading";
  if (failed) return "error";
  return widgetCount > 0 ? "ready" : "empty";
}
