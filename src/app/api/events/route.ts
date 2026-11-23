import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generic SSE endpoint for overlay events.
 *
 * Currently supports: redeem_trigger
 *
 * Subscribers are held open and closed when the request is aborted.
 * For multi-process deployments this should be backed by Redis pub/sub;
 * see scripts/redis-pubsub.mjs for the bridge implementation.
 */
export async function GET(request: NextRequest) {
  const filter = request.nextUrl.searchParams.get("filter") ?? "redeem_trigger";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Send initial heartbeat so the client knows the stream is alive
      send("heartbeat", { ok: true, filter });

      const interval = setInterval(() => {
        try {
          send("heartbeat", { ts: Date.now() });
        } catch {
          // Controller closed — client disconnected
        }
      }, 15000);

      // Listen for redeem_trigger events via in-memory bus.
      // In production, replace this with a Redis pub/sub subscriber.
      const unsubscribe = subscribeOverlayEvent(filter, (payload) => {
        try {
          send(filter, payload);
        } catch {
          // Controller closed
        }
      });

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * In-memory event bus. Replace with Redis pub/sub for multi-process setups.
 */
type OverlayEventHandler = (payload: unknown) => void;
const subscribers = new Map<string, Set<OverlayEventHandler>>();

export function subscribeOverlayEvent(
  event: string,
  handler: OverlayEventHandler,
): () => void {
  let set = subscribers.get(event);
  if (!set) {
    set = new Set();
    subscribers.set(event, set);
  }
  set.add(handler);
  return () => {
    set?.delete(handler);
  };
}

export function publishOverlayEvent(event: string, payload: unknown) {
  const set = subscribers.get(event);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(payload);
    } catch {
      // Never let one subscriber break the bus
    }
  }
}