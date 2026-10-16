import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteVoiceStudioVoice } from "@/lib/voice/voicestudio";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Removes a clone row and, when we know its provider id, deletes the voice from
 * VoiceStudio too. Leaving the upstream voice behind would silently consume GPU
 * storage on every delete.
 *
 * The ownership check is the user client's, so RLS decides. The row is deleted
 * first: if the provider call then fails, the clone is already unreachable from
 * the overlay, which is the safe direction to fail in. The orphaned provider id
 * is logged.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return json({ error: "unauthorized" }, 401);
  }

  const { id } = await params;

  const { data: clone, error: lookupError } = await supabase
    .from("voice_clones")
    .select("id, voicestudio_voice_id")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return json({ error: "Could not read that voice." }, 500);
  }
  // A missing row and someone else's row are deliberately the same answer:
  // distinguishing them tells a caller whether a given uuid exists.
  if (!clone) {
    return json({ error: "Voice not found." }, 404);
  }

  const { error: deleteError } = await supabase
    .from("voice_clones")
    .delete()
    .eq("id", clone.id);

  if (deleteError) {
    return json({ error: "Could not remove that voice." }, 503);
  }

  if (clone.voicestudio_voice_id) {
    try {
      await deleteVoiceStudioVoice(clone.voicestudio_voice_id);
    } catch (error) {
      console.error(
        `[voice-clones] row ${clone.id} deleted but provider voice ${clone.voicestudio_voice_id} survived:`,
        error,
      );
    }
  }

  return json({ ok: true });
}