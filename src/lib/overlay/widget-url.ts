/** Adds a per-widget selector without altering the existing overlay token or path. */
export function widgetOverlayUrl(baseUrl: string, widgetId: string | number): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.pathname !== "/overlay/widget" || !url.searchParams.has("token")) return null;
    url.searchParams.set("widget", String(widgetId));
    return url.toString();
  } catch {
    return null;
  }
}
