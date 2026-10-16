import "server-only";

import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function allowPaymentRequest(
  supabase: AdminClient,
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Payment service is not configured");

  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const fingerprint = createHmac("sha256", secret)
    .update(`${scope}:${address}`)
    .digest("hex");
  const { data, error } = await supabase.rpc(
    "streamkit_allow_payment_request",
    {
      p_fingerprint: fingerprint,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    },
  );

  if (error) throw error;
  return data === true;
}
