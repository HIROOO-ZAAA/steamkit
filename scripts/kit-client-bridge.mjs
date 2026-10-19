#!/usr/bin/env node
import { createServer } from "node:http";
import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { NewMessage } from "teleproto/events";
import { createClient } from "@supabase/supabase-js";
import { parseAbaMessage } from "./aba-message-parser.mjs";
import {
  AGENT_CONFIG_FILE,
  createListenGuard,
  readAgentConfig,
  runResumeSafely,
} from "./bridge-listener-resume.mjs";
import {
  BRIDGE_CLIENT_HEADER,
  BRIDGE_CLIENT_VALUE,
  authorizeBridgeRequest,
  parseAllowedOrigins,
  preflightDecision,
} from "./bridge-access-policy.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.KIT_CLIENT_PORT ?? 3113);

/**
 * Extra origins on top of the built-in loopback allowlist. Set
 * KIT_CLIENT_ALLOWED_ORIGINS to a comma-separated list if the dashboard is ever
 * served from somewhere other than localhost.
 */
const EXTRA_ORIGINS = parseAllowedOrigins(process.env.KIT_CLIENT_ALLOWED_ORIGINS);

function loadEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(path.join(root, ".env.local")), ...process.env };
const apiId = Number(env.TELEGRAM_API_ID);
const apiHash = env.TELEGRAM_API_HASH;
if (!apiId || !apiHash) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env.local");
  process.exit(1);
}
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, anonKey);

