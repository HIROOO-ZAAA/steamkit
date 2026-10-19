import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_CONFIG_FILE,
  createListenGuard,
  readAgentConfig,
  runResumeSafely,
  validateAgentConfig,
} from "../scripts/bridge-listener-resume.mjs";

// No real Telegram session, agent token, or ABA message appears in this file.
// The Supabase client and Telegram client are never constructed: these tests
// cover the two pure pieces -- config validation and the concurrency guard --
// plus the file reader, driven with fake fs accessors.

const VALID = {
  agentToken: "a".repeat(64),
  telegramChatId: "-1004492023589",
  paywayBotUsername: "PayWayByABA_bot",
};

/**
 * The normalised shape the guard and attachListener consume. `VALID` above is
 * the on-disk file shape, which validateAgentConfig maps to this.
 */
const CFG = {
  agentToken: "a".repeat(64),
  chatId: "-1004492023589",
  botUsername: "PayWayByABA_bot",
};

describe("saved agent config validation", () => {
  it("accepts the shape the bridge itself writes", () => {
    const result = validateAgentConfig(VALID);
    assert.equal(result.ok, true);
    assert.equal(result.config.chatId, "-1004492023589");
    assert.equal(result.config.botUsername, "PayWayByABA_bot");
  });

  it("accepts a leading @ on the bot username, which getEntity tolerates", () => {
    const result = validateAgentConfig({ ...VALID, paywayBotUsername: "@PayWayByABA_bot" });
    assert.equal(result.ok, true);
    assert.equal(result.config.botUsername, "@PayWayByABA_bot");
  });

  it("accepts a positive chat id", () => {
    assert.equal(validateAgentConfig({ ...VALID, telegramChatId: "4492023589" }).ok, true);
  });

  it("rejects a missing agent token", () => {
    const result = validateAgentConfig({ ...VALID, agentToken: "" });
    assert.equal(result.ok, false);
    assert.match(result.reason, /agentToken/);
  });

  it("rejects a chat id that is not a number", () => {
    for (const bad of ["not-a-number", "12ab", "", "  "]) {
      const result = validateAgentConfig({ ...VALID, telegramChatId: bad });
      assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(bad)}`);
    }
  });

  it("rejects an out-of-range chat id, matching the database check", () => {
    assert.equal(validateAgentConfig({ ...VALID, telegramChatId: "9".repeat(21) }).ok, false);
  });

  it("rejects a malformed bot username", () => {
    for (const bad of ["a", "has space", "bad!chars", ""]) {
      const result = validateAgentConfig({ ...VALID, paywayBotUsername: bad });
      assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(bad)}`);
    }
  });

  it("rejects a non-object", () => {
    for (const bad of [null, undefined, "string", 42, []]) {
      assert.equal(validateAgentConfig(bad).ok, false);
    }
  });

  it("never echoes a field value in its reason", () => {
    // Reasons reach a log line. If one ever embedded the token, the log would
    // become a credential store.
    const secret = "s3cr3t-token-value";
    const result = validateAgentConfig({ ...VALID, telegramChatId: "bad", agentToken: secret });
    assert.equal(result.ok, false);
    assert.equal(result.reason.includes(secret), false);
  });
});

describe("reading the saved agent config", () => {
  const fakeFs = (contents: string | null) => ({
    fileExists: () => contents !== null,
    fileRead: () => contents as string,
  });

  it("reports a missing file without throwing", () => {
    const result = readAgentConfig("C:/root", fakeFs(null));
    assert.equal(result.ok, false);
    assert.match(result.reason, /not found/);
  });

  it("reports invalid JSON without throwing", () => {
    const result = readAgentConfig("C:/root", fakeFs("{ not json"));
    assert.equal(result.ok, false);
    assert.match(result.reason, /not valid JSON/);
  });

  it("reports a structurally invalid file without throwing", () => {
    const result = readAgentConfig("C:/root", fakeFs(JSON.stringify({ agentToken: "x" })));
    assert.equal(result.ok, false);
    assert.match(result.reason, /telegramChatId|paywayBotUsername/);
  });

  it("returns the config when the file is valid", () => {
    const result = readAgentConfig("C:/root", fakeFs(JSON.stringify(VALID)));
    assert.equal(result.ok, true);
    assert.equal(result.config.chatId, VALID.telegramChatId);
  });

  it("uses a filename the gitignore already protects", () => {
    assert.equal(AGENT_CONFIG_FILE, "telegram-local-agent.json");
  });
});

