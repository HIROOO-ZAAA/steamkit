import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserCheck, UserX, Mail, ExternalLink } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import styles from "./members.module.css";

type Tier = {
  id: string;
  name: string;
  price: number;
  badge_color: string;
};

type Member = {
  id: string;
  user_id: string;
  status: "active" | "canceled" | "past_due" | "trialing";
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  profiles: {
    id: string;
    username: string;
    display_name: string | null;
    email: string | null;
  }[] | null;
};

export default async function TierMembersPage({
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

  // Verify tier ownership
  const { data: tier } = await supabase
    .from("subscription_tiers")
    .select("id, name, price, badge_color")
    .eq("id", tierId)
    .eq("user_id", user.id)
    .single();

  if (!tier) notFound();

  // Fetch members (subscriptions) for this tier
  const { data: members } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, status, current_period_end, cancel_at_period_end, created_at, profiles:user_id(id, username, display_name, email)",
    )
    .eq("tier_id", tierId)
    .order("created_at", { ascending: false });

  const activeMembers = members?.filter((m) => m.status === "active") ?? [];
  const inactiveMembers = members?.filter((m) => m.status !== "active") ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.backRow}>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/subscriptions">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to tiers
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow="Steam Kit // Community"
        title={`${tier.name} — Members`}
        description={`${activeMembers.length} active • ${inactiveMembers.length} inactive • $${tier.price.toFixed(2)}/month`}
        actions={
          <Button asChild>
            <Link href={`/dashboard/subscriptions/${tierId}/edit`}>
              <ExternalLink size={16} aria-hidden="true" />
              Edit Tier
            </Link>
          </Button>
        }
      />

      <div className={styles.tierBadge} style={{ backgroundColor: tier.badge_color }}>
        {tier.name}
      </div>

      <section className={styles.section} aria-labelledby="active-members">
        <h2 id="active-members" className={styles.sectionTitle}>
          Active Members ({activeMembers.length})
        </h2>
        {activeMembers.length > 0 ? (
          <ul className={styles.memberList}>
            {activeMembers.map((member) => {
              const profile = member.profiles?.[0];
              return (
                <li key={member.id} className={styles.memberItem}>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberAvatar}>
                      {profile?.display_name?.charAt(0) ||
                        profile?.username?.charAt(0) ||
                        "?"}
                    </div>
                    <div className={styles.memberDetails}>
                      <strong>
                        {profile?.display_name || profile?.username || "Unknown"}
                      </strong>
                      <span className={styles.memberMeta}>
                        @{profile?.username || "unknown"} •{" "}
                        {profile?.email || "no email"}
                      </span>
                      <span className={styles.memberMeta}>
                        Since {new Date(member.created_at).toLocaleDateString()} •{" "}
                        Renews {new Date(member.current_period_end).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className={styles.memberActions}>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`mailto:${profile?.email}`}>
                        <Mail size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                    <span className={`${styles.statusBadge} ${styles.statusActive}`}>
                      <UserCheck size={12} aria-hidden="true" />
                      Active
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.empty}>No active members yet.</p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="inactive-members">
        <h2 id="inactive-members" className={styles.sectionTitle}>
          Inactive Members ({inactiveMembers.length})
        </h2>
        {inactiveMembers.length > 0 ? (
          <ul className={styles.memberList}>
            {inactiveMembers.map((member) => {
              const profile = member.profiles?.[0];
              return (
                <li key={member.id} className={styles.memberItem}>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberAvatar}>
                      {profile?.display_name?.charAt(0) ||
                        profile?.username?.charAt(0) ||
                        "?"}
                    </div>
                    <div className={styles.memberDetails}>
                      <strong>
                        {profile?.display_name || profile?.username || "Unknown"}
                      </strong>
                      <span className={styles.memberMeta}>
                        @{profile?.username || "unknown"} •{" "}
                        {profile?.email || "no email"}
                      </span>
                      <span className={styles.memberMeta}>
                        Status: {member.status} •{" "}
                        {member.cancel_at_period_end
                          ? "Cancels at period end"
                          : `Ended ${new Date(member.current_period_end).toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                  <div className={styles.memberActions}>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`mailto:${profile?.email}`}>
                        <Mail size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                    <span className={`${styles.statusBadge} ${styles.statusInactive}`}>
                      <UserX size={12} aria-hidden="true" />
                      {member.status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.empty}>No inactive members.</p>
        )}
      </section>
    </div>
  );
}