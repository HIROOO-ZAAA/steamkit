import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateDynamicKhqr,
  getBakongMerchant,
  loadBakongMerchantConfig,
} from "@/lib/payments/bakong";
import { allowPaymentRequest } from "@/lib/payments/rate-limit";
import {
  createAbaQr,
  createAbaTransactionId,
  isAbaPaywayConfigured,
  loadAbaMerchantConfig,
} from "@/lib/payments/aba-payway";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

interface TipLimits {
  min: number;
  max: number | null;
}

async function loadTipLimits(
  supabase: ReturnType<typeof createAdminClient>,
  creatorId: string,
  currency: "USD" | "KHR",
): Promise<TipLimits> {
  const [{ data: tipSettings }, { data: creatorSettings }] = await Promise.all([
    supabase
      .from("tip_settings")
      .select("min_tip_amount, currency")
      .eq("user_id", creatorId)
      .maybeSingle(),
    supabase
      .from("creator_tip_settings")
      .select("*")
      .eq("creator_id", creatorId)
      .maybeSingle(),
  ]);

  const defaultMin = currency === "USD" ? 0.03 : 500;
  const fallback =
    tipSettings && tipSettings.currency === currency
      ? Number(tipSettings.min_tip_amount)
      : defaultMin;
  const min = Number(
    (currency === "USD"
      ? creatorSettings?.min_amount_usd
      : creatorSettings?.min_amount_khr) ?? fallback,
  );
  const rawMax =
    currency === "USD" ? creatorSettings?.usd_max_amount : creatorSettings?.khr_max_amount;
  const max = rawMax == null ? null : Number(rawMax);

  return {
    min: Number.isFinite(min) && min > 0 ? min : defaultMin,
    max: max !== null && Number.isFinite(max) && max > 0 ? max : null,
  };
}

