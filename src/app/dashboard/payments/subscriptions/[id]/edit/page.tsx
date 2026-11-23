import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import { EditTierForm } from "../../TierFormsClient";
import styles from "./edit.module.css";

export default async function EditTierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id: tierId } = await params;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: tier } = await supabase
    .from("subscription_tiers")
    .select("*")
    .eq("id", tierId)
    .eq("user_id", user.id)
    .single();

  if (!tier) notFound();

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Steam Kit // Community"
        title="Edit Subscription Tier"
        description={`Modifying "${tier.name}" — changes take effect immediately.`}
      />
      <EditTierForm
        tier={{
          id: tier.id,
          name: tier.name,
          price: tier.price,
          description: tier.description,
          badgeColor: tier.badge_color,
        }}
      />
    </div>
  );
}
