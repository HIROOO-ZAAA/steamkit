import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return json({ error: "Sign in to view streams." }, 401);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("streams")
      .select("id, username, youtube_channel_id, youtube_video_id, live_status, viewer_count, thumbnail_url, created_at")
      .eq("creator_id", user.id)
      .order("live_status", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return json({ error: "Could not load streams." }, 503);
    }

    return json({ streams: data ?? [] });
  } catch {
    return json({ error: "Could not load streams." }, 503);
  }
}

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return json({ error: "Sign in to add streams." }, 401);
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      username?: unknown;
      youtube_channel_id?: unknown;
      youtube_video_id?: unknown;
    } | null;

    if (!body || typeof body.username !== "string" || !body.username.trim()) {
      return json({ error: "Stream username is required." }, 400);
    }
    if (typeof body.youtube_channel_id !== "string" || !body.youtube_channel_id.trim()) {
      return json({ error: "YouTube channel ID is required." }, 400);
    }

    const admin = createAdminClient();
    const { data: stream, error } = await admin
      .from("streams")
      .insert({
        creator_id: user.id,
        username: body.username.trim(),
        youtube_channel_id: body.youtube_channel_id.trim(),
        youtube_video_id: typeof body.youtube_video_id === "string" ? body.youtube_video_id.trim() : null,
        live_status: "none",
        viewer_count: 0,
        thumbnail_url: "",
      })
      .select("id, username, youtube_channel_id, youtube_video_id, live_status, viewer_count, thumbnail_url, created_at")
      .single();

    if (error) {
      return json({ error: "Could not create stream." }, 503);
    }

    return json({ stream }, 201);
  } catch {
    return json({ error: "Could not create stream." }, 503);
  }
}