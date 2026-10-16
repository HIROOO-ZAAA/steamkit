import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type TestBody = {
  name?: unknown;
  amount?: unknown;
  currency?: unknown;
  message?: unknown;
  voicePath?: unknown;
  voiceDurationSeconds?: unknown;
};

export async function POST(req: Request) {
  const userClient = await createServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Sign in to test your alert." },
      { status: 401 },
    );

  let body: TestBody = {};
  try {
    body = (await req.json()) as TestBody;
  } catch {}

  const currency = body.currency === "KHR" ? "KHR" : "USD";
  const amount =
    typeof body.amount === "number" && Number.isFinite(body.amount) && body.amount > 0
      ? Math.min(body.amount, 1_000_000)
      : currency === "KHR"
        ? 1000
        : 10;
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 60)
      : "Kit Steam Test";
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim().slice(0, 300)
      : "This is a test alert. No payment was made.";

  // Same generated-filename shape the donation flow uses. The RPC re-validates
  // this; it is checked here too so an unusable path is reported as a clear
  // error instead of silently producing an alert with no audio.
  const voicePath =
    typeof body.voicePath === "string" ? body.voicePath.trim() : "";
  const voiceSafe =
    voicePath !== "" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|m4a|mp3|wav)$/i.test(
      voicePath,
    );
  if (voicePath !== "" && !voiceSafe) {
    return Response.json(
      { error: "That voice message could not be read. Try recording again." },
      { status: 400 },
    );
  }
  const voiceDurationRaw = Number(body.voiceDurationSeconds);
  const voiceDurationSeconds = voiceSafe
    ? Number.isFinite(voiceDurationRaw)
      ? Math.min(Math.max(Math.round(voiceDurationRaw), 1), 30)
      : 30
    : null;

  const { error } = await userClient.rpc("streamkit_insert_test_tip", {
    p_name: name,
    p_amount: amount,
    p_currency: currency,
    p_message: message,
    p_voice_path: voicePath || null,
    p_voice_duration_seconds: voiceDurationSeconds,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}