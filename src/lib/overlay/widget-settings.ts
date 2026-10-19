export type WidgetSettingsRecord = Record<string, unknown>;

/** Resolve one saved widget by its public URL id; legacy URLs still use the root settings. */
export function selectWidgetSettings(
  root: WidgetSettingsRecord,
  widgetId?: string | null,
): WidgetSettingsRecord | null {
  if (!widgetId) return root;
  if (!Array.isArray(root.widgets)) return null;

  const saved = root.widgets.find((item) =>
    item !== null &&
    typeof item === "object" &&
    String((item as { id?: unknown }).id) === widgetId,
  ) as { settings?: unknown } | undefined;

  if (!saved || !saved.settings || typeof saved.settings !== "object" || Array.isArray(saved.settings)) {
    return null;
  }
  return saved.settings as WidgetSettingsRecord;
}
