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
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Sign in to test this group.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid group request.", 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).groupId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test((body as Record<string, string>).groupId)
  ) {
    return jsonError("Invalid group request.", 400);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return jsonError("Telegram bot is not configured.", 503);

  try {
    const groupId = (body as Record<string, string>).groupId;
    const { data: group, error: queryError } = await supabase
      .from("telegram_groups")
      .select("id, telegram_chat_id")
      .eq("id", groupId)
      .eq("creator_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (queryError) throw queryError;
    if (!group?.telegram_chat_id)
      return jsonError("Connected group not found.", 404);

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: group.telegram_chat_id,
          text: "Kit Steam group connection test succeeded. Verified payment notifications will appear here.",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!telegramResponse.ok)
      throw new Error("Telegram rejected the test message.");

    const { error: touchError } = await supabase.rpc(
      "streamkit_touch_telegram_group",
      { p_group_id: group.id },
    );
    if (touchError) throw touchError;
    return Response.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError("Unable to deliver a Telegram group test message.", 503);
  }
}
