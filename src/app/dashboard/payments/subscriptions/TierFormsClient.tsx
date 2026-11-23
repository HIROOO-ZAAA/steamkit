"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import createStyles from "./new/new.module.css";
import editStyles from "./[id]/edit/edit.module.css";
import listStyles from "./subscriptions.module.css";

type TierDraft = {
  name: string;
  price: number;
  description: string | null;
  badgeColor: string;
};

type TierRecord = TierDraft & { id: string };

type TierFieldsProps = {
  styles: Readonly<Record<string, string>>;
  tier?: TierDraft;
};

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? fallback;
}

function fieldValue(form: HTMLFormElement, name: string) {
  const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
  return field?.value.trim() ?? "";
}

function readTierDraft(form: HTMLFormElement): TierDraft {
  return {
    name: fieldValue(form, "name"),
    price: Number(fieldValue(form, "price")),
    description: fieldValue(form, "description") || null,
    badgeColor: fieldValue(form, "badgeColor"),
  };
}

function TierFields({ styles, tier }: TierFieldsProps) {
  return (
    <section className={styles.card}>
      <h2 className={styles.sectionTitle}>Basic Info</h2>
      <label className={styles.label}>
        Tier Name
        <input
          name="name"
          className={styles.input}
          type="text"
          placeholder="e.g. Supporter, VIP, Founder"
          defaultValue={tier?.name}
          required
          maxLength={40}
        />
      </label>
      <label className={styles.label}>
        Price (USD / month)
        <input
          name="price"
          className={styles.input}
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={tier?.price}
          required
        />
      </label>
      <label className={styles.label}>
        Description
        <textarea
          name="description"
          className={`${styles.input} ${styles.textarea}`}
          rows={3}
          placeholder="What subscribers get at this tier..."
          defaultValue={tier?.description ?? ""}
        />
      </label>
      <label className={styles.label}>
        Badge Color
        <input
          name="badgeColor"
          className={styles.input}
          type="text"
          defaultValue={tier?.badgeColor ?? "#7c3aed"}
          placeholder="#7c3aed"
          pattern="^#[0-9a-fA-F]{6}$"
        />
      </label>
    </section>
  );
}

function BackLink() {
  return (
    <div className={createStyles.backRow}>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/subscriptions">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to tiers
        </Link>
      </Button>
    </div>
  );
}

export function CreateTierForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createTier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const payload = readTierDraft(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creator/billing/tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not create tier."));
      router.refresh();
      router.push("/dashboard/subscriptions");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create tier.");
      setBusy(false);
    }
  }

  return (
    <>
      <BackLink />
      <form onSubmit={(event) => void createTier(event)} className={createStyles.form}>
        <TierFields styles={createStyles} />
        {error ? <p className={createStyles.error} role="alert">{error}</p> : null}
        <div className={createStyles.formActions}>
          <Button type="submit" className={createStyles.submitBtn} disabled={busy}>
            <Plus size={16} aria-hidden="true" />
            Create Tier
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href="/dashboard/subscriptions">Cancel</Link>
          </Button>
        </div>
      </form>
    </>
  );
}

export function EditTierForm({ tier }: { tier: TierRecord }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function updateTier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const payload = readTierDraft(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/creator/billing/tiers/${tier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not update tier."));
      router.refresh();
      router.push("/dashboard/subscriptions");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update tier.");
      setBusy(false);
    }
  }

  return (
    <>
      <BackLink />
      <form onSubmit={(event) => void updateTier(event)} className={editStyles.form}>
        <TierFields styles={editStyles} tier={tier} />
        {error ? <p className={editStyles.error} role="alert">{error}</p> : null}
        <div className={editStyles.formActions}>
          <Button type="submit" className={editStyles.saveBtn} disabled={busy}>
            <Check size={16} aria-hidden="true" />
            Save Changes
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href="/dashboard/subscriptions">Cancel</Link>
          </Button>
          <DeleteTierButton
            tierId={tier.id}
            name={tier.name}
            redirectTo="/dashboard/subscriptions"
            className={editStyles.deleteBtn}
          />
        </div>
      </form>
    </>
  );
}

export function DeleteTierButton({
  tierId,
  name,
  redirectTo,
  className,
}: {
  tierId: string;
  name: string;
  redirectTo: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteTier() {
    if (busy) return;
    if (!window.confirm(`Delete "${name}"? This action cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/creator/billing/tiers/${tierId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response, "Could not delete tier."));
      router.refresh();
      router.push(redirectTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete tier.");
      setBusy(false);
    }
  }

  return (
    <span className={listStyles.deleteWrapper}>
      <Button
        type="button"
        variant="danger"
        size="sm"
        className={className}
        disabled={busy}
        onClick={() => void deleteTier()}
      >
        <Trash2 size={14} aria-hidden="true" />
        Delete
      </Button>
      {error ? <span className={listStyles.deleteError} role="alert">{error}</span> : null}
    </span>
  );
}
