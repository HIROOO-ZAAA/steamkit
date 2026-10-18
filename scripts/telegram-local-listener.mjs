#!/usr/bin/env node
import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { NewMessage } from "teleproto/events";
import { createClient } from "@supabase/supabase-js";
import { parseAbaMessage } from "./aba-message-parser.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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
const configPath = path.join(root, "telegram-local-agent.json");
if (!existsSync(configPath)) {
  console.error("Missing telegram-local-agent.json — run the dashboard local-agent setup first.");
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
const { agentToken, telegramChatId, paywayBotUsername } = config;
const rawChatId = String(telegramChatId);
const chatId = BigInt(rawChatId.startsWith("-") ? rawChatId : `-100${rawChatId}`);
console.log(`[Telegram Listener] Connecting to chat ID: ${chatId}`);

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
const tokenHash = createHash("sha256").update(agentToken).digest("hex");

const sessionFile = path.join(root, "telegram-local-session.enc");
const key = scryptSync(apiHash, "streamkit-local-session", 32);

function loadSession() {
  if (!existsSync(sessionFile)) return "";
  try {
    const blob = JSON.parse(readFileSync(sessionFile, "utf8"));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
    decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(blob.data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function saveSession(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  writeFileSync(sessionFile, JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  }), { mode: 0o600 });
}

const session = new StringSession(loadSession());
const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

await client.start({
  phoneNumber: async () => {
    const err = new Error("Use QR login");
    err.errorMessage = "RESTART_AUTH_WITH_QR";
    throw err;
  },
  password: async (hint) => {
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`2FA password${hint ? ` (${hint})` : ""}: `);
    rl.close();
    return answer;
  },
  qrCode: async ({ token }) => {
    qrcode.generate(`tg://login?token=${Buffer.from(token).toString("base64url")}`, { small: true });
    console.log("Scan with Telegram → Settings → Devices → Link Desktop Device");
  },
  onError: (err) => console.error(err.message),
});

saveSession(client.session.save());
console.log("Signed in. Session encrypted locally.");

const botEntity = await client.getEntity(paywayBotUsername);
const chatEntity = await client.getEntity(telegramChatId);
const senderId = String(botEntity.id);
const chatTitle = chatEntity.title ?? null;
const botLabel = paywayBotUsername.replace(/^@/, "");

await supabase.rpc("streamkit_register_local_telegram_sender", {
  p_token_hash: tokenHash,
  p_sender_user_id: senderId,
});
console.log(`Listening for @${botLabel} messages in chat ${telegramChatId}`);

client.addEventHandler(async (event) => {
  try {
    const message = event.message;
    if (!message?.message) return;
    const sender = await message.getSender();
    console.log(`[telegram] message received chars=${message.message.length}`);
    if (String(sender?.id) !== senderId) return;
    const parsed = parseAbaMessage(message.message);
    const { data, error } = await supabase.rpc("streamkit_record_parsed_aba_tip", {
      p_token_hash: tokenHash,
      p_telegram_chat_id: String(telegramChatId),
      p_telegram_chat_title: chatTitle,
      p_telegram_message_id: message.id,
      p_sender_user_id: senderId,
      p_sender_username: botLabel,
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
}, new NewMessage({ incoming: true, chats: [chatId], fromUsers: [botEntity] }));
