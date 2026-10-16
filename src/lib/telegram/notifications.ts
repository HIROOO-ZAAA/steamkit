import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type DonationNotice = {
  paymentId: string;
  creatorId: string;
  donorName: string;
  amount: number;
  currency: "USD" | "KHR";
  message: string | null;
};

function formatAmount(amount: number, currency: DonationNotice["currency"]) {
  return currency === "KHR"
    ? `KHR ${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `USD $${amount.toFixed(2)}`;
}

function cleanText(value: string, maxLength: number) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function notifyCreatorTelegramDonation(notice: DonationNotice) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    const admin = createAdminClient();
    const { data: groups, error: groupsError } = await admin
      .from("telegram_groups")
      .select("id")
      .eq("creator_id", notice.creatorId)
      .eq("status", "active");
    if (groupsError || !groups?.length) return;

    const donor = cleanText(notice.donorName || "Anonymous", 80);
    const message = notice.message ? cleanText(notice.message, 300) : "";
    const text = [
      "NEW VERIFIED DONATION",
      `Donor: ${donor}`,
      `Amount: ${formatAmount(notice.amount, notice.currency)}`,
      "Method: ABA PayWay",
      message ? `Message: ${message}` : "",
      "Status: PAID",
    ]
      .filter(Boolean)
      .join("\n");

    await Promise.all(
      groups.map(async (group) => {
        const { data: claim, error: claimError } = await admin.rpc(
          "streamkit_claim_telegram_group_notification",
          {
            p_group_id: group.id,
            p_creator_id: notice.creatorId,
            p_payment_id: notice.paymentId,
          },
        );
        if (claimError || !claim?.event_id || !claim.chat_id) return;

        try {
          const response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: claim.chat_id, text }),
              cache: "no-store",
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!response.ok) throw new Error("Telegram rejected the message.");

          await admin
            .from("telegram_group_events")
            .update({
              metadata: { payment_id: notice.paymentId, status: "sent" },
            })
            .eq("id", claim.event_id);
          await admin
            .from("telegram_groups")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", group.id)
            .eq("status", "active");
        } catch {
          await admin
            .from("telegram_group_events")
            .update({
              metadata: { payment_id: notice.paymentId, status: "failed" },
            })
            .eq("id", claim.event_id);
        }
      }),
    );
  } catch {
    // Notifications must not change the outcome of a verified payment.
  }
}