export async function POST(request: NextRequest) {
  // Keep an unconsumed copy so the ABA branch can re-read the JSON body.
  const bodyCopy = request.clone() as NextRequest;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid payment request.", 400);
  }

  if (!body || typeof body !== "object")
    return jsonError("Invalid payment request.", 400);
  const input = body as Record<string, unknown>;

  // Honor the per-creator payment method chosen in Currency Rules; fall back
  // to the global PAYMENT_PROVIDER env default when the client omits it.
  const requestedMethod =
    typeof input.paymentMethod === "string"
      ? input.paymentMethod.trim().toLowerCase()
      : "";
  const provider =
    requestedMethod === "aba_payway" || requestedMethod === "bakong"
      ? requestedMethod
      : process.env.PAYMENT_PROVIDER?.trim().toLowerCase() === "aba_payway"
        ? "aba_payway"
        : "bakong";

  if (provider === "aba_payway") {
    return createAbaPaywayPayment(bodyCopy);
  }

  const username =
    typeof input.username === "string"
      ? input.username.trim().toLowerCase()
      : "";
  const donorName =
    typeof input.donorName === "string"
      ? input.donorName.trim().slice(0, 60)
      : "";
  const message =
    typeof input.message === "string" ? input.message.trim().slice(0, 250) : "";
  const amount = Number(input.amount);
  const currency = input.currency;

  // Must match the character set the Identity Matrix allows when saving a
  // username (lowercase letters, digits, dot, underscore, hyphen). "@" is
  // tolerated because profiles saved before that sanitiser existed can still
  // hold email-style usernames.
  if (!/^[a-z0-9._@-]{2,64}$/.test(username))
    return jsonError("Invalid creator.", 400);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000)
    return jsonError("Enter a valid amount.", 400);
  if (currency !== "USD" && currency !== "KHR")
    return jsonError("Unsupported currency.", 400);
  if (currency === "KHR" && !Number.isInteger(amount))
    return jsonError("KHR amounts must be whole numbers.", 400);

  try {
    const supabase = createAdminClient();
    await loadBakongMerchantConfig(supabase);
    if (
      !(await allowPaymentRequest(supabase, request, "khqr-create", 6, 600))
    ) {
      return jsonError("Too many payment requests. Try again later.", 429);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("username", username)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return jsonError("Creator not found.", 404);

    const limits = await loadTipLimits(supabase, profile.id, currency);
    if (amount < limits.min) {
      return jsonError(`Minimum amount is ${limits.min} ${currency}.`, 400);
    }
    if (limits.max !== null && amount > limits.max) {
      return jsonError(`Maximum amount is ${limits.max} ${currency}.`, 400);
    }

    // Resolve the merchant identity: the creator's own Bakong account ID from
    // Dashboard -> Tips wins, otherwise fall back to the env-level config.
    const { data: creatorSettings } = await supabase
      .from("creator_tip_settings")
      .select("bakong_id")
      .eq("creator_id", profile.id)
      .maybeSingle();
    const creatorAccountId = (creatorSettings?.bakong_id ?? "").trim();
    const merchant = creatorAccountId
      ? {
          accountId: creatorAccountId,
          // Prefer the configured merchant name, then the creator's display
          // name. Never fall back to the username -- an email-style handle
          // like "duqin123gmail.com" would be printed on every QR and most
          // wallets truncate or reject it.
          accountName:
            process.env.BAKONG_MERCHANT_NAME?.trim() ||
            (profile.display_name ?? "").trim() ||
            "STREAMKIT",
          city: process.env.BAKONG_MERCHANT_CITY?.trim() || "PHNOM PENH",
        }
      : getBakongMerchant();

    if (!merchant) {
      return jsonError(
        "No Bakong merchant account. Add your Bakong account ID in Dashboard → Tips.",
        503,
      );
    }

    const paymentId = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const khqr = generateDynamicKhqr({
      paymentId,
      amount,
      currency,
      expiresAt,
      merchant,
    });
    const { error: insertError } = await supabase
      .from("payment_transactions")
      .insert({
        id: paymentId,
        creator_id: profile.id,
        donor_name: donorName || "Anonymous",
        amount,
        currency,
        message: message || null,
        provider: "bakong",
        provider_md5: khqr.md5,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) throw insertError;

    return Response.json(
      {
        paymentId,
        qrString: khqr.qrString,
        recipientName: khqr.recipientName,
        expiresAt: expiresAt.toISOString(),
        status: "pending",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    console.error("[payments/khqr] Bakong create failed:", reason);
    return jsonError(`Unable to create a payment request. ${reason}`, 503);
  }
}

async function createAbaPaywayPayment(request: NextRequest) {
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return jsonError(
      "Server payment configuration is incomplete (missing SUPABASE_SERVICE_ROLE_KEY).",
      503,
    );
  }
  await loadAbaMerchantConfig(supabase);

  if (!isAbaPaywayConfigured()) {
    return jsonError("ABA PayWay payments are not configured yet.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid payment request.", 400);
  }

  if (!body || typeof body !== "object")
    return jsonError("Invalid payment request.", 400);
  const input = body as Record<string, unknown>;
  const username =
    typeof input.username === "string"
      ? input.username.trim().toLowerCase()
      : "";
  const donorName =
    typeof input.donorName === "string"
      ? input.donorName.trim().slice(0, 60)
      : "";
  const message =
    typeof input.message === "string" ? input.message.trim().slice(0, 250) : "";
  const amount = Number(input.amount);
  const currency = input.currency;
  const photoPath =
    typeof input.photoPath === "string"
      ? input.photoPath.trim().slice(0, 160)
      : "";
  const photoSafe =
    photoPath !== "" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$/i.test(
      photoPath,
    )
      ? photoPath
      : "";

  // Same shape as photoSafe: an object path produced by POST /api/donation-voice,
  // re-validated here so a client cannot point the overlay at an arbitrary
  // bucket or smuggle a query string. Reject rather than silently drop -- a
  // donor who recorded a message should not watch it disappear at payment time.
  const voicePath =
    typeof input.voicePath === "string"
      ? input.voicePath.trim().slice(0, 160)
      : "";
  if (
    voicePath !== "" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|m4a|mp3|wav)$/i.test(
      voicePath,
    )
  ) {
    return jsonError("That voice message could not be read. Try recording again.", 400);
  }
  const voiceDurationRaw = Number(input.voiceDurationSeconds);
  const voiceDurationSeconds = Number.isFinite(voiceDurationRaw)
    ? Math.min(Math.max(Math.round(voiceDurationRaw), 1), 30)
    : null;

  // Must match the character set the Identity Matrix allows when saving a
  // username (lowercase letters, digits, dot, underscore, hyphen). "@" is
  // tolerated because profiles saved before that sanitiser existed can still
  // hold email-style usernames.
  if (!/^[a-z0-9._@-]{2,64}$/.test(username))
    return jsonError("Invalid creator.", 400);
  if (!Number.isFinite(amount) || amount > 1000000)
    return jsonError("Enter a valid amount.", 400);
  if (currency !== "USD" && currency !== "KHR")
    return jsonError("Unsupported currency.", 400);
  if (currency === "USD" && amount < 0.01)
    return jsonError("ABA PayWay requires at least 0.01 USD.", 400);
  if (currency === "KHR" && (!Number.isInteger(amount) || amount < 100))
    return jsonError("ABA PayWay requires at least 100 whole KHR.", 400);

  if (!(await allowPaymentRequest(supabase, request, "aba-create", 6, 600))) {
    return jsonError("Too many payment requests. Try again later.", 429);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (profileError) return jsonError("Unable to load creator.", 503);
  if (!profile) return jsonError("Creator not found.", 404);

  const limits = await loadTipLimits(supabase, profile.id, currency);
  if (amount < limits.min) {
    return jsonError(`Minimum amount is ${limits.min} ${currency}.`, 400);
  }
  if (limits.max !== null && amount > limits.max) {
    return jsonError(`Maximum amount is ${limits.max} ${currency}.`, 400);
  }

  const paymentId = randomUUID();
  const donationId = randomUUID();
  const tranId = createAbaTransactionId();
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const safeDonorName = donorName || "Anonymous";
  const { error: donationError } = await supabase.from("donations").insert({
    id: donationId,
    creator_id: profile.id,
    donor_name: safeDonorName,
    message: message || null,
    amount,
    currency,
    status: "pending",
    photo_path: photoSafe || null,
    photo_status: photoSafe ? "pending" : "none",
    voice_path: voicePath || null,
    voice_duration_seconds: voicePath ? voiceDurationSeconds : null,
  });
  if (donationError) return jsonError("Unable to start payment.", 503);

  const { error: paymentError } = await supabase
    .from("payment_transactions")
    .insert({
      id: paymentId,
      donation_id: donationId,
      creator_id: profile.id,
      donor_name: safeDonorName,
      amount,
      currency,
      message: message || null,
      provider: "aba_payway",
      tran_id: tranId,
      idempotency_key: randomUUID(),
      status: "pending",
      expires_at: expiresAt,
    });
  if (paymentError) {
    await supabase.from("donations").delete().eq("id", donationId);
    return jsonError("Unable to start payment.", 503);
  }

  try {
    const callbackUrl =
      process.env.ABA_PAYWAY_CALLBACK_URL ||
      new URL("/api/payments/webhook", request.url).toString();
    const qr = await createAbaQr({
      amount,
      currency,
      tranId,
      donorName: safeDonorName,
      callbackUrl,
    });

    const { error: updateError } = await supabase
      .from("payment_transactions")
      .update({
        status: "processing",
        qr_string: qr.qrString,
        qr_image: qr.qrImage,
        deeplink: qr.deeplink,
      })
      .eq("id", paymentId);
    if (updateError) throw updateError;

    await supabase
      .from("donations")
      .update({ status: "processing" })
      .eq("id", donationId);

    return Response.json(
      {
        paymentId,
        qrString: qr.qrString,
        qrImage: qr.qrImage,
        deeplink: qr.deeplink,
        recipientName: "ABA PayWay",
        expiresAt,
        status: "pending",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Surface the provider's own rejection reason. A generic "try again"
    // hides whether this is bad credentials, a bad callback URL, or a bad
    // request -- all of which look identical from the donor side.
    const reason = err instanceof Error ? err.message : "Unknown error";
    console.error("[payments/khqr] ABA PayWay create failed:", reason);
    await Promise.all([
      supabase
        .from("payment_transactions")
        .update({ status: "failed", failure_reason: "provider_request_failed" })
        .eq("id", paymentId),
      supabase.from("donations").update({ status: "failed" }).eq("id", donationId),
    ]);
    return jsonError(`Unable to create an ABA PayWay payment. ${reason}`, 503);
  }
}
