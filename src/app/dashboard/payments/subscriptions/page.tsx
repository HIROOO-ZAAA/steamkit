import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CreditCard, Plus, Pencil, ExternalLink } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DeleteTierButton } from "./TierFormsClient";
import styles from "./subscriptions.module.css";

export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  // Fetch subscription tiers for this creator
  const { data: tiers } = await supabase
    .from("subscription_tiers")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Steam Kit // Community"
        title="Subscriptions"
        description="Manage membership tiers and recurring supporter plans."
        actions={
          <Button asChild>
            <Link href="/dashboard/subscriptions/new">
              <Plus size={16} aria-hidden="true" />
              Create Tier
            </Link>
          </Button>
        }
      />

      {tiers && tiers.length > 0 ? (
        <section className={styles.grid} aria-labelledby="tiers-title">
          <h2 id="tiers-title" className={styles.sectionTitle}>Your Tiers</h2>
          <ul className={styles.tierGrid}>
            {tiers.map((tier) => (
              <li key={tier.id} className={styles.tierCard}>
                <div className={styles.tierHeader} style={{ borderColor: tier.badge_color }}>
                  <div className={styles.tierBadge} style={{ backgroundColor: tier.badge_color }}>
                    {tier.name}
                  </div>
                  <span className={styles.tierPrice}>
                    ${tier.price.toFixed(2)}/month
                  </span>
                </div>
                {tier.description && (
                  <p className={styles.tierDescription}>{tier.description}</p>
                )}
                <div className={styles.tierMeta}>
                  <time dateTime={tier.created_at}>
                    Created {new Date(tier.created_at).toLocaleDateString()}
                  </time>
                </div>
                <div className={styles.tierActions}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dashboard/subscriptions/${tier.id}/edit`}>
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dashboard/subscriptions/${tier.id}/members`}>
                      <ExternalLink size={14} aria-hidden="true" />
                      View Members
                    </Link>
                  </Button>
                  <DeleteTierButton
                    tierId={tier.id}
                    name={tier.name}
                    redirectTo="/dashboard/subscriptions"
                    className={styles.deleteBtn}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className={styles.empty} aria-labelledby="subscriptions-empty-title">
          <span className={styles.icon} aria-hidden="true">
            <CreditCard size={24} strokeWidth={1.6} />
          </span>
          <h2 id="subscriptions-empty-title">No subscription tiers yet</h2>
          <p>
            Create your first membership tier to start building recurring revenue from
            your most dedicated supporters.
          </p>
          <Button asChild>
            <Link href="/dashboard/subscriptions/new">
              <Plus size={16} aria-hidden="true" />
              Create Your First Tier
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}