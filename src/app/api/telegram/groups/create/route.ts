import { createHmac, randomBytes } from "node:crypto";
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

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorResponse("Sign in to connect a Telegram group.", 401);

  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  const tokenSecret = process.env.TELEGRAM_LINK_TOKEN_SECRET;
  if (
    !botUsername ||
    !/^[A-Za-z0-9_]{5,32}$/.test(botUsername) ||
    !tokenSecret
  ) {
    return errorResponse("Telegram group linking is not configured.", 503);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id });
  if (profileError) {
    return errorResponse("Unable to initialize the creator profile.", 503);
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHmac("sha256", tokenSecret)
    .update(rawToken)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const { data: groupId, error } = await supabase.rpc(
    "streamkit_create_telegram_group_link",
    {
      p_group_name: "Telegram Group",
      p_link_token_hash: tokenHash,
      p_token_expires_at: expiresAt,
    },
  );
  if (error || !groupId) {
    return errorResponse(
      "Unable to create a group link. Apply the Telegram group migration and try again.",
      503,
    );
  }

  const startUrl = `https://t.me/${botUsername}?startgroup=${rawToken}`;
  return Response.json(
    { success: true, groupId, startUrl, expiresAt, expiresIn: 300 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
