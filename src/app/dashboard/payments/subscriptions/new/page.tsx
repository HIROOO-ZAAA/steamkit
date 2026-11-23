import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import { CreateTierForm } from "../TierFormsClient";
import styles from "./new.module.css";

export default async function NewTierPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Steam Kit // Community"
        title="Create Subscription Tier"
        description="Define a membership tier, its price, and what it unlocks for subscribers."
      />
      <CreateTierForm />
    </div>
  );
}