"use client";

import { use, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChatMessage } from "@/lib/overlay/chat-champion-sse";
import styles from "./chat-overlay.module.css";

interface OverlayProps {
  searchParams?: Promise<{ token?: string; creator_id?: string }>;
  params?: Promise<{ token?: string }>;
}

export default function ChatOverlayPage({ searchParams, params }: OverlayProps) {
  const resolvedSearchParams = searchParams ? use(searchParams) : {};
  const resolvedParams = params ? use(params) : {};
  const token = resolvedSearchParams.token || resolvedParams.token || "";
  const creator_id = resolvedSearchParams.creator_id || "";

  const [supabase] = useState(() => createClient());
  const [creatorId, setCreatorId] = useState<string>(creator_id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // 1. Resolve Creator ID from token
  useEffect(() => {
    if (creatorId || !token) return;

    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("streamkit_resolve_overlay", {
          p_token: token,
        });
        const resolved = (data as { creator_id?: string }[] | null)?.[0];
        if (!cancelled && !error && resolved?.creator_id) {
          setCreatorId(resolved.creator_id);
        }
      } catch {
        // Fallback
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, token, creatorId]);

  // 2. Fetch recent chat messages
  const fetchMessages = useCallback(async () => {
    if (!token && !creatorId) return;

    try {
      const url = token
        ? `/api/youtube-chat?token=${encodeURIComponent(token)}`
        : `/api/youtube-chat?creatorId=${encodeURIComponent(creatorId)}`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          for (const m of prev) map.set(m.id, m);
          for (const m of data.messages) map.set(m.id, m);
          return Array.from(map.values())
            .sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime())
            .slice(-20);
        });
      }
    } catch {
      // Ignore network errors in OBS overlay
    }
  }, [token, creatorId]);

  // 3. Connect to SSE events
  useEffect(() => {
    if (!token && !creatorId) return;

    const sseUrl = token
      ? `/api/overlay/chat-events?token=${encodeURIComponent(token)}`
      : `/api/overlay/chat-events?creator_id=${encodeURIComponent(creatorId)}`;

    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(sseUrl);

      eventSource.addEventListener("chat_message", (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data) as ChatMessage;
          if (msg && msg.id && msg.message) {
            setMessages((prev) => {
              if (prev.some((existing) => existing.id === msg.id)) return prev;
              return [...prev, msg].slice(-20);
            });
          }
        } catch {
          // Ignore invalid payload
        }
      });
    } catch {
      // Fallback to polling
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [token, creatorId]);

  // 4. Polling backup (every 3 seconds) for OBS robustness
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchMessages();
    }, 0);
    const pollInterval = setInterval(() => {
      void fetchMessages();
    }, 3000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(pollInterval);
    };
  }, [fetchMessages]);

  return (
    <div className={styles.overlayContainer}>
      <div className={styles.chatList} aria-live="polite">
        {messages.map((item) => (
          <div
            key={item.id}
            className={`${styles.chatMessage} ${item.is_super_chat ? styles.superChat : ""}`}
          >
            {item.author_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.author_avatar_url}
                alt=""
                className={styles.avatar}
              />
            ) : (
              <div className={styles.avatarFallback} aria-hidden="true">
                {(item.author_name || "A")[0].toUpperCase()}
              </div>
            )}

            <div className={styles.messageBody}>
              {item.is_super_chat ? (
                <div className={styles.superChatHeader}>
                  <span className={styles.authorName}>{item.author_name}</span>
                  <span className={styles.superChatAmount}>
                    {item.super_chat_currency || "$"}
                    {Number(item.super_chat_amount || 0).toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className={styles.metaRow}>
                  <span className={styles.authorName}>{item.author_name}</span>
                  {item.is_moderator ? (
                    <span className={styles.badgeMod}>MOD</span>
                  ) : null}
                  {item.is_sponsor ? (
                    <span className={styles.badgeSponsor}>MEMBER</span>
                  ) : null}
                </div>
              )}

              <p className={styles.messageText}>{item.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
