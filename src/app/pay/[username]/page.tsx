"use client";

import React, { use, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  Dices,
  Ghost,
  Landmark,
  Lightbulb,
  Lock,
  MessageSquare,
  Mic,
  Timer,
  TriangleAlert,
  User,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  CreatorTipSettings,
  TipPaymentMethod,
  TipSettings,
} from "@/lib/types";
import { AbaLogo, BakongLogo } from "@/components/PaymentBrand";
import {
  DonorVoiceRecorder,
  type DonorVoice,
} from "@/components/DonorVoiceRecorder";

const USD_AMOUNTS = [0.1, 0.25, 0.5, 1, 5, 10];
const KHR_AMOUNTS = [4000, 10000, 20000, 40000, 100000, 200000];

type TipCurrency = "USD" | "KHR";
type PaymentStatus =
  | "pending"
  | "successful"
  | "failed"
  | "expired"
  | "review_required"
  | "cancelled"
  | "refunded";

interface PaymentStatusResponse {
  status?: PaymentStatus;
  awaitingConfirmation?: boolean;
  retryAfterSeconds?: number;
  error?: string;
}

/** Lifetime of a generated QR, in seconds. Drives the countdown ring. */
const QR_TTL = 300;

interface CurrencyLimit {
  min: number;
  max: number | null;
}

const DEFAULT_LIMITS: Record<TipCurrency, CurrencyLimit> = {
  USD: { min: 0.03, max: null },
  KHR: { min: 500, max: null },
};

function methodLabel(method: TipPaymentMethod | null | undefined) {
  return method === "bakong" ? "BAKONG" : "ABA PAYWAY";
}

const HOWTOS: { icon: LucideIcon; content: React.ReactNode }[] = [
  {
    icon: MessageSquare,
    content: (
      <p>
        Type your message in the <strong className="text-nexusPrimary">Remark</strong>{" "}
        field.
      </p>
    ),
  },
  {
    icon: User,
    content: (
      <div>
        <strong className="text-white block mb-0.5">
          Want a custom Nickname?
        </strong>
        <p>Format your remark exactly like this:</p>
        <code className="bg-nexusNeutral border border-nexusPrimary/30 text-nexusPrimary px-2 py-1 rounded block text-[13px] font-mono mt-1">
          ((Nickname)) Your Message
        </code>
        <ul className="list-disc list-inside text-[12px] space-y-1 mt-1.5 text-slate-400">
          <li>
            Min <span className="text-nexusPrimary font-bold">$1.00</span> (or
            4,000៛) to save a new nickname.
          </li>
          <li>
            Wait <span className="text-white font-bold">7d</span> between
            nickname changes.
          </li>
          <li>
            Donate <span className="text-nexusPrimary font-bold">$5.00+</span>{" "}
            to skip wait time.
          </li>
        </ul>
      </div>
    ),
  },
  {
    icon: Mic,
    content: (
      <div>
        <strong className="text-white block mb-0.5">
          Text-to-Speech (TTS)
        </strong>
        <p>
          Donate <span className="text-nexusPrimary font-bold">$0.50+</span> (or
          2,000៛) to read message out loud.
        </p>
      </div>
    ),
  },
  {
    icon: Dices,
    content: (
      <div>
        <strong className="text-white block mb-0.5">
          Spin Wheel Challenge
        </strong>
        <p>
          Donate <span className="text-nexusPrimary font-bold">$2.00+</span> to
          trigger wheel spin!
        </p>
      </div>
    ),
  },
  {
    icon: Ghost,
    content: (
      <div>
        <strong className="text-white block mb-0.5">
          Trigger a Jumpscare!
        </strong>
        <p>
          Donate <span className="text-nexusPrimary font-bold">$5.00+</span> to
          jump-scare streamer live.
        </p>
      </div>
    ),
  },
  {
    icon: Timer,
    content: (
      <div>
        <strong className="text-white block mb-0.5">Subathon</strong>
        <p>
          Adds time:{" "}
          <span className="text-nexusPrimary font-bold">
            10 sec per $1 USD
          </span>{" "}
          equivalent.
        </p>
      </div>
    ),
  },
];

