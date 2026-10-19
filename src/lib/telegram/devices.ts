import "server-only";

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export type TelegramIdentity = {
  telegramUserId: string;
  telegramUsername: string | null;
  telegramChatId: string;
};

export type LinkedTelegramDevice = {
  device_id: string;
  creator_id: string;
  device_name: string;
};

export async function consumeTelegramDeviceLink(
  token: string,
  identity: TelegramIdentity,
) {
  const secret = process.env.TELEGRAM_LINK_TOKEN_SECRET;
  if (!secret) throw new Error("Telegram linking is not configured.");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured.");

  const tokenHash = createHmac("sha256", secret).update(token).digest("hex");
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("streamkit_link_telegram_device", {
    p_link_token_hash: tokenHash,
    p_telegram_user_id: identity.telegramUserId,
    p_telegram_username: identity.telegramUsername,
    p_telegram_chat_id: identity.telegramChatId,
  });
  if (error) throw error;
  return data as LinkedTelegramDevice | null;
}
