// src/app/api/voice-settings/active-clone/route.ts
//
// Chooses which cloned voice the donation alert speaks with.
//
// This closes the gap that made voice settings decorative: `voice_settings` had
// `cloning_enabled` and `active_clone_id` columns and nothing anywhere in the app
// ever wrote them, so /api/tts/synthesize fell back to "newest consented clone"
// and the creator's choice could not change.
//
// Session auth, like the other dashboard-only voice routes: the ownership check
// is a real one against the signed-in user, not a token anchor.

import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to choose the voice your alerts use." },
      { status: 401 },
    );
  }

  let cloneId: string | null = null;
  try {
    const body = (await req.json()) as { cloneId?: unknown };
    const raw = body?.cloneId;
    cloneId = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  } catch {
    // No body means "turn cloning off", which is the same as sending null.
  }

  const admin = createAdminClient();

  if (cloneId) {
    const { data: clone } = await admin
      .from("voice_clones")
      .select("id, consent_at, voicestudio_voice_id")
      .eq("id", cloneId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!clone) {
      return NextResponse.json({ error: "That voice does not exist." }, { status: 404 });
    }
    // Same two conditions the speak path requires. Selecting a voice that cannot
    // speak would leave every alert silent again.
    if (!clone.consent_at || !clone.voicestudio_voice_id) {
      return NextResponse.json(
        { error: "That voice is not ready to speak yet." },
        { status: 409 },
      );
    }
  }

  // Update-then-insert rather than upsert: whether `user_id` carries a unique
  // index is a schema detail this route should not depend on.
  const { data: existing } = await admin
    .from("voice_settings")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const values = {
    cloning_enabled: cloneId !== null,
    active_clone_id: cloneId,
  };

  const result = existing
    ? await admin.from("voice_settings").update(values).eq("id", existing.id)
    : await admin.from("voice_settings").insert({ user_id: user.id, ...values });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...values });
}