import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateYouTubeVideo } from "@/lib/mediashare/youtube";
import { broadcastMediaShare } from "@/lib/mediashare/sse";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function resolveCreatorId(request: NextRequest): Promise<string | null> {
  const token = request.nextUrl.searchParams.get("token");
  const admin = createAdminClient();

  if (token) {
    try {
      const { data } = await admin.rpc("streamkit_resolve_overlay", {
        p_token: token,
      });
      const resolved = (data as { creator_id?: string }[] | null)?.[0];
      if (resolved?.creator_id) {
        return resolved.creator_id;
      }

      const { data: cred } = await admin
        .from("streamkit_overlay_credentials")
        .select("creator_id")
        .eq("overlay_token", token)
        .maybeSingle();

      if (cred?.creator_id) {
        return cred.creator_id;
      }
    } catch {
      // Fall through to auth session
    }
  }

  try {
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (user?.id) {
      return user.id;
    }
  } catch {
    // No session
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const creatorId = await resolveCreatorId(request);
    if (!creatorId) {
      return json({ error: "Unauthorized access to media share queue." }, 401);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("media_share")
      .select(
        "id, creator_id, tipper_name, youtube_url, youtube_video_id, title, thumbnail_url, duration_seconds, status, created_at, played_at, skipped_at"
      )
      .eq("creator_id", creatorId)
      .in("status", ["pending", "playing"])
      .order("created_at", { ascending: true });

    if (error) {
      return json({ error: "Failed to load media queue." }, 503);
    }

    const items = data ?? [];
    const current = items.find((item) => item.status === "playing") || null;

    return json({
      success: true,
      items,
      current,
    });
  } catch {
    return json({ error: "Failed to load media queue." }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const admin = createAdminClient();

    // 1. Action dispatch: skip, play, played, delete
    if (body.action) {
      const { action, id } = body;
      if (!id || typeof id !== "string") {
        return json({ error: "Valid media request ID is required." }, 400);
      }

      let creatorId = await resolveCreatorId(request);
      if (!creatorId && body.token) {
        const { data } = await admin.rpc("streamkit_resolve_overlay", {
          p_token: body.token,
        });
        const resolved = (data as { creator_id?: string }[] | null)?.[0];
        creatorId = resolved?.creator_id || null;
      }

      if (!creatorId) {
        return json({ error: "Unauthorized to update queue." }, 401);
      }

      const now = new Date().toISOString();

      if (action === "skip") {
        const { data, error } = await admin
          .from("media_share")
          .update({ status: "skipped", skipped_at: now })
          .eq("id", id)
          .eq("creator_id", creatorId)
          .select()
          .maybeSingle();

        if (error || !data) {
          return json({ error: "Failed to skip media request." }, 404);
        }

        broadcastMediaShare(creatorId, { type: "skip", id });
        return json({ success: true, item: data });
      }

      if (action === "play") {
        const { data, error } = await admin
          .from("media_share")
          .update({ status: "playing", played_at: now })
          .eq("id", id)
          .eq("creator_id", creatorId)
          .select()
          .maybeSingle();

        if (error || !data) {
          return json({ error: "Failed to set media playing." }, 404);
        }

        broadcastMediaShare(creatorId, { type: "play", item: data });
        return json({ success: true, item: data });
      }

      if (action === "played") {
        const { data, error } = await admin
          .from("media_share")
          .update({ status: "played", played_at: now })
          .eq("id", id)
          .eq("creator_id", creatorId)
          .select()
          .maybeSingle();

        if (error || !data) {
          return json({ error: "Failed to complete media request." }, 404);
        }

        broadcastMediaShare(creatorId, { type: "played", id });
        return json({ success: true, item: data });
      }

      if (action === "delete") {
        const { error } = await admin
          .from("media_share")
          .delete()
          .eq("id", id)
          .eq("creator_id", creatorId);

        if (error) {
          return json({ error: "Failed to delete media request." }, 500);
        }

        broadcastMediaShare(creatorId, { type: "queue_updated", id });
        return json({ success: true });
      }

      return json({ error: `Unknown queue action: ${action}` }, 400);
    }

    // 2. Queue addition: validate and enqueue
    const youtubeUrl = body.youtube_url || body.url;
    if (!youtubeUrl || typeof youtubeUrl !== "string") {
      return json({ error: "YouTube URL is required." }, 400);
    }

    let creatorId = body.creator_id || body.creatorId || (await resolveCreatorId(request));
    if (!creatorId && body.token) {
      const { data } = await admin.rpc("streamkit_resolve_overlay", {
        p_token: body.token,
      });
      const resolved = (data as { creator_id?: string }[] | null)?.[0];
      creatorId = resolved?.creator_id || null;
    }

    if (!creatorId) {
      return json({ error: "Creator ID is required to enqueue media." }, 400);
    }

    // Validate YouTube URL
    const apiKey = process.env.YOUTUBE_API_KEY;
    const validation = await validateYouTubeVideo(youtubeUrl, apiKey);
    if (!validation.valid || !validation.videoId) {
      return json({ error: validation.error || "Invalid YouTube video." }, 400);
    }

    const tipperName = (body.tipper_name || body.tipperName || "Anonymous").trim().slice(0, 50);
    const title = validation.title || "YouTube Video";
    const thumbnailUrl = validation.thumbnailUrl || null;
    const durationSeconds = validation.durationSeconds || body.duration_seconds || 180;
    const tipId = body.tip_id || body.tipId || null;

    const { data, error } = await admin
      .from("media_share")
      .insert({
        creator_id: creatorId,
        tipper_name: tipperName,
        youtube_url: youtubeUrl,
        youtube_video_id: validation.videoId,
        title,
        thumbnail_url: thumbnailUrl,
        duration_seconds: durationSeconds,
        status: "pending",
        tip_id: tipId,
      })
      .select()
      .single();

    if (error || !data) {
      return json({ error: "Failed to enqueue media request." }, 500);
    }

    broadcastMediaShare(creatorId, { type: "queue_added", item: data });

    return json({ success: true, item: data }, 201);
  } catch {
    return json({ error: "Failed to manage media queue." }, 500);
  }
}
