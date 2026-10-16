import { timingSafeEqual } from "node:crypto";
import { consumeTelegramGroupLink } from "@/lib/telegram/groups";

export const runtime = "nodejs";

type TelegramMessage = {
  text?: unknown;
  from?: { id?: unknown; username?: unknown };
  chat?: { id?: unknown; title?: unknown; type?: unknown };
};

function matchesSecret(provided: string, expected: string) {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

function validTelegramId(value: unknown, signed = false) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    (signed || value > 0)
  );
}

async function sendTelegramMessage(chatId: string, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("Telegram bot is not configured.");
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("Telegram rejected the response message.");
}

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return Response.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (
    !matchesSecret(
      request.headers.get("x-telegram-bot-api-secret-token") ?? "",
      webhookSecret,
    )
  ) {
    return Response.json(
      { ok: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let update: { message?: TelegramMessage };
  try {
    update = (await request.json()) as { message?: TelegramMessage };
  } catch {
    return Response.json(
      { ok: false },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const message = update.message;
  if (typeof message?.text !== "string" || !message.from || !message.chat) {
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  if (!validTelegramId(chatId, true) || !validTelegramId(telegramUserId)) {
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const start = message.text.match(
    /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([a-f0-9]{64}))?\s*$/i,
  );
  if (!start) {
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const stringChatId = String(chatId);
  if (!start?.[1]) {
    try {
      await sendTelegramMessage(
        stringChatId,
        "To connect a group, open Kit Steam Dashboard → Telegram Bot, generate a fresh QR, and choose the group where you want to add the Kit Steam bot.",
      );
    } catch {
      return Response.json(
        { ok: false },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (message.chat.type !== "group" && message.chat.type !== "supergroup") {
    await sendTelegramMessage(
      stringChatId,
      "This link connects a Telegram group, not a personal account. Generate a fresh QR in Kit Steam and select the group where you want to add the Kit Steam bot.",
    );
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const username = message.from.username;
  try {
    const group = await consumeTelegramGroupLink(start[1], {
      telegramChatId: stringChatId,
      telegramChatTitle:
        typeof message.chat.title === "string" ? message.chat.title : null,
      telegramChatType: message.chat.type,
      telegramUserId: String(telegramUserId),
      telegramUsername: typeof username === "string" ? username : null,
    });
    await sendTelegramMessage(
      stringChatId,
      group
        ? `This group is linked to Kit Steam as ${group.group_name}. Verified payment notifications will be posted here.`
        : "This Kit Steam group link is invalid, expired, already used, or this group is linked to another creator. Generate a new QR from your dashboard.",
    );
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
