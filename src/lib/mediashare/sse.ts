/**
 * Server-Sent Events (SSE) formatting, event types, and stream dispatching for Media Share.
 */

export interface MediaShareItem {
  id: string;
  creator_id: string;
  tipper_name: string;
  youtube_url: string;
  youtube_video_id: string;
  title?: string;
  thumbnail_url?: string;
  duration_seconds: number;
  status: "pending" | "playing" | "played" | "skipped" | "cancelled";
  tip_id?: string | null;
  created_at: string;
  played_at?: string | null;
  skipped_at?: string | null;
}

export type MediaShareSSEEventType = "media_share";

export interface MediaShareSSEPayload {
  type: "play" | "skip" | "played" | "queue_added" | "queue_updated" | "ping";
  item?: Partial<MediaShareItem>;
  id?: string;
  items?: Partial<MediaShareItem>[];
  timestamp?: number;
}

/**
 * Formats an SSE message for event type 'media_share'.
 */
export function formatMediaShareSSEEvent(
  payload: MediaShareSSEPayload,
  eventType: MediaShareSSEEventType = "media_share"
): string {
  const data = JSON.stringify({
    ...payload,
    timestamp: payload.timestamp ?? Date.now(),
  });
  return `event: ${eventType}\ndata: ${data}\n\n`;
}

type SSEListener = (chunk: string) => void;

// In-memory subscriber registry keyed by creator_id
const subscribers = new Map<string, Set<SSEListener>>();

/**
 * Subscribes a client listener to a creator's media share SSE stream.
 * Returns an unsubscribe callback.
 */
export function subscribeMediaShare(creatorId: string, listener: SSEListener): () => void {
  if (!subscribers.has(creatorId)) {
    subscribers.set(creatorId, new Set());
  }
  const set = subscribers.get(creatorId)!;
  set.add(listener);

  return () => {
    set.delete(listener);
    if (set.size === 0) {
      subscribers.delete(creatorId);
    }
  };
}

/**
 * Broadcasts an SSE event to all active listeners for a given creator.
 */
export function broadcastMediaShare(
  creatorId: string,
  payload: MediaShareSSEPayload
): void {
  const set = subscribers.get(creatorId);
  if (!set || set.size === 0) return;

  const chunk = formatMediaShareSSEEvent(payload);
  for (const listener of set) {
    try {
      listener(chunk);
    } catch {
      // Ignore dropped connection; cleanup handles it
    }
  }
}
