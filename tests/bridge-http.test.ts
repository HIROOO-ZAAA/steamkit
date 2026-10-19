import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";

import {
  BRIDGE_CLIENT_HEADER,
  BRIDGE_CLIENT_VALUE,
  authorizeBridgeRequest,
  preflightDecision,
} from "../scripts/bridge-access-policy.mjs";

/**
 * End-to-end proof against a real socket, not just the pure policy functions.
 *
 * This mirrors the bridge's own request handling: the same authorization calls,
 * wired into a server that exposes a fake `/session`. The secret returned below
 * is a literal invented for this test -- no real Telegram session is read,
 * written, printed, or rotated anywhere in this file.
 */
const FAKE_SESSION = "test-only-not-a-real-session";

let server: Server;
let base = "";

function fakeBridgeHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    const decision = preflightDecision(req.headers.origin);
    res.writeHead(decision.status, decision.headers);
    return res.end();
  }
  const auth = authorizeBridgeRequest({
    origin: req.headers.origin,
    clientHeader: req.headers[BRIDGE_CLIENT_HEADER],
  });
  if (!auth.ok) {
    res.writeHead(auth.status, { "Content-Type": "application/json", ...(auth.headers ?? {}) });
    return res.end(JSON.stringify({ error: `Forbidden: ${auth.reason}` }));
  }
  res.writeHead(200, { "Content-Type": "application/json", ...auth.headers });
  return res.end(JSON.stringify({ session: FAKE_SESSION }));
}

before(async () => {
  server = createServer(fakeBridgeHandler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("bridge /session over HTTP", () => {
  it("does not return the session to a foreign web origin", async () => {
    const res = await fetch(`${base}/session`, {
      headers: { Origin: "https://attacker.example", [BRIDGE_CLIENT_HEADER]: BRIDGE_CLIENT_VALUE },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    // The refusal must not carry the session in any form.
    assert.equal(body.session, undefined);
    // And without this header the browser cannot even read the refusal.
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("does not return the session to a request with no origin", async () => {
    const res = await fetch(`${base}/session`, { headers: { [BRIDGE_CLIENT_HEADER]: BRIDGE_CLIENT_VALUE } });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.session, undefined);
  });

  it("does not return the session without the client header, even from loopback", async () => {
    const res = await fetch(`${base}/session`, { headers: { Origin: "http://localhost:3000" } });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.session, undefined);
  });

  it("never advertises a wildcard origin on any response", async () => {
    for (const origin of ["https://attacker.example", "http://localhost:3000"]) {
      const res = await fetch(`${base}/session`, {
        headers: { Origin: origin, [BRIDGE_CLIENT_HEADER]: BRIDGE_CLIENT_VALUE },
      });
      const allow = res.headers.get("access-control-allow-origin");
      assert.notEqual(allow, "*");
    }
  });

  it("returns the session to the loopback dashboard with the required header", async () => {
    const res = await fetch(`${base}/session`, {
      headers: { Origin: "http://localhost:3000", [BRIDGE_CLIENT_HEADER]: BRIDGE_CLIENT_VALUE },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
    const body = await res.json();
    // Confirms the legitimate path still works -- the fix must not simply
    // close the door on the dashboard.
    assert.equal(body.session, FAKE_SESSION);
  });

  it("still allows a preflight from loopback so the dashboard keeps working", async () => {
    const res = await fetch(`${base}/session`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": BRIDGE_CLIENT_HEADER,
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
  });

  it("blocks the preflight from a foreign origin", async () => {
    const res = await fetch(`${base}/session`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://attacker.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": BRIDGE_CLIENT_HEADER,
      },
    });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });
});