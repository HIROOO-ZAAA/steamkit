import { createAdminClient } from "@/lib/supabase/admin";
import { allowPaymentRequest } from "@/lib/payments/rate-limit";
import { getAuthorizedDonationVoicePath } from "@/lib/voice/donation-voice-access";

export const runtime = "nodejs";

const BUCKET = "donation-voice";
const SIGNED_URL_SECONDS = 300;
const TIP_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    overlayToken?: unknown;
    tipId?: unknown;
  } | null;

  if (
    typeof body?.overlayToken !== "string" ||
    !body.overlayToken.trim() ||
    body.overlayToken.length > 2048 ||
    typeof body.tipId !== "string" ||
    !TIP_ID_PATTERN.test(body.tipId)
  ) {
    return response({ error: "invalid voice request" }, 400);
  }

  let supabase: ReturnType<typeof createAdminClient>;

  try {
    supabase = createAdminClient();
  } catch {
    return response({ error: "voice service unavailable" }, 503);
  }

  try {
    const allowed = await allowPaymentRequest(
      supabase,
      request,
      "overlay-donation-voice",
      12,
      60,
    );

    if (!allowed) {
      return response({ error: "too many voice requests" }, 429);
    }
  } catch {
    return response({ error: "voice service unavailable" }, 503);
  }

  let resolved: unknown;
  let resolveError: { code?: string; message?: string } | null;

  try {
    const result = await supabase.rpc("streamkit_resolve_overlay", {
      p_token: body.overlayToken,
    });
    resolved = result.data;
    resolveError = result.error;
  } catch {
    return response({ error: "voice service unavailable" }, 503);
  }

  if (resolveError) {
    console.error(
      `[overlay-donation-voice] overlay resolver failed code=${resolveError.code ?? "unknown"}`,
    );
    return response({ error: "voice service unavailable" }, 503);
  }

  const overlay = Array.isArray(resolved) ? resolved[0] : resolved;

  if (
    !overlay ||
    typeof overlay !== "object" ||
    !("creator_id" in overlay) ||
    typeof overlay.creator_id !== "string"
  ) {
    return response({ error: "invalid overlay token" }, 401);
  }

  let tip: { creator_id: string; voice_path: string | null; payment_status: string } | null;

  try {
    const result = await supabase
      .from("tips")
      .select("creator_id, voice_path, payment_status")
      .eq("id", body.tipId)
      .eq("creator_id", overlay.creator_id)
      .maybeSingle();

    if (result.error) {
      return response({ error: "could not verify voice message" }, 503);
    }

    tip = result.data;
  } catch {
    return response({ error: "could not verify voice message" }, 503);
  }

  const authorizedVoicePath = getAuthorizedDonationVoicePath(
    tip,
    overlay.creator_id,
  );

  if (!authorizedVoicePath) {
    return response({ error: "voice message not found" }, 404);
  }

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(authorizedVoicePath, SIGNED_URL_SECONDS);

    if (error || !data?.signedUrl) {
      return response({ error: "could not prepare voice message" }, 503);
    }

    return response({
      audioUrl: data.signedUrl,
      expiresIn: SIGNED_URL_SECONDS,
    });
  } catch {
    return response({ error: "could not prepare voice message" }, 503);
  }
}