export default function PublicTipPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);

  const [currency, setCurrency] = useState<TipCurrency>("USD");
  const [amountText, setAmountText] = useState("0.25");
  const [bankName, setBankName] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [message, setMessage] = useState("");
  const [voice, setVoice] = useState<DonorVoice | null>(null);
  const [tipperName, setTipperName] = useState("");
  const [qrString, setQrString] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [paymentStatusMessage, setPaymentStatusMessage] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrRecipient, setQrRecipient] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [creatorMissing, setCreatorMissing] = useState(false);
  const [profileCard, setProfileCard] = useState<{
    display_name: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    bio: string | null;
    stream_title: string | null;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [amountPulse, setAmountPulse] = useState(0);

  const [usdAmounts, setUsdAmounts] = useState<number[]>(USD_AMOUNTS);
  const [khrAmounts, setKhrAmounts] = useState<number[]>(KHR_AMOUNTS);
  const [limits, setLimits] = useState<Record<TipCurrency, CurrencyLimit>>(
    DEFAULT_LIMITS,
  );
  const [paymentLabel, setPaymentLabel] = useState(
    methodLabel("aba_payway"),
  );
  const [paymentMethods, setPaymentMethods] = useState<
    Record<TipCurrency, TipPaymentMethod>
  >({ USD: "aba_payway", KHR: "aba_payway" });
  const [abaLink, setAbaLink] = useState("");
  const [abaLinks, setAbaLinks] = useState<Record<TipCurrency, string>>({
    USD: "",
    KHR: "",
  });
  const [qrReady, setQrReady] = useState(false);
  const [qrBlockReason, setQrBlockReason] = useState("");
  const [bakongId, setBakongId] = useState("");

  useEffect(() => {
    if (!paymentId) return;

    let cancelled = false;
    let retryTimer: number | undefined;
    let activeController: AbortController | null = null;

    function scheduleRetry(seconds: number) {
      if (!cancelled) {
        retryTimer = window.setTimeout(
          () => void checkPaymentStatus(),
          (Number.isFinite(seconds) && seconds > 0 ? seconds : 5) * 1000,
        );
      }
    }

    async function checkPaymentStatus() {
      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await fetch(`/api/payments/${paymentId}/status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json().catch(() => ({}))) as PaymentStatusResponse;
        if (cancelled) return;

        if (response.status === 429 || response.status === 503 || response.status >= 500) {
          setPaymentStatusMessage(
            response.status === 503 || response.status >= 500
              ? "Payment verification is temporarily unavailable. Retrying automatically."
              : "Checking payment status. Retrying shortly.",
          );
          const headerRetry = Number(response.headers.get("Retry-After"));
          scheduleRetry(
            result.retryAfterSeconds ??
              (Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : 5),
          );
          return;
        }

        if (!response.ok) {
          setPaymentStatusMessage(
            result.error ?? "Unable to check payment status. Please try again later.",
          );
          return;
        }

        if (result.status === "successful") {
          setPaymentStatus("successful");
          setPaymentStatusMessage("Payment confirmed. Thank you for your support!");
          setPaymentId(null);
          return;
        }

        if (result.status === "pending") {
          setPaymentStatusMessage(
            result.awaitingConfirmation
              ? "Automatic confirmation is temporarily unavailable. Keep this page open while we continue checking."
              : qrExpiresAt !== null && Date.now() >= qrExpiresAt
                ? "The QR time has elapsed. Checking with the payment provider for a final result."
                : "Waiting for payment confirmation.",
          );
          scheduleRetry(result.retryAfterSeconds ?? 5);
          return;
        }

        if (
          result.status === "expired" ||
          result.status === "failed" ||
          result.status === "review_required" ||
          result.status === "cancelled" ||
          result.status === "refunded"
        ) {
          setPaymentStatus(result.status);
          setPaymentStatusMessage(
            result.status === "expired"
              ? "This payment request expired."
              : result.status === "review_required"
                ? "Payment details need review. Please contact the streamer before trying again."
                : result.status === "cancelled"
                  ? "The payment was cancelled."
                  : result.status === "refunded"
                    ? "This payment was refunded."
                  : "The payment could not be confirmed.",
          );
          setPaymentId(null);
          return;
        }

        setPaymentStatusMessage("Checking payment status.");
        scheduleRetry(result.retryAfterSeconds ?? 5);
      } catch {
        if (cancelled) return;
        setPaymentStatusMessage(
          "Payment verification is temporarily unavailable. Retrying automatically.",
        );
        scheduleRetry(10);
      } finally {
        if (activeController === controller) activeController = null;
      }
    }

    void checkPaymentStatus();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      activeController?.abort();
    };
  }, [paymentId, qrExpiresAt]);

  const supabase = createClient();
  const amounts = currency === "USD" ? usdAmounts : khrAmounts;
  const amount = Number(amountText);

  const selectCurrency = (next: TipCurrency) => {
    setCurrency(next);
    setPaymentLabel(methodLabel(paymentMethods[next]));
    setAbaLink(abaLinks[next]);
    const list = next === "USD" ? usdAmounts : khrAmounts;
    if (list.length) setAmountText(String(list[0]));
    setAmountPulse((p) => p + 1);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, banner_url, bio, stream_title")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      if (cancelled) return;
      // Without this, an old or mistyped handle renders an empty form and the
      // donor only finds out at checkout.
      if (!profile) {
        setCreatorMissing(true);
        return;
      }
      setProfileCard({
        display_name: profile.display_name ?? null,
        avatar_url: profile.avatar_url ?? null,
        banner_url: profile.banner_url ?? null,
        bio: profile.bio ?? null,
        stream_title: profile.stream_title ?? null,
      });

      const [{ data: tip }, { data: creator }] = await Promise.all([
        supabase
          .from("tip_settings")
          .select("*")
          .eq("user_id", profile.id)
          .maybeSingle(),
        supabase
          .from("creator_tip_settings")
          .select("*")
          .eq("creator_id", profile.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const settings = tip as TipSettings | null;
      const creatorSettings = creator as CreatorTipSettings | null;
      const active: TipCurrency = settings?.currency === "KHR" ? "KHR" : "USD";
      const live =
        Array.isArray(settings?.suggested_amounts) &&
        settings.suggested_amounts.length
          ? settings.suggested_amounts.map(Number).filter((v) => v > 0)
          : null;
      const clean = (
        values: Array<number | string> | null | undefined,
        fallback: number[],
      ) => {
        const parsed = (values ?? [])
          .map(Number)
          .filter((v) => Number.isFinite(v) && v > 0);
        return parsed.length ? parsed : fallback;
      };

      const nextUsd = clean(
        creatorSettings?.usd_presets ?? (active === "USD" ? live : null),
        USD_AMOUNTS,
      );
      const nextKhr = clean(
        creatorSettings?.khr_presets ?? (active === "KHR" ? live : null),
        KHR_AMOUNTS,
      );
      setUsdAmounts(nextUsd);
      setKhrAmounts(nextKhr);
      setAmountText(String((active === "USD" ? nextUsd : nextKhr)[0] ?? 0));
      setLimits({
        USD: {
          min: Number(
            creatorSettings?.min_amount_usd ??
              (active === "USD" ? settings?.min_tip_amount : null) ??
              DEFAULT_LIMITS.USD.min,
          ),
          max:
            creatorSettings?.usd_max_amount != null
              ? Number(creatorSettings.usd_max_amount)
              : null,
        },
        KHR: {
          min: Number(
            creatorSettings?.min_amount_khr ??
              (active === "KHR" ? settings?.min_tip_amount : null) ??
              DEFAULT_LIMITS.KHR.min,
          ),
          max:
            creatorSettings?.khr_max_amount != null
              ? Number(creatorSettings.khr_max_amount)
              : null,
        },
      });
      setPaymentLabel(
        methodLabel(
          active === "USD"
            ? creatorSettings?.usd_payment_method
            : creatorSettings?.khr_payment_method,
        ),
      );
      setPaymentMethods({
        USD: (creatorSettings?.usd_payment_method ??
          "aba_payway") as TipPaymentMethod,
        KHR: (creatorSettings?.khr_payment_method ??
          "aba_payway") as TipPaymentMethod,
      });
      const nextAbaLinks = {
        USD: creatorSettings?.aba_link_usd ?? "",
        KHR: creatorSettings?.aba_link_khr ?? "",
      };
      setAbaLinks(nextAbaLinks);
      setAbaLink(nextAbaLinks[active]);
      setBakongId(creatorSettings?.bakong_id ?? "");
      setMerchantName(
        (creatorSettings?.merchant_display_name ?? "").trim() ||
          (creator?.display_name ?? "").trim() ||
          "",
      );
      try {
        const provider = await fetch("/api/payments/aba-config");
        const providerData = (await provider.json()) as {
          qrReady?: boolean;
          reason?: string;
        };
        if (!cancelled) {
          setQrReady(Boolean(providerData.qrReady));
          setQrBlockReason(providerData.reason ?? "");
        }
      } catch {
        /* QR readiness stays false — link mode is fine */
      }
      setCurrency(active);
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [supabase, username]);

  // The countdown controls QR visibility; only server verification determines
  // the payment result.
  useEffect(() => {
    if (qrExpiresAt == null || paymentStatus !== "pending") return;
    const deadline = qrExpiresAt;
    let id: number | undefined;

    function tick() {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && id !== undefined) window.clearInterval(id);
      return left;
    }

    if (tick() > 0) id = window.setInterval(tick, 1000);
    return () => {
      if (id !== undefined) window.clearInterval(id);
    };
  }, [paymentStatus, qrExpiresAt]);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim()) {
      setError("Enter your EXACT bank account name first");
      return;
    }
    const { min, max } = limits[currency];
    const symbol = currency === "KHR" ? "៛" : "$";
    if (!Number.isFinite(amount) || amount < min) {
      setError(`Minimum tip is ${symbol}${min}.`);
      return;
    }
    if (max !== null && amount > max) {
      setError(`Maximum tip is ${symbol}${max}.`);
      return;
    }
    if (currency === "KHR" && !Number.isInteger(amount)) {
      setError("KHR amounts must be whole numbers.");
      return;
    }

    // Link-only mode: ABA selected but no QR credentials are configured, so
    // hand the donor over to the creator's saved ABA payment link.
    const method = paymentMethods[currency];
    if (method === "aba_payway" && !qrReady) {
      // A broken server must not masquerade as a working payment method:
      // showing the merchant link here would hide a deployment mistake.
      if (qrBlockReason === "server_unconfigured") {
        setError(
          "Payments are temporarily unavailable. Please try again later.",
        );
        return;
      }
      const link = abaLink.trim();
      if (/^https?:\/\//.test(link)) {
        const win = window.open(link, "_blank", "noopener,noreferrer");
        if (!win) window.location.href = link;
        return;
      }
      setError(
        "The streamer hasn't connected their ABA payment link yet. Try again later.",
      );
      return;
    }

    setLoading(true);
    setError("");
    try {
      // Upload the recording before opening the payment: the payment row only
      // stores a validated object path, so there has to be one to reference.
      let voicePath: string | null = null;
      let voiceDurationSeconds: number | null = null;
      if (voice) {
        const form = new FormData();
        form.append("audio", new File([voice.blob], "voice", { type: voice.blob.type }));
        form.append("durationSeconds", String(voice.durationSeconds));

        const upload = await fetch("/api/donation-voice", {
          method: "POST",
          body: form,
        });
        const uploaded = await upload.json().catch(() => ({}));
        if (!upload.ok) {
          setError(uploaded.error || "Could not upload your voice message.");
          return;
        }
        voicePath = uploaded.voicePath ?? null;
        voiceDurationSeconds = uploaded.durationSeconds ?? null;
      }

      const res = await fetch("/api/payments/khqr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          donorName: tipperName || bankName,
          amount,
          currency,
          message,
          youtubeUrl,
          paymentMethod: paymentMethods[currency],
          voicePath,
          voiceDurationSeconds,
        }),
      });
      const data = await res.json();
      if (data.qrImage || data.qrString) {
        if (typeof data.paymentId !== "string" || !data.paymentId) {
          setError("Payment was created but could not be tracked. Please contact the streamer before paying.");
          return;
        }
        const expires = data.expiresAt ? new Date(data.expiresAt).getTime() : NaN;
        const deadline = Number.isFinite(expires) ? expires : Date.now() + QR_TTL * 1000;
        setQrImage(data.qrImage ?? null);
        setQrString(data.qrString ?? null);
        setQrRecipient(
          typeof data.recipientName === "string" ? data.recipientName : "",
        );
        setPaymentStatus("pending");
        setPaymentStatusMessage("Waiting for payment confirmation.");
        setPaymentId(data.paymentId);
        setQrExpiresAt(deadline);
        setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      } else {
        setError(data.error || "Failed to generate KHQR");
      }
    } catch {
      setError("Error connecting to payment provider");
    } finally {
      setLoading(false);
    }
  };

  const initials = username.substring(0, 2).toUpperCase();
  const step = qrString || qrImage ? "khqr" : "form";

  if (creatorMissing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-nexusNeutral px-6 text-center font-inter">
        <div
          aria-hidden
          className="tip-aura left-[-80px] top-[120px] h-[360px] w-[360px] bg-nexusPrimary/15"
        />
        <p className="font-rajdhani text-xs font-bold uppercase tracking-[4px] text-nexusPrimary">
          Tip page unavailable
        </p>
        <h1 className="font-rajdhani text-3xl font-bold uppercase tracking-wider text-white sm:text-4xl">
          No creator at &ldquo;{username}&rdquo;
        </h1>
        <p className="max-w-sm text-sm text-slate-400">
          This tip link doesn&apos;t match any creator. Check the address, or ask
          the streamer for their current tip link.
        </p>
        <Link
          href="/"
          className="rounded-lg border border-nexusBorder px-5 py-2.5 font-rajdhani text-xs font-bold uppercase tracking-[2px] text-slate-300 transition-colors hover:border-nexusPrimary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexusPrimary"
        >
          Go to StreamKit
        </Link>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-nexusNeutral font-inter text-slate-50 selection:bg-nexusPrimary selection:text-nexusNeutral">
      {/* animated background aura */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="tip-aura left-[-80px] top-[120px] h-[360px] w-[360px] bg-nexusPrimary/20" />
        <div className="tip-aura-alt right-[-100px] top-[420px] h-[420px] w-[420px] bg-nexusPrimary/10" />
      </div>

      {/* 1. TOP CREATOR BANNER */}
      <div className="relative tip-rise bg-gradient-to-b from-nexusSecondary/70 via-nexusSecondary/25 to-nexusNeutral border-b border-nexusBorder px-4 py-12 text-center overflow-hidden">
        {/* Creator cover (profile-media upload). Decorative: the name and
            status below carry the meaning, so it is hidden from screen
            readers. */}
        {profileCard?.banner_url ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profileCard.banner_url}
              alt=""
              className="h-full w-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-nexusNeutral/25 via-nexusNeutral/45 to-nexusNeutral/90" />
          </div>
        ) : null}

        <div className="max-w-md mx-auto space-y-3 relative z-10">
          <div className="relative inline-block">
            <div className="w-24 h-24 rounded-2xl bg-nexusSurface border-2 border-nexusPrimary p-1 shadow-[0_0_25px_rgba(16,185,129,0.25)] mx-auto overflow-hidden">
              {profileCard?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profileCard.avatar_url}
                  alt={`${username} avatar`}
                  className="w-full h-full rounded-xl object-cover"
                />
              ) : (
                <div className="w-full h-full bg-nexusNeutral rounded-xl flex items-center justify-center font-rajdhani font-bold text-2xl text-nexusPrimary">
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-nexusPrimary" />
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-nexusPrimary" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-nexusPrimary" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-nexusPrimary" />
          </div>

          <div>
            <p className="font-rajdhani text-[13px] font-bold tracking-[2px] uppercase text-nexusPrimary">
              STEAM KIT // TIPPING
            </p>
            <h1 className="font-rajdhani text-3xl sm:text-4xl font-bold tracking-wider text-white uppercase">
              {username}
            </h1>
            <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-nexusPrimary animate-pulse" />
              <span className="font-rajdhani text-xs font-bold uppercase tracking-widest text-nexusPrimary">
                ACCEPTING TIPS
              </span>
              <span className="text-nexusBorder">•</span>
              <span className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-400">
                {paymentLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN CONTENT GRID */}
      <form
        onSubmit={handleContinue}
        className="max-w-[1280px] mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        {/* LEFT COLUMN: INSTRUCTIONS */}
        <div className="lg:col-span-3 space-y-6">
          <div className="tip-card tip-rise tip-rise-2 bg-nexusSurface border border-nexusBorder rounded-xl p-5 space-y-4">
            <h3 className="font-rajdhani text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2 border-b border-nexusBorder pb-3">
              <Lightbulb className="h-4 w-4 shrink-0 text-nexusPrimary" aria-hidden />
              How to show on stream:
            </h3>

            <div className="space-y-3.5 text-xs text-slate-400 leading-relaxed">
              {HOWTOS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={idx} className="flex items-start gap-2.5">
                    <Icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-nexusPrimary"
                      aria-hidden
                    />
                    {item.content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: PAYMENT FORM */}
        <div className="lg:col-span-6 space-y-6">
          <div className="tip-card tip-rise tip-rise-2 bg-nexusSurface border border-nexusBorder rounded-xl p-6 shadow-xl relative">
            {/* Currency Tabs */}
            <div className="relative flex border-b border-nexusBorder mb-6">
              <span
                aria-hidden
                className={`absolute bottom-[-1px] h-0.5 bg-nexusPrimary transition-all duration-300 ease-out ${
                  currency === "USD" ? "left-0 w-1/2" : "left-1/2 w-1/2"
                }`}
              />
              <button
                type="button"
                onClick={() => selectCurrency("USD")}
                className={`flex-1 pb-3 text-center font-rajdhani font-bold text-sm tracking-wider uppercase transition-all border-b-2 border-transparent ${
                  currency === "USD"
                    ? "text-nexusPrimary"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => selectCurrency("KHR")}
                className={`flex-1 pb-3 text-center font-rajdhani font-bold text-sm tracking-wider uppercase transition-all border-b-2 border-transparent ${
                  currency === "KHR"
                    ? "text-nexusPrimary"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                KHR (៛)
              </button>
            </div>

            {step === "form" ? (
              <div className="space-y-6">
                {/* Enter Amount */}
                <div
                  key={amountPulse}
                  className="tip-amount-pop bg-nexusNeutral border border-nexusBorder rounded-xl p-6 text-center relative group focus-within:border-nexusPrimary transition-all"
                >
                  <span className="font-rajdhani text-xs font-bold tracking-widest text-slate-400 uppercase block mb-2">
                    ENTER AMOUNT
                  </span>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-rajdhani text-3xl font-bold text-nexusPrimary">
                      {currency === "USD" ? "$" : "៛"}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Tip amount"
                      value={amountText}
                      onChange={(e) => setAmountText(e.target.value)}
                      className="bg-transparent font-rajdhani text-4xl font-bold text-white text-center focus:outline-none w-48"
                    />
                  </div>
                </div>

                {/* Presets */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {amounts.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setAmountText(String(v));
                        setAmountPulse((p) => p + 1);
                      }}
                      className={`bg-nexusNeutral border py-2.5 rounded-lg text-xs font-rajdhani font-bold transition-all ${
                        amount === v
                          ? "border-nexusPrimary text-nexusPrimary shadow-[0_0_14px_rgba(16,185,129,0.18)]"
                          : "border-nexusBorder text-white hover:border-nexusPrimary hover:text-nexusPrimary"
                      }`}
                    >
                      {currency === "USD" ? `$${v}` : `${v}៛`}
                    </button>
                  ))}
                </div>

                {/* YouTube Link */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/brand/youtube.png"
                        alt=""
                        width={14}
                        height={14}
                        className="h-3.5 w-3.5 shrink-0 rounded-sm"
                      />
                      YOUTUBE LINK (MEDIA SHARE)
                    </label>
                    <span className="text-[12px] text-slate-400 uppercase bg-nexusNeutral px-2 py-0.5 rounded border border-nexusBorder">
                      Optional
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="url"
                      placeholder="https://youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      className="w-full bg-nexusNeutral border border-nexusBorder rounded-xl px-4 py-3 pr-36 text-xs text-white focus:outline-none focus:border-nexusPrimary font-mono"
                    />
                    <div className="absolute right-2 top-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-lg text-[12px] font-rajdhani font-bold uppercase flex items-center gap-1 pointer-events-none">
                      <Lock className="h-3 w-3" aria-hidden /> Min $1.00
                      Required
                    </div>
                  </div>
                  <p className="text-[12px] text-slate-400">
                    Play a video on stream:{" "}
                    <span className="text-nexusPrimary">$1.00</span> = 10s •{" "}
                    <span className="text-nexusPrimary">$2.00</span> = 30s •{" "}
                    <span className="text-nexusPrimary">$5.00</span> = 60s
                  </p>
                </div>

                {/* Link YouTube Channel */}
                <div className="bg-nexusNeutral border border-nexusBorder p-3.5 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/youtube.png"
                      alt=""
                      width={22}
                      height={22}
                      className="h-[22px] w-[22px] shrink-0 rounded"
                    />
                    <div className="min-w-0">
                      <p className="font-rajdhani text-xs font-bold uppercase text-white">
                        YouTube media share
                      </p>
                      <p className="text-[12px] text-slate-400 truncate">
                        {youtubeUrl || "No video linked for this tip"}
                      </p>
                    </div>
                  </div>
                  {youtubeUrl ? (
                    <a
                      href={youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs font-rajdhani font-bold text-nexusPrimary"
                    >
                      Open ›
                    </a>
                  ) : null}
                </div>

                {/* Message / Remark */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-400">
                      MESSAGE / REMARK
                    </label>
                    <span className="text-[12px] text-slate-400 font-mono">
                      {message.length}/120
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={120}
                    placeholder="Add a message for the stream..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-nexusNeutral border border-nexusBorder rounded-xl p-3.5 text-xs text-white focus:outline-none focus:border-nexusPrimary resize-none"
                  />
                </div>

                {/* Voice message */}
                <DonorVoiceRecorder
                  value={voice}
                  onChange={setVoice}
                  disabled={loading}
                />

                {/* Your Name / Handle */}
                <div className="space-y-2">
                  <label className="font-rajdhani text-xs font-bold uppercase tracking-wider text-slate-400">
                    YOUR NAME / HANDLE
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GamerPro"
                    value={tipperName}
                    onChange={(e) => setTipperName(e.target.value)}
                    className="w-full bg-nexusNeutral border border-nexusBorder rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-nexusPrimary font-mono"
                  />
                </div>

                {error ? (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={loading || !bankName.trim()}
                  className="tip-btn w-full py-4 bg-nexusPrimary hover:bg-nexusSecondary text-nexusNeutral hover:text-white font-rajdhani font-bold text-base uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "PROCESSING..." : "CONTINUE TO PAY ➔"}
                </button>

                <p className="text-[12px] text-center text-slate-400 font-rajdhani uppercase tracking-wider flex items-center justify-center gap-1">
                  <Lock size={12} /> SECURE DIRECT PAYMENT
                </p>

                {abaLink ? (
                  <a
                    href={abaLink}
                    target="_blank"
                    rel="noreferrer"
                    className="tip-card bg-nexusNeutral border border-nexusBorder p-3.5 rounded-xl flex items-center justify-between hover:border-nexusPrimary/50 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <AbaLogo className="h-5 w-5" />
                      <div>
                        <p className="font-rajdhani text-xs font-bold uppercase text-white">
                          OR PAY WITH ABA PAYWAY
                        </p>
                        <p className="text-[12px] text-slate-400">
                          Open the merchant payment link in a new tab.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-rajdhani font-bold text-nexusPrimary">
                      Open ›
                    </span>
                  </a>
                ) : null}

                {bakongId ? (
                  <div className="tip-card bg-nexusNeutral border border-nexusBorder p-3.5 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <BakongLogo className="h-5 w-5" />
                      <div>
                        <p className="font-rajdhani text-xs font-bold uppercase text-white">
                          BAKONG ID
                        </p>
                        <p className="text-[12px] text-slate-400 font-mono">
                          {bakongId}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              /* QR STEP */
              <div className="flex flex-col items-center gap-6 py-2">
                <div className="text-center">
                  <p className="font-rajdhani text-[11px] font-bold uppercase tracking-[4px] text-nexusPrimary">
                    Scan to Pay
                  </p>
                  {/* PayWay and Bakong both embed their own merchant name inside
                      the QR payload (EMVCo tag 59) and neither API lets us
                      override it, so print the configured name above the QR.
                      The Bakong card below carries its own line. */}
                  {qrImage && merchantName ? (
                    <p className="mt-1 font-rajdhani text-base font-bold uppercase tracking-[2px] text-white">
                      {merchantName}
                    </p>
                  ) : null}
                </div>

                {paymentStatus === "pending" && secondsLeft > 0 ? (
                  qrImage ? (
                    /* PayWay returns a fully rendered KHQR card (banner, merchant,
                       amount, QR). Show it untouched instead of nesting our own
                       card around it. */
                    <div className="rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-nexusBorder/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrImage}
                        alt={`Payment QR code for ${currency === "KHR" ? amount.toLocaleString() : amount.toFixed(2)} ${currency}`}
                        width={256}
                        height={256}
                        decoding="async"
                        className="mx-auto h-auto w-[min(256px,70vw)] object-contain"
                      />
                    </div>
                  ) : (
                    /* Bakong hands back a QR string only, so we render the card. */
                    <div className="w-[min(288px,80vw)] overflow-hidden rounded-2xl bg-white shadow-2xl">
                      <div className="relative bg-rose-600 py-2.5 text-center">
                        <p className="font-rajdhani text-sm font-bold uppercase tracking-[6px] text-white">
                          KHQR
                        </p>
                        <div className="absolute right-0 top-0 h-full w-5 bg-rose-600 [clip-path:polygon(0_0,0_100%,100%_100%)]" />
                      </div>

                      <div className="px-6 pt-4 text-center">
                        <p className="font-rajdhani text-[13px] font-bold text-slate-800">
                          {username}
                          {qrRecipient ? ` by ${qrRecipient}` : ""}
                        </p>
                        <p className="mt-1.5 font-mono text-2xl font-bold leading-none text-slate-900 tabular-nums">
                          {currency === "KHR"
                            ? amount.toLocaleString()
                            : amount.toFixed(2)}{" "}
                          <span className="text-sm font-semibold text-slate-500">
                            {currency}
                          </span>
                        </p>
                        <div className="mt-4 border-t border-dashed border-slate-300" />
                      </div>

                      <div className="flex justify-center px-6 pb-6 pt-4">
                        <QRCodeSVG
                          value={qrString ?? ""}
                          size={280}
                          level="H"
                          className="h-auto w-[min(280px,82vw)]"
                        />
                      </div>
                    </div>
                  )
                ) : paymentStatus === "pending" ? (
                  <p className="max-w-sm text-center text-sm text-slate-300">
                    The QR time has elapsed. We are still checking the payment with the server.
                  </p>
                ) : null}

                {/* Countdown. tabular-nums stops the digits shifting the layout
                    every second; role=timer with a live label keeps screen
                    readers informed without a per-second announcement. */}
                {paymentStatus === "pending" ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="relative h-20 w-20">
                      <svg
                        viewBox="0 0 96 96"
                        className="absolute inset-0 h-full w-full -rotate-90 text-nexusPrimary"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <circle
                          cx="48"
                          cy="48"
                          r="42"
                          fill="none"
                          strokeWidth="6"
                          className="stroke-nexusBorder"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r="42"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 42}
                          strokeDashoffset={
                            2 * Math.PI * 42 *
                            (1 - Math.min(1, Math.max(0, secondsLeft / QR_TTL)))
                          }
                          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
                        />
                      </svg>
                      <span
                        role="timer"
                        aria-label={`${secondsLeft} seconds left on this QR code`}
                        aria-live="off"
                        className="absolute inset-0 grid place-items-center font-mono text-xl font-bold text-white tabular-nums"
                      >
                        {secondsLeft}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium uppercase tracking-[2px] text-slate-500">
                      {secondsLeft > 0
                        ? "seconds left"
                        : "payment status still being checked"}
                    </p>
                  </div>
                ) : null}

                {paymentStatusMessage ? (
                  <p
                    className="max-w-sm text-center text-sm text-slate-300"
                    role="status"
                    aria-live="polite"
                  >
                    {paymentStatusMessage}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setPaymentId(null);
                    setPaymentStatus(null);
                    setPaymentStatusMessage("");
                    setQrString(null);
                    setQrImage(null);
                    setQrExpiresAt(null);
                    setQrRecipient("");
                    setSecondsLeft(0);
                    setError("");
                  }}
                  className="rounded-lg border border-nexusBorder px-5 py-2 text-xs font-rajdhani font-bold uppercase tracking-[2px] text-slate-300 transition-colors hover:border-nexusPrimary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexusPrimary focus-visible:ring-offset-2 focus-visible:ring-offset-nexusNeutral"
                >
                  {paymentStatus === "successful" ? "Done" : "← Go Back"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: BANK NAME VERIFICATION */}
        <div className="lg:col-span-3 space-y-6">
          <div className="tip-card tip-rise tip-rise-4 bg-nexusSurface border border-nexusBorder rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-nexusBorder pb-3">
              <h3 className="font-rajdhani text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Landmark className="h-4 w-4 shrink-0 text-nexusPrimary" aria-hidden />
                EXACT BANK ACCOUNT NAME
              </h3>
              <span className="bg-nexusPrimary/10 text-nexusPrimary border border-nexusPrimary/30 text-[9px] font-rajdhani font-bold px-2 py-0.5 rounded uppercase">
                Required
              </span>
            </div>

            <div>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. CHEA LYHENG"
                className="w-full bg-nexusNeutral border border-nexusBorder focus:border-nexusPrimary rounded-xl px-3.5 py-2.5 text-xs text-white uppercase font-mono tracking-wider focus:outline-none"
              />
            </div>

            <div className="space-y-2.5 pt-3 border-t border-nexusBorder">
              <p className="font-rajdhani text-[11px] font-bold uppercase tracking-[2px] text-slate-400">
                Summary
              </p>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Paying</dt>
                  <dd className="font-rajdhani font-bold uppercase text-white">
                    {paymentLabel}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Currency</dt>
                  <dd className="font-mono font-bold text-nexusPrimary">
                    {currency}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Range</dt>
                  <dd className="font-mono text-white">
                    {currency === "KHR"
                      ? `${limits.KHR.min.toLocaleString()} – ${
                          limits.KHR.max ? limits.KHR.max.toLocaleString() : "∞"
                        }៛`
                      : `$${limits.USD.min.toFixed(2)} – ${
                          limits.USD.max ? limits.USD.max.toFixed(2) : "∞"
                        }`}
                  </dd>
                </div>
                {merchantName ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-400">Merchant</dt>
                    <dd className="font-rajdhani font-bold uppercase text-white text-right">
                      {merchantName}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          <div className="tip-card tip-card-danger tip-rise tip-rise-5 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-xs text-red-400 space-y-1.5">
            <p className="font-rajdhani font-bold uppercase flex items-center gap-1.5 text-red-300">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden /> Note:
            </p>
            <p className="text-[13px] leading-relaxed">
              Type your <strong>EXACT bank account name</strong> (DO NOT use a
              nickname, or a bank name like ABA, WING, ACLEDA here) to prevent
              lost messages.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
