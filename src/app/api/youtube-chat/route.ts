import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const videoId = searchParams.get("video_id");
  const pageToken = searchParams.get("page_token") || undefined;

  if (!token || !token.trim()) {
    return json({ error: "overlay token required" }, 401);
  }
  if (!videoId || !videoId.trim()) {
    return json({ error: "video_id required" }, 400);
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return json({ error: "chat service unavailable" }, 503);
  }

  // Resolve overlay token
  const { data: resolved, error: resolveError } = await supabase.rpc(
    "streamkit_resolve_overlay",
    { p_token: token },
  );
  const overlay = Array.isArray(resolved) ? resolved[0] : resolved;

  if (resolveError) {
    console.error(
      `[youtube-chat] streamkit_resolve_overlay failed code=${resolveError.code ?? "unknown"}`,
    );
    return json({ error: "chat service unavailable" }, 503);
  }
  if (!overlay?.creator_id) {
    return json({ error: "invalid overlay token" }, 401);
  }

  // Get YouTube API key from creator's settings or env
  const { data: settings, error: settingsError } = await supabase
    .from("streamer_settings")
    .select("youtube_api_key")
    .eq("user_id", overlay.creator_id)
    .maybeSingle();

  const youtubeApiKey = settings?.youtube_api_key ?? process.env.YOUTUBE_API_KEY;
  if (!youtubeApiKey) {
    return json({ error: "YouTube API key not configured" }, 503);
  }

  // Fetch live chat messages from YouTube
  const params = new URLSearchParams({
    part: "snippet,authorDetails",
    liveChatId: await getLiveChatId(youtubeApiKey, videoId),
    maxResults: "200",
    key: youtubeApiKey,
  });
  if (pageToken) params.set("pageToken", pageToken);

  const chatRes = await fetch(
    `https://www.googleapis.com/youtube/v3/liveChat/messages?${params.toString()}`,
  );

  if (!chatRes.ok) {
    const err = await chatRes.json().catch(() => ({}));
    console.error(
      `[youtube-chat] YouTube API error status=${chatRes.status} error=${err.error?.message ?? "unknown"}`,
    );
    return json({ error: "Failed to fetch YouTube chat" }, 503);
  }

  const chatData = await chatRes.json();
  type YouTubeChatItem = {
    id: string;
    authorDetails?: {
      displayName?: string;
      isChatOwner?: boolean;
      isChatModerator?: boolean;
    };
    snippet?: {
      displayMessage?: string;
      publishedAt?: string;
    };
  };
  const messages = ((chatData.items ?? []) as YouTubeChatItem[]).map((item) => ({
    id: item.id,
    username: item.authorDetails?.displayName ?? "Unknown",
    text: item.snippet?.displayMessage ?? "",
    created_at: item.snippet?.publishedAt ?? new Date().toISOString(),
    is_owner: item.authorDetails?.isChatOwner ?? false,
    is_moderator: item.authorDetails?.isChatModerator ?? false,
  }));

  return json({
    messages,
    next_page_token: chatData.nextPageToken,
    polling_interval_ms: chatData.pollingIntervalMillis ?? 2000,
  });
}

async function getLiveChatId(apiKey: string, videoId: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`,
  );
  if (!res.ok) throw new Error("Failed to get video details");
  const data = await res.json();
  const liveDetails = data.items?.[0]?.liveStreamingDetails;
  if (!liveDetails?.activeLiveChatId) throw new Error("No active live chat");
  return liveDetails.activeLiveChatId;
}