import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Records one sign-in for the authenticated caller. Inserts go through the service
// role so the browser cannot write its own IP or device values.

function resolveIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    null
  );
}

function describeDevice(userAgent: string): string {
  const os = /Windows NT 10/i.test(userAgent)
    ? "Windows NT 10"
    : /Windows/i.test(userAgent)
      ? "Windows"
      : /Mac OS X/i.test(userAgent)
        ? "macOS"
        : /Android/i.test(userAgent)
          ? "Android"
          : /iPhone|iPad|iOS/i.test(userAgent)
            ? "iOS"
            : /Linux/i.test(userAgent)
              ? "Linux"
              : "Unknown OS";

  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /OPR\//i.test(userAgent)
      ? "Opera"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Firefox\//i.test(userAgent)
          ? "Firefox"
          : /Safari\//i.test(userAgent)
            ? "Safari"
            : "Unknown Browser";

  return `${os} (${browser})`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const ip = resolveIp(request);

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("login_sessions").insert({
      user_id: user.id,
      ip_address: ip,
      user_agent: userAgent.slice(0, 512),
      device: describeDevice(userAgent),
      provider: user.app_metadata?.provider ?? "email",
    });

    if (error) throw new Error(error.message);
  } catch {
    return NextResponse.json(
      { error: "Could not record the sign-in" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}