import { timingSafeEqual } from "node:crypto";
import { consumeTelegramDeviceLink } from "@/lib/telegram/devices";

export const runtime = "nodejs";

function responseError(error: string, status: number) {
  return Response.json(
    { success: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function safeSecretMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  const linkSecret = process.env.TELEGRAM_LINK_TOKEN_SECRET;
  if (!linkSecret)
    return responseError("Telegram linking is not configured.", 503);

  const authorization = request.headers.get("authorization") ?? "";
  const providedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!providedSecret || !safeSecretMatch(providedSecret, linkSecret)) {
    return responseError("Unauthorized bot request.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseError("Invalid link request.", 400);
  }
  if (!body || typeof body !== "object") {
    return responseError("Invalid link request.", 400);
  }

  const input = body as Record<string, unknown>;
  const token = input.token;
  const telegramUserId = input.telegramUserId;
  const telegramChatId = input.telegramChatId;
  const telegramUsername = input.telegramUsername;
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token) ||
    typeof telegramUserId !== "string" ||
    !/^\d{1,20}$/.test(telegramUserId) ||
    typeof telegramChatId !== "string" ||
    !/^-?\d{1,20}$/.test(telegramChatId) ||
    (telegramUsername !== null &&
      telegramUsername !== undefined &&
      (typeof telegramUsername !== "string" ||
        !/^[A-Za-z0-9_]{5,32}$/.test(telegramUsername)))
  ) {
    return responseError("Invalid Telegram identity.", 400);
  }

  try {
    const linkedDevice = await consumeTelegramDeviceLink(token, {
      telegramUserId,
      telegramUsername:
        typeof telegramUsername === "string" ? telegramUsername : null,
      telegramChatId,
    });
    if (!linkedDevice)
      return responseError(
        "Link token is invalid, expired, or already used.",
        410,
      );

    return Response.json(
      { success: true, deviceName: linkedDevice.device_name },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return responseError("Unable to link Telegram device.", 503);
  }
}