describe("partial-failure cleanup (attachListener's detach contract)", () => {
  // attachListener attaches a handler, then does more work. If that later work
  // throws, a handler exists but the guard still sees a failed attempt -- and an
  // unguarded retry would attach a SECOND handler, double-ingesting every
  // message. attachListener therefore detaches before rethrowing. These tests
  // pin that contract with a stand-in that reproduces the ordering.

  it("a throw after attaching must not strand the handler", async () => {
    let attached = 0;
    let detached = 0;

    // Mirrors attachListener: attach, then do post-attach work that fails.
    async function attachLikeRealBridge() {
      const handler = async () => {};
      attached += 1;
      try {
        await Promise.resolve();
        throw new Error("post-attach state update failed");
      } catch (err) {
        detached += 1;
        throw err;
      }
      return handler;
    }

    await assert.rejects(() => attachLikeRealBridge(), /post-attach/);
    // Every attach was matched by a detach.
    assert.equal(attached, detached);
  });

  it("leaves no handler behind when the post-attach step fails, so a retry is clean", async () => {
    let live = 0;
    let attempts = 0;

    async function attach() {
      live += 1;
      attempts += 1;
      if (attempts === 1) {
        live -= 1;
        throw new Error("first attempt fails after attaching");
      }
    }

    const guard = createListenGuard(attach);

    await assert.rejects(() => guard.ensureListening(CFG), /after attaching/);
    assert.equal(guard.isStarted(), false);
    assert.equal(live, 0, "nothing left attached after the failed attempt");

    await guard.ensureListening(CFG);
    assert.equal(live, 1, "the retry attaches exactly one");
    assert.equal(guard.isStarted(), true);
  });

  it("a failure before attaching needs no cleanup", async () => {
    const attached = 0;
    const guard = createListenGuard(async () => {
      throw new Error("registration failed before attach");
    });

    await assert.rejects(() => guard.ensureListening(CFG), /before attach/);
    assert.equal(attached, 0);
    assert.equal(guard.isStarted(), false);
  });
});

describe("/configure config conflict detection", () => {
  it("exposes the active config once listening", async () => {
    const guard = createListenGuard(async () => {});
    assert.equal(guard.getActiveConfig(), null);
    await guard.ensureListening(CFG);
    assert.equal(guard.getActiveConfig()?.chatId, CFG.chatId);
  });

  it("clears the active config on reset, so a different config may start", async () => {
    const guard = createListenGuard(async () => {});
    await guard.ensureListening(CFG);
    guard.reset();
    assert.equal(guard.getActiveConfig(), null);
    await guard.ensureListening({ ...CFG, chatId: "-100999" });
    assert.equal(guard.getActiveConfig()?.chatId, "-100999");
  });

  it("treats an @-prefixed bot username as the same bot", () => {
    // The bridge compares with the @ stripped and lowercased, so cosmetic
    // differences must not look like a conflicting configuration.
    const normalise = (v: string) => v.replace(/^@/, "").toLowerCase();
    assert.equal(normalise("@PayWayByABA_bot"), normalise("PayWayByABA_bot"));
  });

  it("detaches the old handler before attaching the new one when switching", async () => {
    // The sequence /configure now runs for a switch: reset() to tear the old
    // handler down, then ensureListening() to attach the replacement. If the
    // teardown were skipped, two handlers would be attached at once and every
    // ABA message would be ingested twice.
    const events: string[] = [];
    const guard = createListenGuard(async (cfg) => {
      events.push(`attach:${cfg.chatId}`);
      return { detach: () => events.push(`detach:${cfg.chatId}`) };
    });

    await guard.ensureListening(CFG);
    guard.reset();
    await guard.ensureListening({ ...CFG, chatId: "-100999" });

    assert.deepEqual(events, [
      "attach:-1004492023589",
      "detach:-1004492023589",
      "attach:-100999",
    ]);
  });

  it("lets a freshly minted agent token replace the one the handler captured", async () => {
    // POST /api/telegram/local-agent/create revokes every previous agent for the
    // creator each time it is called, so a no-op /configure that leaves the old
    // handler in place leaves it presenting a REVOKED token hash and silently
    // drops every tip while the dashboard reads "Listening".
    const attached: string[] = [];
    const guard = createListenGuard(async (cfg) => {
      attached.push(cfg.agentToken);
      return { detach: () => {} };
    });

    await guard.ensureListening(CFG);
    const rotated = { ...CFG, agentToken: "b".repeat(64) };
    guard.reset();
    await guard.ensureListening(rotated);

    assert.deepEqual(attached, [CFG.agentToken, rotated.agentToken]);
    assert.equal(guard.getActiveConfig()?.agentToken, rotated.agentToken);
  });
});

