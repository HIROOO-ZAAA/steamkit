import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  subscribeChat,
  subscribeChampion,
  formatChatMessageSSEEvent,
  formatChampionUpdateSSEEvent,
} from "@/lib/overlay/chat-champion-sse";

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
      // Continue
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
    return new Response(JSON.stringify({ error: "Unauthorized access to chat events." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      const unsubChat = subscribeChat(creatorId, (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          unsubChat();
        }
      });

      const unsubChampion = subscribeChampion(creatorId, (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          unsubChampion();
        }
      });

      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
          unsubChat();
          unsubChampion();
        }
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        unsubChat();
        unsubChampion();
        try {
          controller.close();
        } catch {
          // Closed
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
