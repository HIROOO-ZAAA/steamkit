import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return json({ error: "Sign in to view media requests." }, 401);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("media_share_queue")
      .select("id, tipper_name, youtube_url, duration_seconds")
      .eq("creator_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      return json({ error: "Media requests could not be loaded." }, 503);
    }

    return json({ items: data ?? [] });
  } catch {
    return json({ error: "Media requests could not be loaded." }, 503);
  }
}
