/**
 * Real-time SSE helpers and event dispatchers for Chat Overlay and Champion Widget.
 */

export interface ChatMessage {
  id: string;
  creator_id: string;
  message_id?: string;
  author_name: string;
  author_avatar_url?: string;
  author_channel_id?: string;
  message: string;
  platform: "youtube" | "twitch" | "kick" | "system";
  is_super_chat: boolean;
  super_chat_amount?: number | null;
  super_chat_currency?: string | null;
  is_moderator: boolean;
  is_sponsor: boolean;
  published_at: string;
  created_at?: string;
}

export interface ChampionData {
  id?: string;
  creator_id: string;
  donor_name: string;
  avatar_url?: string | null;
  total_amount: number;
  currency: string;
  message?: string | null;
  title?: string;
  previous_donor_name?: string | null;
  updated_at?: string;
}

/**
 * Formats an SSE event for 'chat_message'.
 */
export function formatChatMessageSSEEvent(message: Partial<ChatMessage>): string {
  const data = JSON.stringify({
    ...message,
    timestamp: Date.now(),
  });
  return `event: chat_message\ndata: ${data}\n\n`;
}

/**
 * Formats an SSE event for 'champion_update'.
 */
export function formatChampionUpdateSSEEvent(champion: ChampionData): string {
  const data = JSON.stringify({
    ...champion,
    timestamp: Date.now(),
  });
  return `event: champion_update\ndata: ${data}\n\n`;
}

type SSEListener = (chunk: string) => void;

const chatSubscribers = new Map<string, Set<SSEListener>>();
const championSubscribers = new Map<string, Set<SSEListener>>();

export function subscribeChat(creatorId: string, listener: SSEListener): () => void {
  if (!chatSubscribers.has(creatorId)) {
    chatSubscribers.set(creatorId, new Set());
  }
  const set = chatSubscribers.get(creatorId)!;
  set.add(listener);

  return () => {
    set.delete(listener);
    if (set.size === 0) chatSubscribers.delete(creatorId);
  };
}

export function broadcastChatMessage(creatorId: string, message: Partial<ChatMessage>): void {
  const set = chatSubscribers.get(creatorId);
  if (!set || set.size === 0) return;

  const chunk = formatChatMessageSSEEvent(message);
  for (const listener of set) {
    try {
      listener(chunk);
    } catch {
      // Ignored: dropped listener
    }
  }
}

export function subscribeChampion(creatorId: string, listener: SSEListener): () => void {
  if (!championSubscribers.has(creatorId)) {
    championSubscribers.set(creatorId, new Set());
  }
  const set = championSubscribers.get(creatorId)!;
  set.add(listener);

  return () => {
    set.delete(listener);
    if (set.size === 0) championSubscribers.delete(creatorId);
  };
}

export function broadcastChampionUpdate(creatorId: string, champion: ChampionData): void {
  const set = championSubscribers.get(creatorId);
  if (!set || set.size === 0) return;

  const chunk = formatChampionUpdateSSEEvent(champion);
  for (const listener of set) {
    try {
      listener(chunk);
    } catch {
      // Ignored: dropped listener
    }
  }
}
