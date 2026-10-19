/**
 * Access policy for the Kit Client bridge's local HTTP control surface.
 *
 * WHY THIS EXISTS
 *
 * The bridge listens on 127.0.0.1 and served every response with
 * `Access-Control-Allow-Origin: *`. That combination is not a private API: any
 * web page the creator opened could `fetch()` the bridge from JavaScript and
 * read the response, because the wildcard is exactly what CORS requires to let
 * a foreign origin read it. It exposed:
 *
 *   GET  /session   the cleartext Telegram MTProto session (account takeover)
 *   POST /logout    destructive: logs out AND deletes the session file
 *   POST /configure rewrites the ABA ingest target and restarts listening
 *   GET  /state     the live QR login token
 *
 * The session is not decorative: the dashboard writes it to
 * `telegram_groups.session_data`, so the endpoint cannot simply be deleted
 * without breaking that flow. It gets locked down instead.
 *
 * WHAT THIS ACTUALLY DEFENDS AGAINST
 *
 * A malicious *web page*. `Origin` is set by the browser and cannot be forged
 * by page script, so a page served from https://evil.com necessarily presents
 * that origin and is rejected. Requiring a non-simple request header forces a
 * CORS preflight, and because the preflight is answered from the same
 * allowlist, the browser never sends the real request at all -- the attack fails
 * before any secret is read. DNS rebinding is covered too: a rebound page
 * presents its attacker hostname, which is not localhost.
 *
 * WHAT IT DOES NOT DEFEND AGAINST
 *
 * Another program already running on the machine, or anything with local code
 * execution. Those can send any Origin and any header. Binding to loopback is
 * what limits those to the local machine; this policy limits drive-by web pages.
 * It is not a substitute for treating the session as a credential.
 */

export const BRIDGE_CLIENT_HEADER = "x-kit-client";
export const BRIDGE_CLIENT_VALUE = "streamkit-dashboard";

/**
 * Origins allowed to drive the bridge.
 *
 * `next dev` picks a free port when 3000 is taken, so any port on loopback is
 * accepted. That is deliberate: the threat model is a page on the public
 * internet, and a browser cannot present `http://localhost` unless the page
 * genuinely came from loopback.
 */
const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

/** Parses a comma-separated origin list, dropping blanks and trailing slashes. */
export function parseAllowedOrigins(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** True when `origin` is a loopback origin or an explicitly configured one. */
export function isAllowedOrigin(origin, extraOrigins = []) {
  if (!origin) return false;
  const candidate = String(origin).trim().replace(/\/+$/, "");
  if (LOOPBACK_ORIGIN.test(candidate)) return true;
  return extraOrigins.some((allowed) => allowed === candidate);
}

/**
 * CORS headers for a response, or null when the origin is not allowed.
 *
 * Never returns `*`. Echoing a specific origin is the only correct value: a
 * wildcard both permits foreign origins and blocks credentialed requests.
 */
/** @returns {Record<string, string> | null} */
export function bridgeCorsHeaders(origin, extraOrigins = []) {
  if (!isAllowedOrigin(origin, extraOrigins)) return null;
  return {
    "Access-Control-Allow-Origin": String(origin).trim().replace(/\/+$/, ""),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": `Content-Type, ${BRIDGE_CLIENT_HEADER}`,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/**
 * Answers a CORS preflight.
 *
 * Returns the status to send and the headers to send with it. A disallowed
 * origin gets 403 with no CORS headers, which is what makes the browser refuse
 * the follow-up request.
 */
/** @returns {{ status: number, headers: Record<string, string>, reason: string }} */
export function preflightDecision(origin, extraOrigins = []) {
  const headers = bridgeCorsHeaders(origin, extraOrigins);
  if (!headers) {
    return { status: 403, headers: {}, reason: "origin not allowed" };
  }
  return { status: 204, headers, reason: "allowed" };
}

/**
 * Gates an actual bridge request.
 *
 * Both checks are required. The header alone is not a secret -- it ships in the
 * dashboard's JavaScript -- but a cross-origin request carrying it cannot be
 * sent without a successful preflight, so origin checking is what actually
 * decides.
 */
/** @returns {{ ok: boolean, status: number, reason: string, headers: Record<string, string> }} */
export function authorizeBridgeRequest({ origin, clientHeader } = {}, extraOrigins = []) {
  if (!isAllowedOrigin(origin, extraOrigins)) {
    return {
      ok: false,
      status: 403,
      reason: "origin not allowed",
      headers: {},
    };
  }
  if (String(clientHeader ?? "") !== BRIDGE_CLIENT_VALUE) {
    return {
      ok: false,
      status: 403,
      reason: "missing or wrong client header",
      headers: bridgeCorsHeaders(origin, extraOrigins),
    };
  }
  return {
    ok: true,
    status: 200,
    reason: "allowed",
    headers: bridgeCorsHeaders(origin, extraOrigins),
  };
}