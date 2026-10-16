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
  const [feedback, setFeedback] = useState("");

  async function review(item: DonationPhotoReviewItem, action: "approve" | "reject") {
    if (busyId) return;
    setBusyId(item.id);
    setFeedback("");
    try {
      const res = await fetch("/api/admin/donation-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donationId: item.id, action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setFeedback(data.error || "Update failed — try again.");
        return;
      }
      setQueue((prev) => prev.filter((q) => q.id !== item.id));
      setFeedback(
        action === "approve"
          ? "Photo approved — it can now appear on the live overlay."
          : "Photo rejected — it will not appear on stream.",
      );
    } catch {
      setFeedback("Network error — try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (queue.length === 0) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-rajdhani text-sm font-bold uppercase tracking-wider text-white">
              <span className="mr-2 inline-block h-3 w-1 rounded bg-emerald-400 align-middle" />
              Photo Review
            </h3>
            <p className="text-xs text-slate-400">
              Approve donor photos before they are shown on the live stream
            </p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-mono text-slate-300">
            0 pending
          </span>
        </div>
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-4 text-xs text-slate-500">
          <ImageIcon size={14} /> No photos waiting for review yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-rajdhani text-sm font-bold uppercase tracking-wider text-white">
            <span className="mr-2 inline-block h-3 w-1 rounded bg-amber-400 align-middle" />
            Photo Review
          </h3>
          <p className="text-xs text-slate-400">
            Approve donor photos before they are shown on the live stream
          </p>
        </div>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-mono text-amber-400">
          {queue.length} pending
        </span>
      </div>

      {feedback ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-emerald-300"
        >
          {feedback}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {queue.map((item) => (
          <div
            key={item.id}
            className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50"
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
                    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><rect width='100%' height='100%' fill='#0f172a'/><text x='50%' y='50%' fill='#64748b' font-family='monospace' font-size='14' text-anchor='middle'>photo unavailable</text></svg>`,
                  );
              }}
            />
            <div className="space-y-2 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-rajdhani text-sm font-bold text-white">
                  {item.donor_name || "Anonymous"}
                </p>
                <span className="shrink-0 text-xs font-mono font-bold text-emerald-400">
                  {money(item.amount, item.currency)}
                </span>
              </div>
              {item.message ? (
                <p className="line-clamp-2 text-xs text-slate-400">
                  “{item.message}”
                </p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void review(item, "approve")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-rajdhani font-bold uppercase tracking-wide text-emerald-400 transition-all hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void review(item, "reject")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-rajdhani font-bold uppercase tracking-wide text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
                >
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}