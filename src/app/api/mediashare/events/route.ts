import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { subscribeMediaShare, formatMediaShareSSEEvent } from "@/lib/mediashare/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveCreatorId(request: NextRequest): Promise<string | null> {
  const token = request.nextUrl.searchParams.get("token");
  const creatorParam = request.nextUrl.searchParams.get("creator_id") || request.nextUrl.searchParams.get("creatorId");
  if (creatorParam) return creatorParam;

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
  const creatorId = await resolveCreatorId(request);

  if (!creatorId) {
    return new Response(JSON.stringify({ error: "Unauthorized access to media share events." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Subscribe to broadcaster
      const unsubscribe = subscribeMediaShare(creatorId, (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          unsubscribe();
        }
      });

      // 15-second heartbeat ping
      const pingInterval = setInterval(() => {
        try {
          const pingChunk = formatMediaShareSSEEvent({ type: "ping" });
          controller.enqueue(encoder.encode(pingChunk));
        } catch {
          clearInterval(pingInterval);
          unsubscribe();
        }
      }, 15000);

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
