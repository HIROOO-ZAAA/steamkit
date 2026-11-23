/**
 * YouTube parsing, duration conversion, embed URLs, and Data API v3 validation.
 */

export interface YouTubeVideoInfo {
  valid: boolean;
  videoId?: string;
  title?: string;
  author?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  embedUrl?: string;
  error?: string;
}

/**
 * Extracts a YouTube 11-character video ID from varied URL formats or a raw ID.
 */
export function parseYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // If it's already an 11-character ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      // /watch?v=VIDEO_ID
      const vParam = url.searchParams.get("v");
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      // /embed/VIDEO_ID, /v/VIDEO_ID, /shorts/VIDEO_ID, /live/VIDEO_ID
      const match = url.pathname.match(/^\/(?:embed|v|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch {
    // If not a valid URL, try regex fallback
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = trimmed.match(regex);
    if (match && match[1] && /^[a-zA-Z0-9_-]{11}$/.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

/**
 * Parses an ISO 8601 duration string (e.g., PT3M33S, PT1H2M10S, PT45S) into total seconds.
 */
export function parseISODuration(isoDuration: string): number {
  if (!isoDuration || typeof isoDuration !== "string") return 0;
  const regex = /P(?:([0-9]+)D)?T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?/i;
  const match = isoDuration.trim().match(regex);
  if (!match) return 0;

  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseInt(match[4] || "0", 10);

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Constructs a safe YouTube embed URL with privacy enhancements and autoplay flags.
 */
export function getYouTubeEmbedUrl(
  videoId: string,
  options: { autoplay?: boolean; enablejsapi?: boolean; origin?: string } = {}
): string {
  const { autoplay = true, enablejsapi = true, origin } = options;
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    enablejsapi: enablejsapi ? "1" : "0",
    controls: "0",
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
  });

  if (origin) {
    params.set("origin", origin);
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Validates a YouTube video using YouTube Data API v3, with oEmbed and format fallbacks.
 */
export async function validateYouTubeVideo(
  urlOrId: string,
  apiKey?: string
): Promise<YouTubeVideoInfo> {
  const videoId = parseYouTubeVideoId(urlOrId);
  if (!videoId) {
    return {
      valid: false,
      error: "Invalid YouTube URL or video ID format",
    };
  }

  const embedUrl = getYouTubeEmbedUrl(videoId);
  const defaultThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // 1. Try YouTube Data API v3 if API key is provided
  if (apiKey) {
    try {
      const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${encodeURIComponent(
        videoId
      )}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const item = json.items?.[0];
        if (!item) {
          return {
            valid: false,
            error: "Video not found or is private",
          };
        }

        if (item.status && item.status.embeddable === false) {
          return {
            valid: false,
            error: "Video owner has disabled embedding",
          };
        }

        const durationSeconds = parseISODuration(item.contentDetails?.duration || "PT0S");
        const title = item.snippet?.title || "YouTube Video";
        const author = item.snippet?.channelTitle || "YouTube Creator";
        const thumbnailUrl =
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          defaultThumbnail;

        return {
          valid: true,
          videoId,
          title,
          author,
          thumbnailUrl,
          durationSeconds,
          embedUrl,
        };
      }
    } catch {
      // Fall through to fallback
    }
  }

  // 2. Fallback: try YouTube oEmbed (no API key required)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return {
        valid: true,
        videoId,
        title: data.title || "YouTube Video",
        author: data.author_name || "YouTube Creator",
        thumbnailUrl: data.thumbnail_url || defaultThumbnail,
        durationSeconds: 180, // Default estimated duration
        embedUrl,
      };
    }
  } catch {
    // Fall through to default format validation
  }

  // 3. Fallback: URL/ID structure is valid
  return {
    valid: true,
    videoId,
    title: "YouTube Video",
    author: "YouTube",
    thumbnailUrl: defaultThumbnail,
    durationSeconds: 180,
    embedUrl,
  };
}
