import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCreatorAdmin, auditLog, getClientIp, getUserAgent } from "@/lib/auth/requirePlatformRole";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Approve or reject a donor photo attached to a donation.
 * Only pending photos on the creator's own donations can be reviewed, and the
 * decision is mirrored onto the tip feed rows so the OBS overlay only ever
 * renders approved photos.
 * Requires creator_admin platform role or higher.
 */
export async function POST(request: Request) {
  const auth = await requireCreatorAdmin(request);
  if (!auth) {
    return json({ error: "Insufficient platform role." }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid request." }, 400);
  }
  const input = body as Record<string, unknown>;
  const donationId =
    typeof input.donationId === "string" ? input.donationId.trim() : "";
  const action = input.action === "reject" ? "reject" : "approve";
  const status = action === "reject" ? "rejected" : "approved";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    donationId,
  )) {
    return json({ error: "Invalid donation." }, 400);
  }

  const serviceRoleReady = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  if (!serviceRoleReady) {
    return json(
      { error: "Server payment service is not configured." },
      503,
    );
  }

  const supabase = createAdminClient();

  const { data: donation, error: donationError } = await supabase
    .from("donations")
    .select("id, creator_id, photo_path, photo_status")
    .eq("id", donationId)
    .maybeSingle();

  if (donationError || !donation) {
    return json({ error: "Donation not found." }, 404);
  }
  if (donation.photo_status !== "pending" || !donation.photo_path) {
    return json({ error: "This donation has no pending photo." }, 400);
  }

  // Capture before state for audit log
  const before = {
    id: donation.id,
    creator_id: donation.creator_id,
    photo_path: donation.photo_path,
    photo_status: donation.photo_status,
  };

  const { error: updateError } = await supabase
    .from("donations")
    .update({ photo_status: status })
    .eq("id", donationId);
  if (updateError) {
    return json({ error: "Unable to update the donation." }, 500);
  }

  // Mirror the decision onto the matching tip feed rows so overlays reflect it
  // even when the creator reviews the photo after the payment completed.
  const { data: transactions } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("donation_id", donationId)
    .eq("creator_id", donation.creator_id);
  if (transactions && transactions.length > 0) {
    const transactionIds = transactions.map(
      (t: { id: string }) => t.id as string,
    );
    await supabase
      .from("tips")
      .update({ photo_status: status })
      .in("payment_transaction_id", transactionIds);
  }

  // Capture after state for audit log
  const { data: afterData } = await supabase
    .from("donations")
    .select("id, creator_id, photo_path, photo_status")
    .eq("id", donationId)
    .maybeSingle();

  const after = afterData ? {
    id: afterData.id,
    creator_id: afterData.creator_id,
    photo_path: afterData.photo_path,
    photo_status: afterData.photo_status,
  } : null;

  // Audit log the action
  await auditLog(supabase, {
    actorId: auth.userId,
    actorRole: auth.platformRole,
    action,
    resourceType: "donation_photo",
    resourceId: donationId,
    before,
    after,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  return json({ ok: true, status });
}