import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return json({ error: "Media request not found." }, 404);
  }

  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return json({ error: "Sign in to manage media requests." }, 401);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("media_share_queue")
      .update({ status: "skipped" })
      .eq("id", id)
      .eq("creator_id", user.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      return json({ error: "Could not skip this media request." }, 503);
    }
    if (!data) {
      return json({ error: "Media request not found." }, 404);
    }

    return json({ ok: true });
  } catch {
    return json({ error: "Could not skip this media request." }, 503);
  }
}
