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

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.KIT_CLIENT_PORT ?? 3113);

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
  } catch (err) {
    const msg = String(err?.message ?? err ?? "");
    if (/AuthKeyUnregistered|AUTH_KEY_UNREGISTERED|SESSION_REVOKED|401/i.test(msg) && loadSession()) {
      console.error("Stored session rejected by Telegram, resetting and showing QR login:", msg);
      try { client.disconnect(); } catch {}
      try { if (existsSync(sessionFile)) writeFileSync(sessionFile, ""); } catch {}
      session = new StringSession("");
      client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
      state.error = null;
      return boot();
    }
    state.status = "error";
    state.error = err.message;
    console.error("Auth failed:", err.message);
  }
}

async function startListening({ agentToken, chatId, botUsername }) {
  const tokenHash = createHash("sha256").update(agentToken).digest("hex");
  const rawChatId = String(chatId);
  const chatIdNum = BigInt(rawChatId.startsWith("-") ? rawChatId : `-100${rawChatId}`);
  const botEntity = await client.getEntity(botUsername);
  const chatEntity = await client.getEntity(chatId);
  const senderId = String(botEntity.id);
  const chatTitle = chatEntity.title ?? null;

  await supabase.rpc("streamkit_register_local_telegram_sender", {
    p_token_hash: tokenHash,
    p_sender_user_id: senderId,
  });

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message?.message) return;
      const sender = await message.getSender();
      console.log(`[telegram] ${message.message}`);
      console.log(`[telegram]   sender=${String(sender?.id ?? "?")} chat=${String(message.chatId ?? "")}`);
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
          console.log(`[ingest] tip ${data.tip_id} · ${parsed.currency} ${parsed.amount} from ${parsed.donor} · ${message.id}`);
        else console.log(`[ingest] logged, no tip (no amount parsed) ${message.id}`);
      }
    } catch (err) {
      console.error("Handler error:", err.message);
    }
  }, new NewMessage({ incoming: true, chats: [chatIdNum], fromUsers: [botEntity] }));

  state.status = "listening";
  state.listening = { chatId, botUsername };
  console.log(`Listening for @${botUsername} in ${chatId}`);
}

function json(res, code, body) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/state") {
    return json(res, 200, { status: state.status, qr: state.qr, groups: state.groups, error: state.error, needs2fa: state.needs2fa, listening: state.listening });
  }

  if (req.method === "GET" && url.pathname === "/session") {
    return json(res, 200, { session: client.session.save() });
  }

  if (req.method === "POST" && url.pathname === "/2fa") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { password } = JSON.parse(body || "{}");
      if (resolve2fa && password) resolve2fa(password);
      json(res, 200, { ok: true });
    });
    return;
  }

  if (req.method === "POST" && (url.pathname === "/logout" || url.pathname === "/reset")) {
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
      session = new StringSession("");
      client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
      void boot();
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/configure") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const cfg = JSON.parse(body || "{}");
        if (!cfg.agentToken || !cfg.chatId || !cfg.botUsername) throw new Error("agentToken, chatId, botUsername required");
        writeFileSync(
          path.join(root, "telegram-local-agent.json"),
          JSON.stringify({ agentToken: cfg.agentToken, telegramChatId: cfg.chatId, paywayBotUsername: cfg.botUsername }, null, 2),
          { mode: 0o600 },
        );
        state.status = "starting";
        await startListening(cfg);
        json(res, 200, { ok: true });
      } catch (err) {
        state.status = "groups";
        json(res, 400, { error: err.message });
      }
    });
    return;
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Kit Client bridge on http://127.0.0.1:${PORT}`));
boot();
