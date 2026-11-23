import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

type AnnounceBody = {
  creatorId: string;
  title?: string;
  game?: string;
  url?: string;
  creatorName?: string;
};

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => vars[key] ?? "");
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      },
    );
    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.description ?? "Telegram API error" };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

async function sendDiscordWebhook(
  webhookUrl: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Discord webhook ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return json({ error: "Service not configured" }, 503);
  }

  let body: AnnounceBody;
  try {
    body = (await req.json()) as AnnounceBody;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const {
    creatorId,
    title = "Live Stream",
    game = "Just Chatting",
    url,
    creatorName = "A streamer",
  } = body;

  if (!creatorId) {
    return json({ error: "creatorId required" }, 400);
  }

  const supabase = createAdminClient();

  // Get active go-live endpoints for this creator
  const { data: endpoints, error: epError } = await supabase.rpc(
    "streamkit_get_go_live_endpoints",
    { p_creator_id: creatorId },
  );

  if (epError) {
    return json({ error: epError.message }, 500);
  }

  if (!endpoints || endpoints.length === 0) {
    return json({ sent: 0, message: "No active go-live endpoints configured" });
  }

  // Get Telegram bot token if we have telegram endpoints
  let botToken: string | null = null;
  const hasTelegram = endpoints.some((e: { platform: string }) => e.platform === "telegram");
  if (hasTelegram) {
    botToken = process.env.TELEGRAM_BOT_TOKEN ?? null;
    if (!botToken) {
      console.warn("[go-live] TELEGRAM_BOT_TOKEN not set; skipping telegram endpoints");
    }
  }

  // For Discord, we need the actual webhook URLs. We store hashes for privacy,
  // so we must look them up from the webhook_endpoints table.
  const discordEndpointIds = endpoints
    .filter((e: { platform: string }) => e.platform === "discord")
    .map((e: { endpoint_id: string }) => e.endpoint_id);

  let webhookUrls: Map<string, string> = new Map();
  if (discordEndpointIds.length > 0) {
    const { data: webhooks, error: whError } = await supabase
      .from("webhook_endpoints")
      .select("id, url")
      .in("id", discordEndpointIds)
      .eq("is_active", true);

    if (whError) {
      console.warn("[go-live] Failed to fetch webhook URLs:", whError.message);
    } else if (webhooks) {
      webhookUrls = new Map(webhooks.map((w) => [w.id, w.url]));
    }
  }

  const results = [];

  for (const ep of endpoints) {
    if (ep.platform === "telegram" && botToken) {
      // Look up the telegram group chat_id from the telegram_groups table
      const { data: group } = await supabase
        .from("telegram_groups")
        .select("telegram_chat_id")
        .eq("id", ep.endpoint_id)
        .eq("status", "active")
        .maybeSingle();

      if (group?.telegram_chat_id) {
        const text = renderTemplate(ep.message_template, {
          creator: creatorName,
          title,
          game,
          url: url ?? "",
        });
        const result = await sendTelegramMessage(
          botToken,
          group.telegram_chat_id,
          text,
        );
        results.push({
          platform: "telegram",
          endpoint_id: ep.endpoint_id,
          ...result,
        });
      } else {
        results.push({
          platform: "telegram",
          endpoint_id: ep.endpoint_id,
          ok: false,
          error: "Telegram group not found or inactive",
        });
      }
    } else if (ep.platform === "discord") {
      const webhookUrl = webhookUrls.get(ep.endpoint_id);
      if (webhookUrl) {
        const text = renderTemplate(ep.message_template, {
          creator: creatorName,
          title,
          game,
          url: url ?? "",
        });
        const result = await sendDiscordWebhook(webhookUrl, text);
        results.push({
          platform: "discord",
          endpoint_id: ep.endpoint_id,
          ...result,
        });
      } else {
        results.push({
          platform: "discord",
          endpoint_id: ep.endpoint_id,
          ok: false,
          error: "Discord webhook not found or inactive",
        });
      }
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return json({ sent, results });
}