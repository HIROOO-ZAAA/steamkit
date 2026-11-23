"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Users, CreditCard, Plus, Edit2, Trash2, DollarSign } from "lucide-react";

export type SubscriptionTier = {
  id: string;
  user_id: string;
  name: string;
  price: number;
  description: string | null;
  badge_color: string;
  created_at: string;
  creator?: { username: string; display_name: string | null } | null;
};

type Props = {
  tiers: SubscriptionTier[];
  platformRole: string;
};

function openModal(id: string) {
  const modal = document.getElementById(id);
  modal?.classList.remove("hidden");
  (modal?.querySelector('input[name="name"]') as HTMLInputElement | null)?.focus();
}

function closeModal(id: string) {
  document.getElementById(id)?.classList.add("hidden");
}

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error ?? fallback;
}

export default function BillingTiersClient({ tiers, platformRole }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createTier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/billing/tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: String(form.get("userId") ?? "").trim(),
          name: String(form.get("name") ?? "").trim(),
          price: Number(form.get("price")),
          description: String(form.get("description") ?? "").trim() || null,
          badgeColor: String(form.get("badgeColor") ?? "").trim(),
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not create tier."));
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create tier.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/billing/tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId: String(form.get("tierId") ?? ""),
          userId: String(form.get("userId") ?? ""),
          name: String(form.get("name") ?? "").trim(),
          price: Number(form.get("price")),
          description: String(form.get("description") ?? "").trim() || null,
          badgeColor: String(form.get("badgeColor") ?? "").trim(),
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not update tier."));
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update tier.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTier(tier: SubscriptionTier) {
    if (busy) return;
    const confirmed = window.confirm(
      `Delete "${tier.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/billing/tiers/${tier.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readError(response, "Could not delete tier."));
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete tier.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscription Tiers</h1>
          <p className="text-muted-foreground mt-1">Manage creator membership tiers and pricing.</p>
        </div>
        <Badge variant={platformRole === "super_admin" ? "red" : "gray"} className="capitalize">
          {platformRole.replace(/_/g, " ")}
        </Badge>
      </header>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">All Tiers ({tiers.length})</h2>
        <Button onClick={() => openModal("create-tier-modal")} className="gap-2">
          <Plus size={16} />
          Create Tier
        </Button>
      </div>

      {tiers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="mx-auto text-muted-foreground mb-4" size={48} />
            <h3 className="text-lg font-medium mb-2">No subscription tiers yet</h3>
            <p className="text-muted-foreground mb-4">Create the first tier to enable creator memberships.</p>
            <Button onClick={() => openModal("create-tier-modal")} className="gap-2">
              <Plus size={16} />
              Create Tier
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tiers.map((tier) => (
            <Card key={tier.id} className="overflow-hidden">
              <div className="h-1 w-full" style={{ backgroundColor: tier.badge_color }} />
              <CardContent className="p-6">
                <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{tier.name}</h3>
                      <span
                        className="px-2 py-0.5 text-xs font-medium rounded-full"
                        style={{
                          backgroundColor: tier.badge_color + "20",
                          color: tier.badge_color,
                          border: `1px solid ${tier.badge_color}40`,
                        }}
                      >
                        ${tier.price.toFixed(2)}/mo
                      </span>
                    </div>
                    {tier.description ? (
                      <p className="text-sm text-muted-foreground">{tier.description}</p>
                    ) : null}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users size={14} />
                        {tier.creator?.display_name || tier.creator?.username || "Unknown creator"}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign size={14} />
                        ${tier.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openModal(`edit-tier-modal-${tier.id}`)}
                      aria-label={`Edit ${tier.name}`}
                    >
                      <Edit2 size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-400"
                      onClick={() => void deleteTier(tier)}
                      disabled={busy}
                      aria-label={`Delete ${tier.name}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div id="create-tier-modal" className="fixed inset-0 z-50 hidden">
        <div className="fixed inset-0 bg-black/50" onClick={() => closeModal("create-tier-modal")} />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <CardHeader className="p-0">
              <CardTitle>Create Subscription Tier</CardTitle>
            </CardHeader>
            <form onSubmit={(event) => void createTier(event)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Creator ID (UUID)</label>
                <Input name="userId" type="text" placeholder="Creator UUID" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tier Name</label>
                <Input name="name" type="text" placeholder="e.g., Premium Supporter" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Monthly Price (USD)</label>
                <Input name="price" type="number" step="0.01" min="0.01" placeholder="5.00" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description (optional)</label>
                <textarea name="description" rows={3} className="input w-full" placeholder="Tier benefits..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Badge Color</label>
                <Input name="badgeColor" type="color" defaultValue="#7c3aed" required />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1" disabled={busy}>Create Tier</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={() => closeModal("create-tier-modal")}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {tiers.map((tier) => (
        <div key={`edit-${tier.id}`} id={`edit-tier-modal-${tier.id}`} className="fixed inset-0 z-50 hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => closeModal(`edit-tier-modal-${tier.id}`)} />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <CardHeader className="p-0">
                <CardTitle>Edit Tier: {tier.name}</CardTitle>
              </CardHeader>
              <form
                id={`edit-tier-form-${tier.id}`}
                onSubmit={(event) => void updateTier(event)}
                className="space-y-4"
              >
                <input type="hidden" name="tierId" value={tier.id} />
                <input type="hidden" name="userId" value={tier.user_id} />
                <div>
                  <label className="block text-sm font-medium mb-1">Tier Name</label>
                  <Input name="name" type="text" defaultValue={tier.name} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Monthly Price (USD)</label>
                  <Input name="price" type="number" step="0.01" min="0.01" defaultValue={tier.price.toFixed(2)} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description (optional)</label>
                  <textarea name="description" rows={3} className="input w-full" defaultValue={tier.description || ""} placeholder="Tier benefits..." />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Badge Color</label>
                  <Input name="badgeColor" type="color" defaultValue={tier.badge_color} required />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1" disabled={busy}>Save Changes</Button>
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => closeModal(`edit-tier-modal-${tier.id}`)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
