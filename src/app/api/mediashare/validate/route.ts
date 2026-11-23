import { NextRequest } from "next/server";
import { validateYouTubeVideo } from "@/lib/mediashare/youtube";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const url = body?.url;

    if (!url || typeof url !== "string") {
      return json({ valid: false, error: "YouTube URL is required." }, 400);
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    const result = await validateYouTubeVideo(url, apiKey);

    if (!result.valid) {
      return json({ valid: false, error: result.error || "Invalid YouTube video." }, 400);
    }

    return json(result);
  } catch {
    return json({ valid: false, error: "Failed to validate YouTube URL." }, 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");

    if (!url) {
      return json({ valid: false, error: "YouTube URL is required." }, 400);
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    const result = await validateYouTubeVideo(url, apiKey);

    if (!result.valid) {
      return json({ valid: false, error: result.error || "Invalid YouTube video." }, 400);
    }

    return json(result);
  } catch {
    return json({ valid: false, error: "Failed to validate YouTube URL." }, 500);
  }
}
