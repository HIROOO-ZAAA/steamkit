import { createClient } from "@/lib/supabase/server";
import { voiceStudioConfigured } from "@/lib/voice/voicestudio";
import { getTtsObservation } from "@/lib/voice/tts-health";
import { savedTtsEnabled } from "@/lib/dashboard/health";
import { selectedCloneId } from "@/lib/voice/clone-selection";

export const runtime = "nodejs";

function eventSource(value: unknown): string {
  if (value === "aba_payway" || value === "bakong" || value === "test") return value;
  return "other";
}

function safeEventStatus(value: unknown): string {
  return ["successful", "completed", "test", "failed", "review_required", "pending", "processing"].includes(String(value))
    ? String(value)
    : "unknown";
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Sign in to view service health." }, { status: 401 });
  }

  const [tipsResult, voiceResult, alertResult] = await Promise.all([
    supabase
      .from("tips")
      .select("created_at, payment_status, payment_method")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("voice_settings")
      .select("cloning_enabled, active_clone_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("alert_settings")
      .select("tts_enabled")
      .eq("user_id", user.id)
  ]);

  const observation = getTtsObservation(user.id);
  const tips = tipsResult.data ?? [];
  const voiceSettings = voiceResult.data;
  const alertSettings = alertResult.data;
  const activeCloneId = selectedCloneId(voiceSettings);
  const cloneResult = activeCloneId
    ? await supabase
        .from("voice_clones")
        .select("consent_at, voicestudio_voice_id")
        .eq("id", activeCloneId)
        .eq("owner_id", user.id)
        .maybeSingle()
    : null;
  const databaseOk =
    !tipsResult.error &&
    !voiceResult.error &&
    !alertResult.error &&
    !cloneResult?.error;
  const cloneReadiness = voiceResult.error
    ? "unknown"
    : !activeCloneId
      ? "not_selected"
      : cloneResult?.error
        ? "unknown"
        : cloneResult?.data?.consent_at && cloneResult.data.voicestudio_voice_id
          ? "ready"
          : "needs_setup";

  return Response.json(
    {
      checkedAt: new Date().toISOString(),
      database: {
        level: databaseOk ? "healthy" : "degraded",
        detail: databaseOk
          ? "Authenticated service checks completed."
          : "One or more authenticated status queries failed; private database details are hidden.",
      },
      telegram: {
        level: "unknown",
        detail: "Telegram status is checked directly from this browser against the local bridge.",
        lastConnectedAt: null,
      },
      recentEvents: {
        level: tipsResult.error ? "unknown" : "healthy",
        detail: tipsResult.error
          ? "Recent donation events could not be loaded."
          : "Latest stored donation and test-event statuses; donor details are omitted.",
        items: (tips as Array<{ created_at: string; payment_status: string | null; payment_method: string | null }>).map((tip) => ({
          at: tip.created_at,
          status: safeEventStatus(tip.payment_status),
          source: eventSource(tip.payment_method),
        })),
      },
      tts: {
        configured: voiceStudioConfigured(),
        enabled: alertResult.error ? null : savedTtsEnabled(alertSettings ?? []),
        cloneReadiness,
        observation,
        detail: observation
          ? "Most recent synthesis result observed by this application process."
          : "No synthesis result has been observed by this application process yet.",
      },
      overlay: {
        level: "unknown",
        detail: "OBS Browser Sources do not report a heartbeat to this dashboard, so connectivity cannot be measured here.",
      },
      issues: [
        ...(tipsResult.error ? ["Recent donation events could not be loaded."] : []),
        ...(voiceResult.error
          ? ["Saved voice selection could not be checked."]
          : cloneResult?.error
            ? ["Selected voice clone could not be checked."]
            : cloneReadiness === "needs_setup"
              ? ["Selected voice clone is not ready to speak."]
              : []),
        ...(alertResult.error ? ["Saved alert speech setting could not be checked."] : []),
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
