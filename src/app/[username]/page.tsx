"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Award, Heart, Medal, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPublicSupportersState } from "@/lib/public-supporters-state";
import type { Profile, TipSettings, Tip } from "@/lib/types";
import SteamKitMark from "@/components/ui/SteamKitMark";
import styles from "./creator.module.css";

interface PaymentIntent {
  paymentId: string;
  qrString: string;
  recipientName: string;
  expiresAt: string;
  status: "pending";
}

type PaymentState =
  | "pending"
  | "successful"
  | "failed"
  | "expired"
  | "review_required";

interface PaymentStatusResponse {
  status: PaymentState;
  donation?: Tip;
  retryAfterSeconds?: number;
  error?: string;
}

type PublicSupporterTip = Pick<Tip, "id" | "tipper_name" | "amount" | "currency">;

export default function PublicCreatorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const [profile, setProfile] = useState<Pick<
    Profile,
    | "id"
    | "username"
    | "display_name"
    | "avatar_url"
    | "banner_url"
    | "bio"
    | "stream_title"
  > | null>(null);
  const [tipSettings, setTipSettings] = useState<TipSettings | null>(null);
  const [recentTips, setRecentTips] = useState<PublicSupporterTip[]>([]);
  const [supportersUnavailable, setSupportersUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"tip" | "leaderboard">("tip");

  const [tipperName, setTipperName] = useState("");
  const [amount, setAmount] = useState<string>("5");
  const [currency, setCurrency] = useState("USD");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(
    null,
  );
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const [paymentPollError, setPaymentPollError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    async function loadCreatorData() {
      // Fetch creator profile by username
      const { data: profData } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url, banner_url, bio, stream_title",
        )
        .eq("username", username.toLowerCase())
        .single();

      if (!profData) {
        setLoading(false);
        return;
      }

      setProfile(profData);

      // Fetch tip settings
      const { data: settingsData } = await supabase
        .from("tip_settings")
        .select("*")
        .eq("user_id", profData.id)
        .single();

      if (settingsData) {
        setTipSettings(settingsData);
        setCurrency(settingsData.currency || "USD");
        if (
          settingsData.suggested_amounts &&
          settingsData.suggested_amounts.length > 0
        ) {
          const firstPreset = settingsData.suggested_amounts.find(
            (value: number) => Number(value) > 0,
          );
          if (firstPreset !== undefined) setAmount(String(firstPreset));
        }
      }

      // The public page gets only successful supporter names and amounts from
      // a username-scoped RPC; private donor messages never leave the DB.
      const { data: tipsData, error: supportersError } = await supabase.rpc(
        "streamkit_get_public_creator_supporters",
        { p_username: username.toLowerCase(), p_limit: 10 },
      );

      if (supportersError) {
        setSupportersUnavailable(true);
      } else if (tipsData) {
        setSupportersUnavailable(false);
        setRecentTips(tipsData as PublicSupporterTip[]);
      }

      setLoading(false);
    }

    loadCreatorData();
  }, [supabase, username]);

  const paymentId = paymentIntent?.paymentId ?? null;

  useEffect(() => {
    if (!paymentId || paymentState !== "pending") return;

    let cancelled = false;
    let timer: number | undefined;

    async function checkPayment() {
      try {
        const response = await fetch(`/api/payments/${paymentId}/status`, {
          cache: "no-store",
        });
        const result = (await response.json()) as PaymentStatusResponse;
        if (!response.ok && response.status !== 429) {
          throw new Error(result.error || "Unable to check payment status.");
        }
        if (cancelled) return;

        setPaymentPollError("");
        if (result.status === "successful") {
          setPaymentState("successful");
          if (result.donation) {
            setRecentTips((current) =>
              [
                {
                  id: result.donation!.id,
                  tipper_name: result.donation!.tipper_name,
                  amount: result.donation!.amount,
                  currency: result.donation!.currency,
                },
                ...current.filter((tip) => tip.id !== result.donation!.id),
              ].slice(0, 10),
            );
          }
          return;
        }

        if (result.status !== "pending") {
          setPaymentState(result.status);
          return;
        }

        timer = window.setTimeout(
          checkPayment,
          Math.max(3000, (result.retryAfterSeconds || 5) * 1000),
        );
      } catch (pollingError) {
        if (cancelled) return;
        setPaymentPollError(
          pollingError instanceof Error
            ? pollingError.message
            : "Payment verification is temporarily unavailable.",
        );
        timer = window.setTimeout(checkPayment, 10000);
      }
    }

    void checkPayment();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [paymentId, paymentState]);

  async function handleSendTip(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setPaymentPollError("");

    try {
      if (!profile) throw new Error("Creator not found");

      const parsedAmount = parseFloat(amount);
      const minAmount = tipSettings?.min_tip_amount || 1.0;

      if (isNaN(parsedAmount) || parsedAmount < minAmount) {
        throw new Error(
          `Minimum tip amount is ${currency === "KHR" ? "៛" : "$"}${minAmount}`,
        );
      }

      if (currency === "KHR" && !Number.isInteger(parsedAmount)) {
        throw new Error("KHR amounts must be whole numbers.");
      }

      const response = await fetch("/api/payments/khqr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          donorName: tipperName,
          amount: parsedAmount,
          currency,
          message,
          paymentMethod: "bakong",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to start payment.");

      setPaymentIntent(result as PaymentIntent);
      setPaymentState("pending");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send tip");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading creator profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.notFoundScreen}>
        <h1>Creator Not Found</h1>
        <p>No creator profile registered under @{username}.</p>
        <Link href="/" className="btn btn-primary">
          Back to Kit Steam
        </Link>
      </div>
    );
  }

  const suggestedAmounts = (tipSettings?.suggested_amounts ?? [2, 5, 10, 25]).filter(
    (value) => Number(value) > 0,
  );

  return (
    <div className={styles.page}>
      <div className={styles.bgGlow} />

      {/* Header Bar */}
      <header className={styles.header}>
        <div className="container">
          <div className={styles.headerInner}>
            <Link href="/" className={styles.logo}>
              <SteamKitMark size={30} />
              <span className="text-gradient">Nexus</span>
            </Link>
            <Link href="/auth" className="btn btn-ghost btn-sm">
              Creator Login ↗
            </Link>
          </div>
        </div>
      </header>

      <main
        className="container"
        style={{ padding: "3rem 1.5rem", position: "relative", zIndex: 2 }}
      >
        <div className={styles.wrapper}>
          {/* Creator Profile Header */}
          <div className={`${styles.profileCard} card`}>
            <div className={styles.avatar}>
              {(profile.display_name || profile.username || "C")
                .charAt(0)
                .toUpperCase()}
            </div>
            <h1 className={styles.displayName}>
              {profile.display_name || profile.username}
            </h1>
            <span className={styles.handle}>@{profile.username}</span>
            <p className={styles.streamTitle}>{profile.stream_title}</p>
            {profile.bio && <p className={styles.bio}>{profile.bio}</p>}
          </div>

          {/* Tab Nav: Tipping vs Leaderboard */}
          <div className={styles.tabNav}>
            <button
              className={`${styles.tabBtn} ${activeTab === "tip" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("tip")}
            >
              <Heart size={16} strokeWidth={1.8} /> Send Tip
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === "leaderboard" ? styles.activeTab : ""}`}
              onClick={() => setActiveTab("leaderboard")}
            >
              <Trophy size={16} strokeWidth={1.8} /> Top Supporters
            </button>
          </div>

          {activeTab === "tip" ? (
            /* Viewer Tipping Form */
            <div className={`${styles.tipCard} card card-glow`}>
              <div className={styles.formHeader}>
                <h2>
                  <Heart size={19} strokeWidth={1.8} /> Send a Tip &amp;
                  Livestream Alert
                </h2>
                <p>
                  After Bakong verifies your payment, an alert can appear on
                  stream.
                </p>
              </div>

              {/* Payment Method Selector */}
              <form onSubmit={handleSendTip} className={styles.form}>
                {!paymentIntent && (
                  <div className={styles.paymentNotice}>
                    <strong>Bakong KHQR</strong>
                    <p>
                      Payment is confirmed by Bakong before a stream alert is
                      created. Funds go to the configured Kit Steam account;
                      creator payouts are not automated yet.
                    </p>
                  </div>
                )}

                {paymentIntent ? (
                  <div className={styles.paymentStage}>
                    {paymentState === "successful" ? (
                      <div className="alert-success" role="status">
                        {tipSettings?.custom_thank_you ||
                          "Payment confirmed. Your support is on its way to the stream."}
                      </div>
                    ) : paymentState === "expired" ? (
                      <div className="alert-error" role="alert">
                        This QR code expired. Start again to create a new
                        payment request.
                      </div>
                    ) : paymentState === "failed" ? (
                      <div className="alert-error" role="alert">
                        Bakong reported that this payment failed. No tip was
                        recorded.
                      </div>
                    ) : paymentState === "review_required" ? (
                      <div className="alert-error" role="alert">
                        The payment details could not be matched safely. No tip
                        was recorded; contact support before retrying.
                      </div>
                    ) : (
                      <>
                        <div className={styles.qrFrame}>
                          <QRCodeSVG
                            value={paymentIntent.qrString}
                            size={220}
                            level="M"
                          />
                        </div>
                        <strong>
                          Scan to pay {amount} {currency}
                        </strong>
                        <span>Pay to {paymentIntent.recipientName}</span>
                        <span className={styles.pendingStatus} role="status">
                          <span aria-hidden="true" /> Waiting for Bakong
                          verification
                        </span>
                        <p className={styles.paymentExpiry}>
                          QR expires at{" "}
                          {new Date(
                            paymentIntent.expiresAt,
                          ).toLocaleTimeString()}
                          .
                        </p>
                        {paymentPollError && (
                          <p className={styles.pollError} role="status">
                            {paymentPollError} Retrying automatically.
                          </p>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setPaymentIntent(null);
                        setPaymentState(null);
                        setPaymentPollError("");
                      }}
                    >
                      {paymentState === "successful"
                        ? "Send another tip"
                        : "Cancel / change details"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="input-group">
                      <label className="input-label" htmlFor="tipper-name">
                        Your Name / Handle
                      </label>
                      <input
                        id="tipper-name"
                        type="text"
                        className="input"
                        placeholder="e.g. GamerFan42 or Anonymous"
                        value={tipperName}
                        onChange={(e) => setTipperName(e.target.value)}
                        disabled={submitting}
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">
                        Select Tip Amount ({currency})
                      </label>
                      <div className={styles.presetGrid}>
                        {suggestedAmounts.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            className={`${styles.presetBtn} ${parseFloat(amount) === preset ? styles.activePreset : ""}`}
                            onClick={() => setAmount(preset.toString())}
                          >
                            {currency === "KHR" ? `៛${preset}` : `$${preset}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="input-group">
                      <label className="input-label" htmlFor="custom-amount">
                        Custom Amount ({currency})
                      </label>
                      <input
                        id="custom-amount"
                        type="number"
                        step="0.50"
                        className="input"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                        disabled={submitting}
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label" htmlFor="message">
                        Message for Streamer (Read via Khmer TTS)
                      </label>
                      <textarea
                        id="message"
                        className="input"
                        placeholder="Type your message to appear on stream... (e.g. ជោគជ័យក្នុងការផ្សាយបន្តផ្ទាល់!)"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        maxLength={250}
                        disabled={submitting}
                      />
                      <span className={styles.charCount}>
                        {message.length} / 250 characters
                      </span>
                    </div>

                    {error && (
                      <div className="alert-error" role="alert">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="btn btn-primary btn-lg"
                      style={{ width: "100%" }}
                      disabled={submitting}
                      id="send-tip-btn"
                    >
                      {submitting
                        ? "Creating payment request..."
                        : `Generate Bakong QR (${currency === "KHR" ? "៛" : "$"}${amount || "0"})`}
                    </button>
                  </>
                )}
              </form>
            </div>
          ) : (
            /* Leaderboard Tab */
            <div className={`${styles.leaderboardCard} card`}>
              <div className={styles.leaderboardHeader}>
                <h2>
                  <Trophy size={19} strokeWidth={1.8} /> Top Supporter
                  Leaderboard
                </h2>
                <p>Hall of fame for supporters of @{profile.username}</p>
              </div>

              {getPublicSupportersState(supportersUnavailable, recentTips.length) !== "ready" ? (
                <div className={styles.emptyLeaderboard}>
                  <Trophy size={22} strokeWidth={1.8} aria-hidden="true" />
                  <p>
                    {supportersUnavailable
                      ? "Top supporters are temporarily unavailable. Please try again later."
                      : "No tips recorded yet. Be the first top supporter!"}
                  </p>
                </div>
              ) : (
                <div className={styles.leaderboardList}>
                  {recentTips.map((tip, idx) => (
                    <div key={tip.id} className={styles.leaderboardItem}>
                      <div className={styles.rankBadge}>
                        {idx === 0 ? (
                          <Trophy size={17} strokeWidth={1.8} />
                        ) : idx === 1 ? (
                          <Award size={17} strokeWidth={1.8} />
                        ) : idx === 2 ? (
                          <Medal size={17} strokeWidth={1.8} />
                        ) : (
                          `#${idx + 1}`
                        )}
                      </div>
                      <div className={styles.supporterInfo}>
                        <strong>{tip.tipper_name}</strong>
                      </div>
                      <div className={styles.supporterAmount}>
                        {tip.currency === "KHR"
                          ? `៛${tip.amount.toLocaleString()}`
                          : `$${tip.amount.toFixed(2)}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
