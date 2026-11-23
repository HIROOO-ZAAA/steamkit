/**
 * Dashboard-only theme preference.
 *
 * The value is applied to <html data-dashboard-theme="..."> before first paint
 * and the stylesheet is scoped to .dashboard-shell, so public tip pages and OBS
 * overlays keep their existing presentation.
 */

export const DASHBOARD_THEME_KEY = "streamkit:dashboard-theme";
export const DASHBOARD_THEME_EVENT = "streamkit:dashboard-theme";

export type DashboardTheme = "dark" | "light";

export function resolveDashboardTheme(
  storedTheme: string | null,
  prefersLight: boolean,
): DashboardTheme {
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return prefersLight ? "light" : "dark";
}

export const DASHBOARD_THEME_BOOTSTRAP =
  `(function(){try{var stored=localStorage.getItem(${JSON.stringify(DASHBOARD_THEME_KEY)});` +
  `var theme=stored==="light"||stored==="dark"?stored:` +
  `(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");` +
  `document.documentElement.setAttribute("data-dashboard-theme",theme);` +
  `}catch(e){document.documentElement.setAttribute("data-dashboard-theme","dark");}})();`;
