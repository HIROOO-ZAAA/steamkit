import "server-only";

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export type TelegramGroupIdentity = {
  telegramChatId: string;
  telegramChatTitle: string | null;
  telegramChatType: "group" | "supergroup";
  telegramUserId: string;
  telegramUsername: string | null;
};

export type LinkedTelegramGroup = {
  group_id: string;
  creator_id: string;
  group_name: string;
};

export async function consumeTelegramGroupLink(
  token: string,
  identity: TelegramGroupIdentity,
) {
  const secret = process.env.TELEGRAM_LINK_TOKEN_SECRET;
  if (!secret) throw new Error("Telegram group linking is not configured.");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Supabase is not configured.");

  const tokenHash = createHmac("sha256", secret).update(token).digest("hex");
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("streamkit_link_telegram_group", {
    p_link_token_hash: tokenHash,
    p_telegram_chat_id: identity.telegramChatId,
    p_telegram_chat_title: identity.telegramChatTitle,
    p_telegram_chat_type: identity.telegramChatType,
    p_telegram_user_id: identity.telegramUserId,
    p_telegram_username: identity.telegramUsername,
  });
  if (error) throw error;
  return data as LinkedTelegramGroup | null;
}
