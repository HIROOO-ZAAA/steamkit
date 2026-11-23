/**
 * Sidebar collapse state shared between the dashboard nav (a Client Component)
 * and the root layout (a Server Component).
 *
 * It lives here rather than being exported from DashboardNav.tsx because a
 * Server Component cannot pull values out of a "use client" module. The two
 * halves MUST agree: the bootstrap below writes `--sidebar-w` before first
 * paint, and dashboard/layout.module.css reads it with a 288px fallback. If the
 * two ever disagree the dashboard content jumps sideways on load.
 */

/** localStorage key holding "1" when the sidebar is collapsed. */
export const SIDEBAR_COLLAPSE_KEY = "streamkit:sidebar-collapsed";

/** Sidebar width when expanded, matching the fallback in layout.module.css. */
export const SIDEBAR_W = "288px";

/** Sidebar width when collapsed. */
export const SIDEBAR_W_COLLAPSED = "88px";

/**
 * Runs before first paint to widen the sidebar's content margin for users who
 * collapsed it previously, so the dashboard does not visibly shift on load.
 *
 * This was rendered as a literal <script> element from inside DashboardNav's JSX.
 * React 19 logs "Scripts inside React components are never executed when
 * rendering on the client" for that, and it is true: it only ran on the initial
 * server-rendered document. `next/script` with beforeInteractive is the
 * supported mechanism and is injected by Next itself, so it is emitted for the
 * document rather than trusted to React.
 */
export const SIDEBAR_COLLAPSE_BOOTSTRAP =
  `(function(){try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_COLLAPSE_KEY)})==="1")` +
  `{document.documentElement.style.setProperty("--sidebar-w","${SIDEBAR_W_COLLAPSED}")}` +
  `}catch(e){}})();`;