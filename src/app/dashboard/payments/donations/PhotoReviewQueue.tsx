"use client";

import { useState } from "react";
import { Check, ImageIcon, X } from "lucide-react";

export type DonationPhotoReviewItem = {
  id: string;
  donor_name: string;
  amount: number;
  currency: string;
  message: string | null;
  photo_path: string;
  photo_status: "pending" | "approved" | "rejected" | "none";
  created_at: string;
};

const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/donation-photos`;

function photoUrl(path: string) {
  return `${STORAGE_BASE}/${path}`;
}

function money(amount: number, currency: string) {
  const value = Number.isFinite(amount) ? Number(amount) : 0;
  return currency === "KHR" ? `${value.toLocaleString()}៛` : `$${value.toFixed(2)}`;
}

export default function PhotoReviewQueue({
  items,
}: {
  items: DonationPhotoReviewItem[];
}) {
  const [queue, setQueue] = useState<DonationPhotoReviewItem[]>(items);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    text: string;
    tone: "success" | "error";
  } | null>(null);

  async function review(item: DonationPhotoReviewItem, action: "approve" | "reject") {
    if (busyId) return;
    setBusyId(item.id);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/donation-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donationId: item.id, action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setFeedback({ text: data.error || "Update failed — try again.", tone: "error" });
        return;
      }
      setQueue((prev) => prev.filter((q) => q.id !== item.id));
      setFeedback({
        text:
          action === "approve"
            ? "Photo approved — it can now appear on the live overlay."
            : "Photo rejected — it will not appear on stream.",
        tone: "success",
      });
    } catch {
      setFeedback({ text: "Network error — try again.", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  if (queue.length === 0) {
    return (
      <section className="rounded-xl border border-dash-border bg-dash-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-rajdhani text-sm font-bold uppercase tracking-wider text-dash-text">
              <span className="mr-2 inline-block h-3 w-1 rounded bg-dash-accent align-middle" />
              Photo Review
            </h3>
            <p className="mt-1 text-xs text-dash-text-secondary">
              Approve donor photos before they are shown on the live stream
            </p>
          </div>
          <span className="rounded-full border border-dash-border bg-dash-raised px-3 py-1 font-mono text-xs text-dash-text-secondary">
            0 pending
          </span>
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-dash-border bg-dash-raised px-4 py-4 text-xs text-dash-text-muted">
          <ImageIcon size={14} aria-hidden="true" /> No photos waiting for review yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-dash-border bg-dash-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-rajdhani text-sm font-bold uppercase tracking-wider text-dash-text">
            <span className="mr-2 inline-block h-3 w-1 rounded bg-[color:var(--dash-warning)] align-middle" />
            Photo Review
          </h3>
          <p className="mt-1 text-xs text-dash-text-secondary">
            Approve donor photos before they are shown on the live stream
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--dash-warning-border)] bg-[color:var(--dash-warning-bg)] px-3 py-1 font-mono text-xs text-[color:var(--dash-warning)]">
          {queue.length} pending
        </span>
      </div>

      {feedback ? (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
            feedback.tone === "error"
              ? "border-[color:var(--dash-danger-border)] bg-[color:var(--dash-danger-bg)] text-[color:var(--dash-danger)]"
              : "border-[color:var(--dash-success-border)] bg-[color:var(--dash-success-bg)] text-[color:var(--dash-success)]"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {queue.map((item) => (
          <div
            key={item.id}
            className="overflow-hidden rounded-xl border border-dash-border bg-dash-raised"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl(item.photo_path)}
              alt={`Photo from ${item.donor_name}`}
              className="h-40 w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "data:image/svg+xml;charset=utf-8," +
                  encodeURIComponent(
                    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><rect width='100%' height='100%' fill='#0f172a'/><text x='50%' y='50%' fill='#94a3b8' font-family='monospace' font-size='14' text-anchor='middle'>photo unavailable</text></svg>`,
                  );
              }}
            />
            <div className="space-y-2 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-rajdhani text-sm font-bold text-dash-text">
                  {item.donor_name || "Anonymous"}
                </p>
                <span className="shrink-0 font-mono text-xs font-bold text-[color:var(--dash-success)]">
                  {money(item.amount, item.currency)}
                </span>
              </div>
              {item.message ? (
                <p className="line-clamp-2 text-xs text-dash-text-secondary">
                  “{item.message}”
                </p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void review(item, "approve")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--dash-success-border)] bg-[color:var(--dash-success-bg)] px-3 py-2 font-rajdhani text-xs font-bold uppercase tracking-wide text-[color:var(--dash-success)] transition-colors hover:border-[color:var(--dash-success)] disabled:opacity-50"
                >
                  <Check size={14} aria-hidden="true" /> Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void review(item, "reject")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--dash-danger-border)] bg-[color:var(--dash-danger-bg)] px-3 py-2 font-rajdhani text-xs font-bold uppercase tracking-wide text-[color:var(--dash-danger)] transition-colors hover:border-[color:var(--dash-danger)] disabled:opacity-50"
                >
                  <X size={14} aria-hidden="true" /> Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
