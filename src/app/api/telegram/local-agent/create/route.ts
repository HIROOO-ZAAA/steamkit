import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(error: string, status: number) {
  return Response.json(
    { success: false, error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("Sign in to create a local listener.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid listener request.", 400);
  }

  const chatId = (body as Record<string, unknown>)?.telegramChatId;
  const botUsername = (body as Record<string, unknown>)?.paywayBotUsername;
  if (
    typeof chatId !== "string" ||
    !/^-?[0-9]{1,20}$/.test(chatId) ||
    typeof botUsername !== "string" ||
    !/^@?[A-Za-z0-9_]{5,32}$/.test(botUsername)
  ) {
    return errorResponse("Provide a valid group chat ID and PayWay bot username.", 400);
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const { data: agentId, error } = await supabase.rpc(
    "streamkit_create_local_telegram_agent",
    {
      p_token_hash: tokenHash,
      p_telegram_chat_id: chatId,
      p_payway_bot_username: botUsername.replace(/^@/, ""),
    },
  );

  if (error || !agentId) {
    return errorResponse(
      "Unable to create a local listener agent. Apply the local Telegram listener migration and try again.",
      503,
    );
  }

  return Response.json(
    { success: true, agentId, agentToken: rawToken },
    { headers: { "Cache-Control": "no-store" } },
  );
}
