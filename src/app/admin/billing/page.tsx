import { redirect } from "next/navigation";
import { getPlatformRole } from "@/lib/auth/getPlatformRole";
import { createAdminClient } from "@/lib/supabase/admin";
import BillingTiersClient, { type SubscriptionTier } from "./BillingTiersClient";

export const metadata = {
  title: "Billing - Subscription Tiers | Steam Kit",
};

async function fetchBillingData() {
  const supabase = createAdminClient();

  const [{ data: tiers }, { data: profiles }] = await Promise.all([
    supabase
      .from("subscription_tiers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("profiles")
      .select("id, username, display_name")
      .limit(200),
  ]);

  const profileMap = new Map<string, { username: string; display_name: string | null }>();
  (profiles || []).forEach((p: { id: string; username: string; display_name: string | null }) => {
    profileMap.set(p.id, { username: p.username, display_name: p.display_name });
  });

  const enrichedTiers: SubscriptionTier[] = (tiers || []).map((tier) => ({
    ...tier,
    creator: profileMap.get(tier.user_id) || null,
  }));

  return { tiers: enrichedTiers };
}

export default async function BillingTiersPage() {
  const ctx = await getPlatformRole();
  if (!ctx) redirect("/dashboard");
  if (ctx.platformRole === "viewer" || ctx.platformRole === "creator_admin" || ctx.platformRole === "support_admin") {
    redirect("/admin");
  }

  const { tiers } = await fetchBillingData();
  return <BillingTiersClient tiers={tiers} platformRole={ctx.platformRole} />;
}