const sessionFile = path.join(root, "telegram-local-session.enc");
const key = scryptSync(apiHash, "streamkit-local-session", 32);
function loadSession() {
  if (!existsSync(sessionFile)) return "";
  try {
    const blob = JSON.parse(readFileSync(sessionFile, "utf8"));
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
    d.setAuthTag(Buffer.from(blob.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(blob.data, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
function saveSession(value) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  writeFileSync(sessionFile, JSON.stringify({
    iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64"),
  }), { mode: 0o600 });
}

const state = {
  status: "booting",
  qr: null,
  groups: [],
  error: null,
  needs2fa: false,
  listening: null,
};

/**
 * Retry policy for boot() after a transport failure.
 *
 * Telegram drops long-lived sockets routinely -- a laptop that sleeps, a NAT
 * that re-times-out, a network switch that flaps -- and none of that says
 * anything about the account. The client library's own `connectionRetries: 5`
 * covers a blip within one connect; this covers the case where the whole boot
 * fails and the process is left unable to serve a QR at all.
 */
const BOOT_MAX_ATTEMPTS = 8;
const BOOT_RETRY_BASE_MS = 2_000;
const BOOT_RETRY_MAX_MS = 60_000;
let bootAttempts = 0;

/** True for failures that say "the network moved", not "you are not allowed". */
function isTransientNetworkError(message) {
  return /ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|EAI_AGAIN|timeout|timed out|NetworkError|Failed to reconnect|reconnect/i.test(
    message,
  );
}

let resolve2fa = null;
let session = new StringSession(loadSession());
let client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

async function boot() {
  try {
    await client.start({
      phoneNumber: async () => {
        const err = new Error("Use QR login");
        err.errorMessage = "RESTART_AUTH_WITH_QR";
        throw err;
      },
      password: async (hint) => {
        state.needs2fa = true;
        state.status = "password";
        return await new Promise((resolve) => { resolve2fa = resolve; });
      },
      qrCode: async ({ token }) => {
        state.status = "qr";
        state.qr = `tg://login?token=${Buffer.from(token).toString("base64url")}`;
      },
      onError: (err) => { state.error = err.message; },
    });
    // Connected. Clear the backoff so a later outage starts from the shortest
    // delay again rather than inheriting the previous run's attempt count.
    bootAttempts = 0;
    saveSession(client.session.save());
    const dialogs = await client.getDialogs({});
    state.groups = await Promise.all(
      dialogs
        .filter((d) => d.isGroup)
        .map(async (d) => {
          let avatar = null;
          try {
            const buf = await client.downloadProfilePhoto(d.entity, { isBig: false });
            if (buf && buf.length > 0) avatar = `data:image/jpeg;base64,${buf.toString("base64")}`;
          } catch {}
          return {
            id: String(d.id),
            title: d.title || d.name || "Untitled",
            avatar,
            isPublic: Boolean(d.entity?.username),
          };
        }),
    );
    state.status = "groups";
    state.qr = null;
    state.needs2fa = false;
    console.log(`Signed in. ${state.groups.length} groups available.`);

    // Resume ABA listening from the saved config. runResumeSafely guarantees no
    // error from here can reach the catch below, which treats certain messages
    // as a revoked session and rewrites the session file. A Supabase outage
    // during resume must never destroy a working Telegram login.
    runResumeSafely(resumeListeningFromConfig, { log: (m) => console.error(`[resume] ${m}`) });
  } catch (err) {
    const msg = String(err?.message ?? err ?? "");
    // A QR token only means anything while the socket to Telegram is alive.
    // Once the connection is gone the phone can scan it and nothing will ever
    // happen, because the bridge cannot reach Telegram to validate it. Serving
    // a dead QR is worse than showing none: it looks like the app is broken
    // rather than the network being down.
    state.qr = null;

    if (/AuthKeyUnregistered|AUTH_KEY_UNREGISTERED|SESSION_REVOKED|401/i.test(msg) && loadSession()) {
      console.error("Stored session rejected by Telegram, resetting and showing QR login:", msg);
      try { client.disconnect(); } catch {}
      try { if (existsSync(sessionFile)) writeFileSync(sessionFile, ""); } catch {}
      session = new StringSession("");
      client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
      state.error = null;
      bootAttempts = 0;
      return boot();
    }

    // A dropped socket is not a dead account. Previously the bridge gave up on
    // the first failure and sat in "error" forever, so a network blip meant the
    // creator had to find and restart the process by hand to get a fresh QR.
    // Retry with backoff instead; a fresh attempt mints a fresh, valid token.
    if (isTransientNetworkError(msg) && bootAttempts < BOOT_MAX_ATTEMPTS) {
      const delay = Math.min(BOOT_RETRY_BASE_MS * 2 ** bootAttempts, BOOT_RETRY_MAX_MS);
      bootAttempts += 1;
      state.status = "error";
      state.error = `${msg} Retrying in ${Math.round(delay / 1000)}s.`;
      console.error(
        `Auth failed (network, retry ${bootAttempts}/${BOOT_MAX_ATTEMPTS} in ${delay}ms): ${msg}`,
      );
      setTimeout(() => { void boot(); }, delay).unref?.();
      return;
    }

    state.status = "error";
    state.error = msg;
    console.error("Auth failed:", msg);
  }
}

/**
 * Attaches the ABA message handler and registers the sender.
 *
 * Reached only through the guard below, so it runs at most once per client.
 * Body is unchanged from the original implementation: same sender filtering,
 * same parse, same ingest RPC.
 */
async function attachListener({ agentToken, chatId, botUsername }) {
  const tokenHash = createHash("sha256").update(agentToken).digest("hex");
  const rawChatId = String(chatId);
  const chatIdNum = BigInt(rawChatId.startsWith("-") ? rawChatId : `-100${rawChatId}`);
  const botEntity = await client.getEntity(botUsername);
  const chatEntity = await client.getEntity(chatId);
  const senderId = String(botEntity.id);
  const chatTitle = chatEntity.title ?? null;

  // Register before attaching, and fail closed on a rejected registration: the
  // ingest RPC gates on expected_sender_user_id, so a handler that runs against
  // an unregistered token would silently drop every donation.
  const { error: registerError } = await supabase.rpc("streamkit_register_local_telegram_sender", {
    p_token_hash: tokenHash,
    p_sender_user_id: senderId,
  });
  if (registerError) {
    throw new Error(`Sender registration failed: ${registerError.message}`);
  }

  // Everything above can throw without leaving a handler behind. From here on,
  // a throw would strand an attached handler while the guard still considers the
  // attempt failed -- and the retry would attach a SECOND handler, double
  // ingesting every ABA message. So the handler is tracked and removed on any
  // failure past this point.
  let attachedHandler = null;
  const detach = () => {
    if (!attachedHandler) return;
    try {
      client.removeEventHandler(attachedHandler);
    } catch (err) {
      console.error(`[resume] failed to detach handler during cleanup: ${err?.message ?? err}`);
    }
    attachedHandler = null;
  };

  try {
    attachedHandler = async (event) => {
      try {
        const message = event.message;
        if (!message?.message) return;
        const sender = await message.getSender();
        console.log(`[telegram] message received chars=${message.message.length}`);
        if (String(sender?.id) !== senderId) return;
        const parsed = parseAbaMessage(message.message);
        const { data, error } = await supabase.rpc("streamkit_record_parsed_aba_tip", {
          p_token_hash: tokenHash,
          p_telegram_chat_id: String(chatId),
          p_telegram_chat_title: chatTitle,
          p_telegram_message_id: message.id,
          p_sender_user_id: senderId,
          p_sender_username: botUsername.replace(/^@/, ""),
          p_message_text: message.message,
          p_telegram_sent_at: message.date ? new Date(message.date * 1000).toISOString() : null,
          p_tipper_name: parsed?.donor ?? "Anonymous",
          p_amount: parsed?.amount ?? 0,
          p_currency: parsed?.currency ?? "USD",
          p_tip_message: parsed?.message ?? "",
        });
        if (error) console.error("[ingest] error:", error.message);
        else if (data) {
          if (!data.accepted) console.log(`[ingest] skipped (${data.reason ?? "n/a"}) ${message.id}`);
          else if (data.duplicate) console.log(`[ingest] duplicate skipped ${message.id}`);
          else if (parsed)
            console.log(`[ingest] tip recorded message_present=${Boolean(parsed.message)} message_chars=${parsed.message?.length ?? 0}`);
          else console.log(`[ingest] logged, no tip (no amount parsed) ${message.id}`);
        }
      } catch (err) {
        console.error("Handler error:", err.message);
      }
    };

    client.addEventHandler(
      attachedHandler,
      new NewMessage({ incoming: true, chats: [chatIdNum], fromUsers: [botEntity] }),
    );
  } catch (err) {
    // addEventHandler threw, so nothing was registered. Clear the tracker so
    // detach() cannot try to remove a handler this client never had.
    attachedHandler = null;
    throw err;
  }

  try {
    state.status = "listening";
    state.listening = { chatId, botUsername };
  } catch (err) {
    // Attached, but this attempt is failing. Leaving the handler in place would
    // let a retry attach a second one and double-ingest every message.
    detach();
    throw err;
  }

  console.log(`Listening for @${botUsername} in ${chatId}`);
  // Returned so the caller can detach explicitly, e.g. on logout.
  return { detach };
}

/**
 * The single entry point for starting ABA listening.
 *
 * Concurrency-safe: concurrent callers share one attempt, and a repeat call
 * after success does not attach a second handler. A failed attempt leaves the
 * guard open so a retry is allowed.
 */
const listenGuard = createListenGuard(attachListener);

/**
 * Resumes ABA listening from the saved agent config, if one is usable.
 *
 * NEVER throws and NEVER deletes the session file. That separation is the
 * whole point: this is called from inside boot(), whose catch block resets a
 * rejected Telegram session. A Supabase outage here must not be mistaken for a
 * revoked auth key and destroy a working login.
 *
 * Returns true when listening is active afterwards.
 */
function resumeListeningFromConfig() {
  const read = readAgentConfig(root);
  if (!read.ok) {
    // Reason is a fixed string or a field NAME -- never a field value.
    console.log(`[resume] ABA listener not resumed: ${read.reason}`);
    return false;
  }
  const { agentToken, chatId, botUsername } = read.config;
  listenGuard
    .ensureListening({ agentToken, chatId, botUsername })
    .then((result) => {
      if (result.resumed) console.log(`[resume] ABA listener resumed for chat ${chatId}`);
    })
    .catch((err) => {
      // Deliberately swallowed. The session is already saved and valid; a
      // failure here is a Supabase/entity lookup problem, never an auth one.
      console.error(`[resume] ABA listener failed to start (session untouched): ${err?.message ?? err}`);
    });
  return true;
}

/**
 * Writes a JSON response.
 *
 * CORS headers are now passed in per-request instead of hardcoded to `*`.
 * Passing null means the caller was refused: the body still goes out (so a
 * curl user sees why), but with no CORS headers, which is what makes a browser
 * on a foreign origin unable to read the response at all.
 */
function json(res, code, body, cors = null) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...(cors ?? {}),
  });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    const decision = preflightDecision(req.headers.origin, EXTRA_ORIGINS);
    // 204 carries no body; a refusal needs one so the reason is diagnosable.
    if (decision.status === 204) {
      res.writeHead(204, decision.headers);
      return res.end();
    }
    return json(res, decision.status, { error: decision.reason }, decision.headers);
  }

  // Every route below is gated, including /state: it leaks the live QR login
  // token, which is enough for a third party to complete the Telegram login.
  const auth = authorizeBridgeRequest(
    { origin: req.headers.origin, clientHeader: req.headers[BRIDGE_CLIENT_HEADER] },
    EXTRA_ORIGINS,
  );
  if (!auth.ok) {
    return json(res, auth.status, { error: `Forbidden: ${auth.reason}` }, auth.headers);
  }
  const cors = auth.headers;

  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/state") {
    return json(res, 200, { status: state.status, qr: state.qr, groups: state.groups, error: state.error, needs2fa: state.needs2fa, listening: state.listening }, cors);
  }

  if (req.method === "GET" && url.pathname === "/session") {
    return json(res, 200, { session: client.session.save() }, cors);
  }

  if (req.method === "POST" && url.pathname === "/2fa") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { password } = JSON.parse(body || "{}");
      if (resolve2fa && password) resolve2fa(password);
      json(res, 200, { ok: true }, cors);
    });
    return;
  }

  // "/reset" was an undocumented alias of "/logout" with no caller. Left in, it
  // was a second destructive route reachable by anything that could reach the
  // first one.
  if (req.method === "POST" && url.pathname === "/logout") {
    try {
      try { await client.logOut(); } catch {}
      try { await client.destroy(); } catch {}
      for (const f of ["telegram-local-session.enc", "telegram_session.enc"]) {
        try {
          const p = path.join(root, f);
          if (existsSync(p)) unlinkSync(p);
        } catch {}
      }
      state.status = "qr";
      state.qr = null;
      state.groups = [];
      state.listening = null;
      state.error = null;
      state.needs2fa = false;
      resolve2fa = null;
      // The old client and its handler are gone with client.destroy() above, so
      // the guard only needs re-opening -- nothing to detach.
      listenGuard.reset();
      session = new StringSession("");
      client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
      void boot();
      return json(res, 200, { ok: true }, cors);
    } catch (err) {
      return json(res, 500, { error: err.message }, cors);
    }
  }

  if (req.method === "POST" && url.pathname === "/configure") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const cfg = JSON.parse(body || "{}");
        if (!cfg.agentToken || !cfg.chatId || !cfg.botUsername) throw new Error("agentToken, chatId, botUsername required");

        // Saved before listening starts, so a restart can resume even if the
        // attach below fails.
        writeFileSync(
          path.join(root, "telegram-local-agent.json"),
          JSON.stringify({ agentToken: cfg.agentToken, telegramChatId: cfg.chatId, paywayBotUsername: cfg.botUsername }, null, 2),
          { mode: 0o600 },
        );

        // Make the RUNNING listener match this configuration exactly.
        //
        // Anything that differs means the live handler is stale and must be
        // REPLACED, not merely acknowledged:
        //
        //   * POST /api/telegram/local-agent/create mints a fresh agent token on
        //     every click, and streamkit_create_local_telegram_agent revokes
        //     every previous agent for the creator when it does. Ingest gates
        //     on the token hash captured at attach time, so treating a new token
        //     as a no-op left the handler presenting a REVOKED hash and silently
        //     dropped every tip while the dashboard read "Listening".
        //   * Re-pointing at another chat has to detach the old handler first,
        //     or it keeps ingesting into the previous group -- which is what the
        //     old 409 refusal existed to prevent.
        //
        // This used to refuse with 409 instead, which deadlocked the creator:
        // the fix was "log out first", and the only logout button lived on the
        // listening screen, so switching groups had no route out of the group
        // picker. Worse, /logout deletes the encrypted session file and forces a
        // fresh QR scan to undo a mistake the dashboard made.
        //
        // reset() runs the teardown that removes the old handler, so there is
        // never a moment with two handlers attached, and never a moment where
        // the previous chat keeps collecting donations the creator believes
        // they moved.
        const active = listenGuard.getActiveConfig();
        const sameTarget =
          active !== null &&
          active.chatId === cfg.chatId &&
          active.botUsername.replace(/^@/, "").toLowerCase() ===
            cfg.botUsername.replace(/^@/, "").toLowerCase();
        const sameToken = active !== null && active.agentToken === cfg.agentToken;
        const mustReplace = active !== null && !(sameTarget && sameToken);

        if (mustReplace) {
          listenGuard.reset();
          // Cleared so the dashboard cannot report a listener that is mid-swap,
          // and so a failed re-attach below reports honestly instead of
          // inheriting the previous chat.
          state.listening = null;
        }
        state.status = "starting";

        const result = await listenGuard.ensureListening(cfg);

        // The guard short-circuits when the running config is byte-identical, so
        // nothing was reset and attachListener -- the only writer of "listening"
        // -- never ran. Without this the bridge would sit on "starting" forever,
        // which is exactly the state that hid the group picker from the
        // dashboard in the first place.
        if (result.resumed === false && state.listening) state.status = "listening";

        json(res, 200, {
          ok: true,
          alreadyListening: result.resumed === false,
          switched: mustReplace,
        }, cors);
      } catch (err) {
        // Only claim "groups" when nothing is attached. If a live listener
        // survived, report that instead of hiding it behind the group picker.
        state.status = state.listening ? "listening" : "groups";
        json(res, 400, { error: err.message }, cors);
      }
    });
    return;
  }

  json(res, 404, { error: "not found" }, cors);
});

server.listen(PORT, "127.0.0.1", () => console.log(`Kit Client bridge on http://127.0.0.1:${PORT}`));
boot();
