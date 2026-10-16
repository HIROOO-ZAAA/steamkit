import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const VERIFY_TIMEOUT_MS = 8000;
const MAX_HTML_CHARS = 300_000;

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "payway.com.kh" ||
    host.endsWith(".payway.com.kh") ||
    host === "ababank.com" ||
    host.endsWith(".ababank.com")
  );
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/gi, " ");
}

function unescapeJsString(value: string) {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

function pickJsString(source: string, key: string): string | null {
  const match = source.match(
    new RegExp(`${key}:"((?:[^"\\\\]|\\\\.)*)"`),
  );
  if (!match) return null;
  const value = unescapeJsString(match[1]).trim();
  return value || null;
}

function extractMerchantName(html: string, payload: string): string | null {
  const outlet = pickJsString(payload, "outlet_name");
  if (outlet) return outlet.slice(0, 80);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const og =
    html.match(
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    )?.[1];
  const raw = title
    ?.replace(/\s*-\s*(link|checkout)[.\w]*payway\.com\.kh\s*$/i, "")
    .replace(/\s+[-\u00b7]\s+link\.payway\.com\.kh\s*$/i, "")
    .trim() || og;
  if (!raw) return null;

  const cleaned = decodeEntities(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*(link|checkout)[.\w]*payway\.com\.kh\s*$/i, "")
    .trim()
    .slice(0, 80);

  return cleaned || null;
}

export async function POST(request: NextRequest) {
  let rawUrl: unknown;
  try {
    const body = await request.json();
    rawUrl = body?.url;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return jsonError("Paste your ABA merchant URL first.", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return jsonError("That is not a valid URL.", 400);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return jsonError("Only http(s) ABA links are supported.", 400);
  }

  if (!isAllowedHost(parsed.hostname)) {
    return jsonError(
      "That is not an ABA PayWay link. Use a link.payway.com.kh or ABA bank URL.",
      422,
    );
  }

  if (!parsed.pathname || parsed.pathname === "/" || parsed.pathname === "") {
    return jsonError(
      "Can't check this link — a word is missing from the end of the URL.",
      422,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return jsonError(
        `The ABA link is not reachable (HTTP ${response.status}).`,
        502,
      );
    }

    if (response.url) {
      let finalHost: string | null = null;
      try {
        finalHost = new URL(response.url).hostname;
      } catch {
        finalHost = null;
      }
      if (!finalHost || !isAllowedHost(finalHost)) {
        return jsonError(
          "That link redirects away from ABA. Verification cancelled.",
          422,
        );
      }
    }

    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    const payloadStart = html.indexOf("window.__NUXT__=");
    const payload =
      payloadStart >= 0
        ? html.slice(payloadStart, payloadStart + 40_000)
        : html;

    const hasErrorStatus =
      payload.includes('page:"invalid-data"') ||
      payload.includes('"Invalid Data"') ||
      payload.includes('code:"07"');

    if (hasErrorStatus) {
      return jsonError(
        "Can't check this link — a word in the URL is missing or misspelled.",
        422,
      );
    }

    const hasSuccess = payload.includes('message:"Success!"');
    const merchantName = extractMerchantName(html, payload);

    if (!hasSuccess) {
      return jsonError(
        "Can't check this link — a word in the URL is missing or misspelled.",
        422,
      );
    }

    const categoryMatch = payload.match(
      /business_category:\{name:"((?:[^"\\]|\\.)*)"/,
    );
    const category = categoryMatch ? unescapeJsString(categoryMatch[1]) : null;
    const logo = pickJsString(payload, "company_logo");
    const currency = payload.match(/currency:"(USD|KHR)"/)?.[1] ?? null;
    const description = pickJsString(payload, "description");
    const linkStatus = payload.match(/status:"(OPEN|CLOSED|EXPIRED)"/)?.[1] ?? null;

    return Response.json(
      {
        verified: true,
        merchantName,
        category,
        logo,
        currency,
        description,
        linkStatus,
        finalUrl: response.url || parsed.toString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return jsonError(
      timedOut
        ? "The ABA link took too long to respond. Try again."
        : "Could not reach that link right now. Try again.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}