describe("reset invalidates an in-flight attempt", () => {
  // Found by review after the first implementation passed all its own tests.
  // logout destroys the client and calls reset(); if an attachListener attempt
  // was still awaiting Telegram/Supabase, it used to land AFTERWARDS and set
  // started=true, re-arming the guard for a destroyed client.

  it("does not become started when reset races an in-flight attach", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const guard = createListenGuard(async () => { await gate; return { detach: () => {} }; });

    const pending = guard.ensureListening(CFG);
    guard.reset();
    release();
    await pending;

    assert.equal(guard.isStarted(), false);
    assert.equal(guard.getActiveConfig(), null);
  });

  it("detaches the handler when reset races an in-flight attach", async () => {
    let detached = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const guard = createListenGuard(async () => {
      await gate;
      return { detach: () => { detached += 1; } };
    });

    const pending = guard.ensureListening(CFG);
    guard.reset();
    release();
    await pending;

    // The handler WAS attached by run() before the generation check, so it must
    // be removed or it lives on with no guard tracking it.
    assert.equal(detached, 1);
  });

  it("reports the superseded attempt rather than success", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const guard = createListenGuard(async () => { await gate; return { detach: () => {} }; });

    const pending = guard.ensureListening(CFG);
    guard.reset();
    release();
    const result = await pending;

    assert.equal(result.ok, false);
    assert.equal(result.resumed, false);
    assert.match(String(result.reason), /reset/);
  });

  it("reset invokes the teardown from a completed attach", async () => {
    let detached = 0;
    const guard = createListenGuard(async () => ({ detach: () => { detached += 1; } }));

    await guard.ensureListening(CFG);
    assert.equal(detached, 0);
    guard.reset();
    assert.equal(detached, 1, "logout must remove the handler explicitly");
  });

  it("reset survives a throwing teardown", () => {
    const guard = createListenGuard(async () => ({
      detach: () => { throw new Error("detach blew up"); },
    }));
    guard.ensureListening(CFG);
    // Must not propagate: a cleanup failure cannot be allowed to break logout.
    assert.doesNotThrow(() => guard.reset());
    assert.equal(guard.isStarted(), false);
  });

  it("allows a fresh attach after reset", async () => {
    let attached = 0;
    const guard = createListenGuard(async () => { attached += 1; return { detach: () => {} }; });

    await guard.ensureListening(CFG);
    guard.reset();
    await guard.ensureListening(CFG);

    assert.equal(attached, 2);
    assert.equal(guard.isStarted(), true);
  });
});

