import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Dynamic Open Graph card for a creator's tip page, so a shared link shows the
 * streamer's name and avatar instead of a bare URL. Rendered with Satori, which
 * only supports a subset of CSS -- flexbox, no external images unless fetched.
 */
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const handle = decodeURIComponent(username);

  let displayName = handle;
  let avatarUrl: string | null = null;
  let streamTitle: string | null = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, stream_title")
      .eq("username", handle.toLowerCase())
      .maybeSingle();

    if (data) {
      displayName = data.display_name?.trim() || handle;
      avatarUrl = data.avatar_url ?? null;
      streamTitle = data.stream_title ?? null;
    }
  } catch {
    /* render with whatever we have */
  }

  // Satori renders remote images itself; base64 inlining avoids a cold fetch.
  let avatar: string | null = null;
  if (avatarUrl?.startsWith("http")) {
    try {
      const res = await fetch(avatarUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        avatar = `data:${res.headers.get("content-type") ?? "image/png"};base64,${Buffer.from(buf).toString("base64")}`;
      }
    } catch {
      avatar = null;
    }
  }

  const initials = displayName.slice(0, 2).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          background: "linear-gradient(160deg,#0E5844 0%,#0F172A 55%,#111C32 100%)",
          color: "#F8FAFC",
          fontFamily: "sans-serif",
          padding: 48,
        }}
      >
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: 26,
            border: "4px solid #10B981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            background: "#0F172A",
            fontSize: 52,
            fontWeight: 700,
            color: "#10B981",
          }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              width={132}
              height={132}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            initials
          )}
        </div>

        <div
          style={{
            fontSize: displayName.length > 18 ? 48 : 62,
            fontWeight: 800,
            letterSpacing: -1,
            textAlign: "center",
            lineHeight: 1.1,
            display: "flex",
          }}
        >
          {displayName.length > 26 ? `${displayName.slice(0, 26)}…` : displayName}
        </div>

        {streamTitle ? (
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "#94A3B8",
              textAlign: "center",
              lineHeight: 1.3,
            }}
          >
            {streamTitle.length > 64 ? `${streamTitle.slice(0, 64)}…` : streamTitle}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 10,
            padding: "12px 28px",
            borderRadius: 999,
            border: "2px solid #10B981",
            fontSize: 26,
            letterSpacing: 4,
            fontWeight: 700,
            color: "#10B981",
          }}
        >
          SEND ME A TIP
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}