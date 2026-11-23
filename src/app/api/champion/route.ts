import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { broadcastChampionUpdate, ChampionData } from "@/lib/overlay/chat-champion-sse";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function resolveCreatorId(request: NextRequest): Promise<string | null> {
  const token = request.nextUrl.searchParams.get("token");
  const creatorParam = request.nextUrl.searchParams.get("creator_id") || request.nextUrl.searchParams.get("creatorId");
  if (creatorParam) return creatorParam;

  const admin = createAdminClient();

  if (token) {
    try {
      const { data } = await admin.rpc("streamkit_resolve_overlay", {
        p_token: token,
      });
      const resolved = (data as { creator_id?: string }[] | null)?.[0];
      if (resolved?.creator_id) {
        return resolved.creator_id;
      }

      const { data: cred } = await admin
        .from("streamkit_overlay_credentials")
        .select("creator_id")
        .eq("overlay_token", token)
        .maybeSingle();

      if (cred?.creator_id) {
        return cred.creator_id;
      }
    } catch {
      // Continue
    }
  }

  try {
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (user?.id) {
      return user.id;
    }
  } catch {
    // No session
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const creatorId = await resolveCreatorId(request);
    if (!creatorId) {
      return json({ error: "Creator ID is required." }, 401);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("champion")
      .select("*")
      .eq("creator_id", creatorId)
      .maybeSingle();

    if (error) {
      return json({ error: "Failed to load champion data." }, 500);
    }

    return json({ success: true, champion: data || null });
  } catch {
    return json({ error: "Failed to load champion data." }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const creatorId = body.creator_id || (await resolveCreatorId(request));

    if (!creatorId) {
      return json({ error: "Creator ID is required." }, 400);
    }

    const donorName = (body.donor_name || body.donorName || "Anonymous").trim().slice(0, 50);
    const totalAmount = Number(body.total_amount ?? body.totalAmount ?? 0);
    const currency = body.currency || "USD";
    const message = body.message || null;
    const title = body.title || "Stream Champion";
    const avatarUrl = body.avatar_url || body.avatarUrl || null;

    const admin = createAdminClient();

    // Check existing champion to see previous leader
    const { data: existing } = await admin
      .from("champion")
      .select("donor_name, total_amount")
      .eq("creator_id", creatorId)
      .maybeSingle();

    const previousDonor = existing?.donor_name || null;

    const { data, error } = await admin
      .from("champion")
      .upsert(
        {
          creator_id: creatorId,
          donor_name: donorName,
          avatar_url: avatarUrl,
          total_amount: totalAmount,
          currency,
          message,
          title,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "creator_id" }
      )
      .select()
      .single();

    if (error || !data) {
      return json({ error: "Failed to update champion." }, 500);
    }

    const payload: ChampionData = {
      ...data,
      previous_donor_name: previousDonor,
    };

    broadcastChampionUpdate(creatorId, payload);

    return json({ success: true, champion: payload });
  } catch {
    return json({ error: "Failed to update champion." }, 500);
  }
}