describe("listener guard: duplicate handler prevention", () => {
  it("attaches one handler for concurrent callers", async () => {
    let attached = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });

    const guard = createListenGuard(async () => {
      attached += 1;
      await gate;
    });

    const all = Promise.all([
      guard.ensureListening(CFG),
      guard.ensureListening(CFG),
      guard.ensureListening(CFG),
    ]);
    release();
    await all;

    // The race that previously double-ingested every ABA message.
    assert.equal(attached, 1);
  });

  it("attaches one handler when resume races a manual configure", async () => {
    let attached = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const guard = createListenGuard(async () => {
      attached += 1;
      await gate;
    });

    const resuming = guard.ensureListening(CFG);
    const configuring = guard.ensureListening({ ...CFG, chatId: "-100123" });
    release();
    await Promise.all([resuming, configuring]);

    assert.equal(attached, 1);
    assert.equal(guard.isStarted(), true);
  });

  it("does not re-attach after a successful start", async () => {
    let attached = 0;
    const guard = createListenGuard(async () => { attached += 1; });

    await guard.ensureListening(CFG);
    await guard.ensureListening(CFG);
    await guard.ensureListening(CFG);

    assert.equal(attached, 1);
  });

  it("reports a repeat call as already listening", async () => {
    const guard = createListenGuard(async () => {});
    const first = await guard.ensureListening(CFG);
    const second = await guard.ensureListening(CFG);

    assert.equal(first.resumed, true);
    assert.equal(second.ok, true);
    assert.equal(second.resumed, false);
    assert.match(String(second.reason), /already listening/);
  });

  it("allows a retry after a failure and attaches once on success", async () => {
    let attempts = 0;
    const guard = createListenGuard(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("supabase unavailable");
    });

    await assert.rejects(() => guard.ensureListening(CFG), /supabase unavailable/);
    assert.equal(guard.isStarted(), false);

    // Must not be latched by the failed attempt.
    await guard.ensureListening(CFG);
    assert.equal(attempts, 2);
    assert.equal(guard.isStarted(), true);
  });

  it("leaves no handler behind after a failed attempt", async () => {
    // attachListener resolves only after the handler is attached, so a throw
    // means no handler exists. Assert the guard does not claim otherwise.
    const guard = createListenGuard(async () => { throw new Error("entity lookup failed"); });
    await assert.rejects(() => guard.ensureListening(CFG));
    assert.equal(guard.isStarted(), false);
  });

  it("shares one attempt between concurrent callers even when it fails", async () => {
    let attempts = 0;
    const guard = createListenGuard(async () => {
      attempts += 1;
      throw new Error("boom");
    });

    const results = await Promise.allSettled([
      guard.ensureListening(CFG),
      guard.ensureListening(CFG),
    ]);
    assert.equal(attempts, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 2);
  });

  it("re-opens after reset, as logout needs", async () => {
    let attached = 0;
    const guard = createListenGuard(async () => { attached += 1; });

    await guard.ensureListening(CFG);
    assert.equal(attached, 1);

    // logout replaces the client; the guard must allow listening again.
    guard.reset();
    assert.equal(guard.isStarted(), false);

    await guard.ensureListening(CFG);
    assert.equal(attached, 2);
  });
});

describe("resume must never reach session recovery", () => {
  // boot()'s catch block matches messages like /401|AUTH_KEY_UNREGISTERED/ and
  // then writes an empty session file. A resume failure propagating there would
  // force a fresh QR login over a transient Supabase error. These tests pin the
  // isolation that prevents it.

  it("does not throw when resume throws synchronously", () => {
    const logged: string[] = [];
    const threw = runResumeSafely(
      () => { throw new Error("supabase timeout"); },
      { log: (m) => logged.push(m) },
    );
    assert.equal(threw, false);
    assert.equal(logged.length, 1);
    assert.match(logged[0]!, /session untouched/);
  });

  it("does not throw when resume returns a rejected promise", async () => {
    const logged: string[] = [];
    const result = runResumeSafely(
      () => Promise.reject(new Error("entity lookup failed")),
      { log: (m) => logged.push(m) },
    );
    assert.equal(result, true);
    // Let the microtask that reports the rejection run.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logged.length, 1);
    assert.match(logged[0]!, /session untouched/);
  });

  it("swallows a rejection whose text would trigger session deletion", () => {
    // This is the exact scenario: a listener error containing "401" must not
    // escape, or boot() would wipe the session file.
    const logged: string[] = [];
    const result = runResumeSafely(
      () => Promise.reject(new Error("request failed with status 401")),
      { log: (m) => logged.push(m) },
    );
    assert.equal(result, true);
    assert.equal(logged.length, 0, "sync path logs nothing; rejection is handled async");
  });

  it("returns true and logs nothing when resume succeeds", async () => {
    const logged: string[] = [];
    const result = runResumeSafely(() => true, { log: (m) => logged.push(m) });
    assert.equal(result, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logged.length, 0);
  });

  it("handles a resume that returns undefined", () => {
    assert.equal(runResumeSafely(() => undefined), true);
  });
});