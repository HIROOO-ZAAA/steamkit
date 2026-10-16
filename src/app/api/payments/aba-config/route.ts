import { createAdminClient } from "@/lib/supabase/admin";
import {
  isAbaPaywayConfigured,
  loadAbaMerchantConfig,
} from "@/lib/payments/aba-payway";

export const runtime = "nodejs";

/**
 * Tells the pay page whether dynamic ABA QR generation is available for the
 * station. When it is not, the pay page falls back to redirecting donors to
 * the creator's saved ABA merchant payment link.
 *
 * "reason" separates "this station simply has no ABA API credentials" (a
 * normal setup, the merchant link is a fine fallback) from "the server cannot
 * reach its own database" (a deployment mistake that must not be hidden behind
 * a silent redirect).
 */
export async function GET() {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return Response.json(
      { qrReady: false, reason: "server_unconfigured" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  await loadAbaMerchantConfig(supabase);

  const ready = isAbaPaywayConfigured();
  return Response.json(
    { qrReady: ready, reason: ready ? "ok" : "no_credentials" },
    { headers: { "Cache-Control": "no-store" } },
  );
}