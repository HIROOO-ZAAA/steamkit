import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BRIDGE_CLIENT_HEADER,
  BRIDGE_CLIENT_VALUE,
  authorizeBridgeRequest,
  bridgeCorsHeaders,
  isAllowedOrigin,
  parseAllowedOrigins,
  preflightDecision,
} from "../scripts/bridge-access-policy.mjs";

// These tests never touch a real Telegram session. They assert the policy that
// decides whether a caller may read /session, /logout, /configure or /state --
// the endpoints that previously answered with Access-Control-Allow-Origin: *
// and handed out the cleartext MTProto session to any web page.

const ALLOWED = "http://localhost:3000";
const EVIL = "https://attacker.example";

describe("bridge origin allowlist", () => {
  it("accepts the dashboard on loopback", () => {
    assert.equal(isAllowedOrigin("http://localhost:3000"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:3000"), true);
  });

  it("accepts any loopback port, because next dev moves when 3000 is taken", () => {
    assert.equal(isAllowedOrigin("http://localhost:4321"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:65535"), true);
  });

  it("refuses every non-loopback origin", () => {
    assert.equal(isAllowedOrigin(EVIL), false);
    assert.equal(isAllowedOrigin("http://192.168.1.50:3000"), false);
    assert.equal(isAllowedOrigin("http://localhost.attacker.example"), false);
    // DNS rebinding: the page loads from an attacker hostname that resolves to
    // 127.0.0.1, so the origin it presents is the attacker hostname.
    assert.equal(isAllowedOrigin("http://attacker.example:3113"), false);
  });

  it("refuses a missing origin rather than treating it as trusted", () => {
    // curl and other non-browser clients send no Origin. Defaulting to allow
    // would reintroduce the hole for anything scriptable.
    assert.equal(isAllowedOrigin(undefined), false);
    assert.equal(isAllowedOrigin(""), false);
    assert.equal(isAllowedOrigin(null), false);
  });

  it("treats a spoofed loopback-looking host as untrusted", () => {
    assert.equal(isAllowedOrigin("http://evil-localhost"), false);
    assert.equal(isAllowedOrigin("https://127.0.0.1.attacker.com"), false);
  });

  it("adds explicitly configured origins without widening to a wildcard", () => {
    const extra = parseAllowedOrigins("https://streamkit.example , https://ops.example/ ");
    assert.deepEqual(extra, ["https://streamkit.example", "https://ops.example"]);
    assert.equal(isAllowedOrigin("https://streamkit.example", extra), true);
    assert.equal(isAllowedOrigin("https://ops.example", extra), true);
    assert.equal(isAllowedOrigin("https://other.example", extra), false);
  });
});

describe("bridge CORS headers", () => {
  it("never emits a wildcard, which was the root of the exposure", () => {
    const headers = bridgeCorsHeaders(ALLOWED);
    assert.notEqual(headers?.["Access-Control-Allow-Origin"], "*");
    assert.equal(headers?.["Access-Control-Allow-Origin"], ALLOWED);
  });

  it("echoes back the exact allowed origin", () => {
    assert.equal(
      bridgeCorsHeaders("http://127.0.0.1:3000")?.["Access-Control-Allow-Origin"],
      "http://127.0.0.1:3000",
    );
  });

  it("emits no CORS headers at all for a foreign origin", () => {
    // No headers means the browser refuses to hand the body to page script,
    // which is what actually stops the exfiltration.
    assert.equal(bridgeCorsHeaders(EVIL), null);
    assert.equal(bridgeCorsHeaders(undefined), null);
  });

  it("varies on Origin so a cache cannot serve one origin's headers to another", () => {
    assert.match(String(bridgeCorsHeaders(ALLOWED)?.Vary), /Origin/i);
  });
});

describe("bridge request authorization", () => {
  it("refuses the session endpoint to a request from a web page", () => {
    const decision = authorizeBridgeRequest({
      origin: EVIL,
      clientHeader: BRIDGE_CLIENT_VALUE,
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.status, 403);
    // The correct header value does not help: it is public, in the dashboard
    // bundle. Origin is the control that matters.
    assert.match(decision.reason, /origin/i);
  });

  it("refuses a request with no origin even when the header is correct", () => {
    const decision = authorizeBridgeRequest({
      origin: undefined,
      clientHeader: BRIDGE_CLIENT_VALUE,
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.status, 403);
  });

  it("refuses the dashboard's own origin when the required header is absent", () => {
    // A plain <img> or form post from loopback is not blocked by CORS on the
    // way in, so the header is required too.
    const decision = authorizeBridgeRequest({ origin: ALLOWED, clientHeader: undefined });
    assert.equal(decision.ok, false);
    assert.equal(decision.status, 403);
    assert.match(decision.reason, /header/i);
  });

  it("refuses a wrong header value", () => {
    const decision = authorizeBridgeRequest({ origin: ALLOWED, clientHeader: "guessed" });
    assert.equal(decision.ok, false);
  });

  it("admits the dashboard on loopback with the required header", () => {
    const decision = authorizeBridgeRequest({
      origin: ALLOWED,
      clientHeader: BRIDGE_CLIENT_VALUE,
    });
    assert.equal(decision.ok, true);
    assert.equal(decision.status, 200);
    assert.equal(decision.headers?.["Access-Control-Allow-Origin"], ALLOWED);
  });

  it("admits a loopback dashboard on a different dev port", () => {
    const decision = authorizeBridgeRequest({
      origin: "http://127.0.0.1:4321",
      clientHeader: BRIDGE_CLIENT_VALUE,
    });
    assert.equal(decision.ok, true);
  });

  it("keeps working for an extra configured origin", () => {
    const extra = parseAllowedOrigins("https://streamkit.example");
    const decision = authorizeBridgeRequest(
      { origin: "https://streamkit.example", clientHeader: BRIDGE_CLIENT_VALUE },
      extra,
    );
    assert.equal(decision.ok, true);
  });
});

describe("bridge preflight", () => {
  it("fails the preflight for a foreign origin, so the real request is never sent", () => {
    const decision = preflightDecision(EVIL);
    assert.equal(decision.status, 403);
    // No Access-Control-Allow-Origin means the browser cancels the request.
    assert.equal(decision.headers["Access-Control-Allow-Origin"], undefined);
  });

  it("allows the preflight for loopback and advertises the required header", () => {
    const decision = preflightDecision(ALLOWED);
    assert.equal(decision.status, 204);
    assert.equal(decision.headers["Access-Control-Allow-Origin"], ALLOWED);
    assert.match(decision.headers["Access-Control-Allow-Headers"], /x-kit-client/i);
    assert.match(decision.headers["Access-Control-Allow-Headers"], /content-type/i);
  });

  it("fails the preflight when no origin is sent", () => {
    assert.equal(preflightDecision(undefined).status, 403);
  });
});

describe("bridge client header contract", () => {
  it("is a non-simple header name, which is what forces the preflight", () => {
    // If this ever became a CORS-safelisted header the preflight would be
    // skipped and the origin check would stop being consulted.
    assert.equal(BRIDGE_CLIENT_HEADER, "x-kit-client");
    const safelisted = /^(accept|accept-language|content-language|content-type)$/;
    assert.equal(safelisted.test(BRIDGE_CLIENT_HEADER), false);
  });

  it("has a non-empty client value", () => {
    assert.ok(BRIDGE_CLIENT_VALUE.length > 0);
  });
});