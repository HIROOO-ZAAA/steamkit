import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return Response.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  const userClient = await createServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return jsonError("Sign in to test this device.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid device request.", 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).deviceId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test((body as Record<string, string>).deviceId)
  ) {
    return jsonError("Invalid device request.", 400);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return jsonError("Telegram bot is not configured.", 503);

  try {
    const { data: device, error: queryError } = await userClient
      .from("telegram_devices")
      .select("id, telegram_chat_id, device_name")
      .eq("id", (body as Record<string, string>).deviceId)
      .eq("creator_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (queryError) throw queryError;
    if (!device?.telegram_chat_id)
      return jsonError("Connected device not found.", 404);

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: device.telegram_chat_id,
          text: "Kit Steam Telegram connection test succeeded.",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!telegramResponse.ok)
      throw new Error("Telegram rejected the test message.");

    const { error: touchError } = await userClient.rpc(
      "streamkit_touch_telegram_device",
      { p_device_id: device.id },
    );
    if (touchError) throw touchError;
    return Response.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError("Unable to deliver a Telegram test message.", 503);
  }
}
