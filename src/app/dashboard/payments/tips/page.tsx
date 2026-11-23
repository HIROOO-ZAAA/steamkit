"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  MonitorPlay,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CreatorTipSettings, TipPaymentMethod, TipSettings } from "@/lib/types";
import { AbaLogo, BakongLogo, MerchantLogo } from "@/components/PaymentBrand";
import PageHeader from "@/components/ui/PageHeader";

type Currency = "USD" | "KHR";

interface CurrencyConfig {
  method: TipPaymentMethod;
  presets: string[];
  min: string;
  max: string;
}

const PRESET_SLOTS = 5;
const DEFAULT_USD: CurrencyConfig = {
  method: "aba_payway",
  presets: ["0.05", "1", "2.5", "5", "50"],
  min: "0.03",
  max: "",
};
const DEFAULT_KHR: CurrencyConfig = {
  method: "bakong",
  presets: ["500", "4000", "20000", "50000", "100000"],
  min: "500",
  max: "",
};

const OPTIONAL_COLUMNS = [
  "usd_presets",
  "khr_presets",
  "usd_max_amount",
  "khr_max_amount",
  "usd_payment_method",
  "khr_payment_method",
  "aba_link_usd",
  "aba_link_khr",
  "bakong_id",
] as const;

const CARD =
  "rounded-xl border border-dash-border bg-dash-surface p-6";
const CARD_TITLE =
  "font-rajdhani text-lg font-bold uppercase tracking-wider text-dash-text";
const LABEL =
  "font-rajdhani block text-xs font-bold uppercase tracking-wider text-dash-text-secondary";
const INPUT =
  "w-full rounded-lg border border-dash-border bg-dash-raised px-3 py-2 font-mono text-xs text-dash-text outline-none transition-colors placeholder:text-dash-text-muted focus:border-dash-accent";
const ICON_BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-dash-text-muted transition-colors hover:bg-dash-hover hover:text-dash-accent";

interface AbaVerifyState {
  status: "idle" | "checking" | "verified" | "error";
  message: string;
  merchantName: string;
  category: string;
  logo: string;
  currency: string;
  description: string;
}

const IDLE_ABAVERIFY: AbaVerifyState = {
  status: "idle",
  message: "",
  merchantName: "",
  category: "",
  logo: "",
  currency: "",
  description: "",
};

function VerifyStatus({ state, url }: { state: AbaVerifyState; url: string }) {
  if (state.status === "error" && state.message) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--dash-danger)]">
        <AlertTriangle size={13} />
        {state.message}
      </p>
    );
  }

  if (state.status === "checking") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-dash-accent">
        <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />
        Checking link…
      </p>
    );
  }

  if (state.status === "verified") {
    return (
      <div className="mt-2 flex items-start gap-3 rounded-lg border border-[color:var(--dash-success-border)] bg-[color:var(--dash-success-bg)] p-3">
        {state.logo ? (
          <MerchantLogo
            src={state.logo}
            className="h-9 w-9 shrink-0 border border-dash-border"
          />
        ) : (
          <AbaLogo className="h-9 w-9 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-rajdhani text-sm font-bold uppercase text-dash-text">
            {state.merchantName || "ABA PayWay Merchant"}
          </p>
          <p className="truncate text-[13px] font-medium text-dash-accent">
            {[state.category, state.currency].filter(Boolean).join(" · ") ||
              "ABA Merchant"}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-dash-text-muted">{url}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--dash-success-border)] bg-dash-raised px-2 py-1 font-rajdhani text-[12px] font-bold uppercase tracking-wider text-dash-accent">
          <Check size={12} />
          Verified
        </span>
      </div>
    );
  }

  return (
    <p className="mt-2 text-[13px] text-dash-text-muted">
      Paste your ABA link — it checks automatically.
    </p>
  );
}

function MethodToggle({
  value,
  onChange,
}: {
  value: TipPaymentMethod;
  onChange: (next: TipPaymentMethod) => void;
}) {
  const options: { id: TipPaymentMethod; label: string; badge: ReactNode }[] = [
    { id: "aba_payway", label: "ABA PayWay", badge: <AbaLogo className="h-9 w-9" /> },
    { id: "bakong", label: "Bakong", badge: <BakongLogo className="h-9 w-9" /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 transition-colors ${
              selected
                ? "border-[color:var(--dash-accent)] bg-[color:var(--dash-success-bg)]"
                : "border-dash-border bg-dash-raised opacity-60 hover:opacity-100"
            }`}
          >
            {option.badge}
            <span className="font-rajdhani text-xs font-bold uppercase text-dash-text">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CurrencyCard({
  currency,
  value,
  isActive,
  onChange,
}: {
  currency: Currency;
  value: CurrencyConfig;
  isActive: boolean;
  onChange: (next: CurrencyConfig) => void;
}) {
  const isUsd = currency === "USD";
  const set = (patch: Partial<CurrencyConfig>) => onChange({ ...value, ...patch });

  const updatePreset = (index: number, next: string) => {
    const presets = [...value.presets];
    presets[index] = next;
    set({ presets });
  };

  return (
    <section
      className={`${CARD} transition-colors ${isActive ? "border-[color:var(--dash-accent)]" : ""}`}
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>
          <span className="text-dash-accent">{isUsd ? "$" : "៛"}</span> {currency}{" "}
          Settings
        </h2>
        {isActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--dash-success-border)] bg-[color:var(--dash-success-bg)] px-2.5 py-1 font-rajdhani text-[12px] font-bold uppercase tracking-wider text-dash-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-dash-accent" />
            Live on tip page
          </span>
        ) : (
          <span className="rounded-full border border-dash-border px-2.5 py-1 font-rajdhani text-[12px] font-bold uppercase tracking-wider text-dash-text-muted">
            Standby
          </span>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <span className={`${LABEL} mb-3 block`}>Payment Method</span>
          <MethodToggle value={value.method} onChange={(method) => set({ method })} />
        </div>

        <div>
          <span className={`${LABEL} mb-2 block`}>
            Preset Amounts ({isUsd ? "$" : "៛"}) — set to 0 to hide
          </span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {value.presets.map((preset, index) => (
              <div key={index} className="relative">
                {isUsd && (
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-dash-text-muted">
                    $
                  </span>
                )}
                <input
                  value={preset}
                  onChange={(event) => updatePreset(index, event.target.value)}
                  inputMode="decimal"
                  className={`${INPUT} text-center font-semibold ${
                    isUsd ? "pl-6 pr-2" : "pl-2 pr-6"
                  }`}
                />
                {!isUsd && (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-dash-text-muted">
                    ៛
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`${LABEL} mb-2`} htmlFor={`min-${currency}`}>
              Min Amount ({isUsd ? "$" : "៛"})
            </label>
            <input
              id={`min-${currency}`}
              value={value.min}
              inputMode="decimal"
              onChange={(event) => set({ min: event.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={`${LABEL} mb-2`} htmlFor={`max-${currency}`}>
              Max Amount ({isUsd ? "$" : "៛"})
            </label>
            <input
              id={`max-${currency}`}
              value={value.max}
              placeholder="No maximum"
              inputMode="decimal"
              onChange={(event) => set({ max: event.target.value })}
              className={INPUT}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function slotValues(
  list: Array<string | number> | null | undefined,
  fallback: string[],
): string[] {
  const source = (list ?? []).slice(0, PRESET_SLOTS).map(String);
  return fallback.map((value, index) => source[index] ?? value);
}

function amountText(values: unknown[], fallback: string): string {
  const found = values.find((value) => value !== null && value !== undefined);
  return found === undefined || found === null ? fallback : String(found);
}

export default function TipsSettingsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [needsMigration, setNeedsMigration] = useState(false);

  const [username, setUsername] = useState("");
  const [feedToken, setFeedToken] = useState("");
  const [showFeed, setShowFeed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [thankYou, setThankYou] = useState("");

  const [activeCurrency, setActiveCurrency] = useState<Currency>("USD");
  const [usd, setUsd] = useState<CurrencyConfig>(DEFAULT_USD);
  const [khr, setKhr] = useState<CurrencyConfig>(DEFAULT_KHR);
  const [abaUsd, setAbaUsd] = useState("");
  const [abaKhr, setAbaKhr] = useState("");
  const [bakongId, setBakongId] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [usdVerify, setUsdVerify] = useState<AbaVerifyState>(IDLE_ABAVERIFY);
  const [khrVerify, setKhrVerify] = useState<AbaVerifyState>(IDLE_ABAVERIFY);
  const usdTimerRef = useRef<number | null>(null);
  const khrTimerRef = useRef<number | null>(null);
  const usdReqRef = useRef(0);
  const khrReqRef = useRef(0);

  async function runAutoCheck(key: "usd" | "khr", rawValue: string) {
    const reqRef = key === "usd" ? usdReqRef : khrReqRef;
    const setResult = key === "usd" ? setUsdVerify : setKhrVerify;
    const myId = ++reqRef.current;
    const value = rawValue.trim();
    if (!value) {
      if (reqRef.current === myId) setResult(IDLE_ABAVERIFY);
      return;
    }

    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(value);
    } catch {
      parsedUrl = null;
    }
    if (!parsedUrl) {
      if (reqRef.current === myId)
        setResult({
          ...IDLE_ABAVERIFY,
          status: "error",
          message: "That is not a valid URL.",
        });
      return;
    }
    if (!parsedUrl.pathname || parsedUrl.pathname === "/") {
      if (reqRef.current === myId)
        setResult({
          ...IDLE_ABAVERIFY,
          status: "error",
          message: "A word is missing from the end of the URL.",
        });
      return;
    }

    setResult({ ...IDLE_ABAVERIFY, status: "checking" });
    try {
      const res = await fetch("/api/payments/aba/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = (await res.json()) as {
        verified?: boolean;
        merchantName?: string | null;
        category?: string | null;
        logo?: string | null;
        currency?: string | null;
        description?: string | null;
        error?: string;
      };
      if (reqRef.current !== myId) return;
      if (!res.ok || !data.verified) {
        setResult({
          ...IDLE_ABAVERIFY,
          status: "error",
          message: data.error || "Could not verify this ABA link.",
        });
        return;
      }
      setResult({
        status: "verified",
        message: "",
        merchantName: data.merchantName || "",
        category: data.category || "",
        logo: data.logo || "",
        currency: data.currency || "",
        description: data.description || "",
      });
      if (key === "usd") {
        setAbaUsd(value);
      } else {
        setAbaKhr(value);
      }
    } catch {
      if (reqRef.current === myId)
        setResult({
          ...IDLE_ABAVERIFY,
          status: "error",
          message: "Network error while checking the link. Try again.",
        });
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const tipsUrl = username ? `${origin}/pay/${username}` : "";
  const feedUrl = feedToken ? `${origin}/overlay/feed?token=${feedToken}` : "";

  useEffect(() => {
    let cancelled = false;

    async function missingOptionalColumns(): Promise<boolean> {
      const results = await Promise.all(
        OPTIONAL_COLUMNS.map(async (column) => {
          const { error } = await supabase
            .from("creator_tip_settings")
            .select(column)
            .limit(1);
          if (!error) return true;
          return !(error.code === "42703" || error.message.includes("does not exist"));
        }),
      );
      return !results.every(Boolean);
    }

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const [profile, credentials, tip, creator, pendingMigration] = await Promise.all([
          supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
          supabase
            .from("streamkit_overlay_credentials")
            .select("token")
            .eq("creator_id", user.id)
            .maybeSingle(),
          supabase.from("tip_settings").select("*").eq("user_id", user.id).maybeSingle(),
          supabase
            .from("creator_tip_settings")
            .select("*")
            .eq("creator_id", user.id)
            .maybeSingle(),
          missingOptionalColumns(),
        ]);
        if (cancelled) return;

        const settings = tip.data as TipSettings | null;
        const creatorSettings = creator.data as CreatorTipSettings | null;
        const active: Currency = settings?.currency === "KHR" ? "KHR" : "USD";
        const livePresets =
          Array.isArray(settings?.suggested_amounts) && settings.suggested_amounts.length
            ? settings.suggested_amounts.map(String)
            : null;
        const usdPresets =
          creatorSettings?.usd_presets ?? (active === "USD" ? livePresets : null);
        const khrPresets =
          creatorSettings?.khr_presets ?? (active === "KHR" ? livePresets : null);

        setUsername(profile.data?.username ?? "");
        setFeedToken(credentials.data?.token ?? "");
        setActiveCurrency(active);
        setThankYou(settings?.custom_thank_you ?? "");
        setNeedsMigration(pendingMigration);

        setUsd({
          method: creatorSettings?.usd_payment_method ?? DEFAULT_USD.method,
          presets: slotValues(usdPresets, DEFAULT_USD.presets),
          min: amountText(
            [creatorSettings?.min_amount_usd, active === "USD" ? settings?.min_tip_amount : null],
            DEFAULT_USD.min,
          ),
          max:
            creatorSettings?.usd_max_amount != null
              ? String(creatorSettings.usd_max_amount)
              : "",
        });

        setKhr({
          method: creatorSettings?.khr_payment_method ?? DEFAULT_KHR.method,
          presets: slotValues(khrPresets, DEFAULT_KHR.presets),
          min: amountText(
            [creatorSettings?.min_amount_khr, active === "KHR" ? settings?.min_tip_amount : null],
            DEFAULT_KHR.min,
          ),
          max:
            creatorSettings?.khr_max_amount != null
              ? String(creatorSettings.khr_max_amount)
              : "",
        });

        setAbaUsd(creatorSettings?.aba_link_usd ?? "");
        setAbaKhr(creatorSettings?.aba_link_khr ?? "");
        setBakongId(creatorSettings?.bakong_id ?? "");
        setMerchantName(creatorSettings?.merchant_display_name ?? "");
        if (creatorSettings?.aba_link_usd) {
          void runAutoCheck("usd", creatorSettings.aba_link_usd);
        }
        if (creatorSettings?.aba_link_khr) {
          void runAutoCheck("khr", creatorSettings.aba_link_khr);
        }
      } catch (err) {
        if (!cancelled) {
          setNotice({
            tone: "error",
            text: err instanceof Error ? err.message : "Failed to load tip settings.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (usdTimerRef.current !== null) window.clearTimeout(usdTimerRef.current);
      if (khrTimerRef.current !== null) window.clearTimeout(khrTimerRef.current);
    };
  }, [supabase]);

  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function handleAbaInput(key: "usd" | "khr", value: string) {
    if (key === "usd") {
      setAbaUsd(value);
      setUsdVerify(IDLE_ABAVERIFY);
    } else {
      setAbaKhr(value);
      setKhrVerify(IDLE_ABAVERIFY);
    }

    const timerRef = key === "usd" ? usdTimerRef : khrTimerRef;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const trimmed = value.trim();
    if (!trimmed) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void runAutoCheck(key, trimmed);
    }, 700);
  }

  async function handleSave() {
    setSaving(true);
    setNotice(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You are not signed in.");

      const validate = (config: CurrencyConfig, label: string) => {
        const min = parseNumber(config.min);
        if (min === null || min <= 0) {
          throw new Error(`${label} minimum must be a number greater than 0.`);
        }
        const max = config.max.trim() === "" ? null : parseNumber(config.max);
        if (config.max.trim() !== "" && max === null) {
          throw new Error(`${label} maximum must be a number.`);
        }
        if (max !== null && max < min) {
          throw new Error(`${label} maximum cannot be lower than the minimum.`);
        }
        const presets = config.presets.map((raw, index) => {
          const value = parseNumber(raw);
          if (value === null || value < 0) {
            throw new Error(
              `${label} preset ${index + 1} must be 0 or a positive number.`,
            );
          }
          if (label === "KHR" && !Number.isInteger(value)) {
            throw new Error(`${label} preset ${index + 1} must be a whole number.`);
          }
          return value;
        });
        if (label === "KHR" && !Number.isInteger(min)) {
          throw new Error("KHR minimum must be a whole number.");
        }
        if (max !== null && label === "KHR" && !Number.isInteger(max)) {
          throw new Error("KHR maximum must be a whole number.");
        }
        return { min, max, presets };
      };

      const usdValues = validate(usd, "USD");
      const khrValues = validate(khr, "KHR");
      const activeValues = activeCurrency === "USD" ? usdValues : khrValues;
      const livePresets = activeValues.presets.filter((value) => value > 0);
      if (!livePresets.length) {
        throw new Error(`At least one ${activeCurrency} preset must be greater than 0.`);
      }

      const { error: tipError } = await supabase.from("tip_settings").upsert(
        {
          user_id: user.id,
          currency: activeCurrency,
          min_tip_amount: activeValues.min,
          suggested_amounts: livePresets,
          custom_thank_you: thankYou.trim() || "Thank you for supporting the stream!",
        },
        { onConflict: "user_id" },
      );
      if (tipError) throw new Error(tipError.message);

      const payload: Record<string, unknown> = {
        creator_id: user.id,
        min_amount_usd: usdValues.min,
        min_amount_khr: khrValues.min,
        updated_at: new Date().toISOString(),
      };
      if (!needsMigration) {
        Object.assign(payload, {
          usd_presets: usdValues.presets,
          khr_presets: khrValues.presets,
          usd_max_amount: usdValues.max,
          khr_max_amount: khrValues.max,
          usd_payment_method: usd.method,
          khr_payment_method: khr.method,
          aba_link_usd: abaUsd.trim() || null,
          aba_link_khr: abaKhr.trim() || null,
          bakong_id: bakongId.trim() || null,
      merchant_display_name: merchantName.trim() || null,
        });
      }

      const { error: creatorError } = await supabase
        .from("creator_tip_settings")
        .upsert(payload, { onConflict: "creator_id" });
      if (creatorError) throw new Error(creatorError.message);

      setNotice({ tone: "success", text: "Tip settings saved. Your tip page is live." });
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Failed to save tip settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center font-rajdhani text-sm uppercase tracking-widest text-dash-text-muted">
        Loading tip settings…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
      <PageHeader
        eyebrow="Steam Kit // Tips"
        title="Tips & Payments"
        description="Your public tip page URL, payment rails and per-currency rules."
      />

      {needsMigration && (
        <div className="flex items-start gap-3 rounded-xl border border-[color:var(--dash-warning-border)] bg-[color:var(--dash-warning-bg)] px-4 py-3 text-sm text-[color:var(--dash-warning)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            Per-currency presets, payment methods and merchant links cannot be saved
            yet. Run{" "}
            <code className="rounded bg-dash-raised px-1.5 py-0.5 text-xs">
              supabase/migrations/20261016000000_tips_page_currency_settings.sql
            </code>{" "}
            in the Supabase SQL editor, then reload this page.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className={`${CARD}`}>
          <h2 className={`${CARD_TITLE} mb-6 flex items-center gap-2`}>
            <span className="text-dash-accent">
              <Link2 size={18} />
            </span>
            Tip and Live Feed URL
          </h2>

          <div className="space-y-5">
            <div>
              <span className={`${LABEL} mb-2 block`}>Tips URL</span>
              <div className="flex items-center gap-2 rounded-lg border border-dash-border bg-dash-raised px-3 py-2 transition-colors focus-within:border-dash-accent">
                <input
                  readOnly
                  value={tipsUrl}
                  placeholder="Set a username in your Profile first"
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-dash-text outline-none placeholder:text-dash-text-muted"
                />
                <button
                  type="button"
                  className={`${ICON_BTN} disabled:opacity-40`}
                  aria-label="Copy tips URL"
                  disabled={!tipsUrl}
                  onClick={() => copy(tipsUrl, "tips")}
                >
                  {copied === "tips" ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <a
                  className={`${ICON_BTN} ${tipsUrl ? "" : "pointer-events-none opacity-40"}`}
                  href={tipsUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open tips page"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <div>
              <span className={`${LABEL} mb-2 block`}>
                Live Feed URL (OBS Browser Source)
              </span>
              <div className="flex items-center gap-2 rounded-lg border border-dash-border bg-dash-raised px-3 py-2 transition-colors focus-within:border-dash-accent">
                <MonitorPlay size={15} className="shrink-0 text-dash-text-muted" />
                <input
                  readOnly
                  type={showFeed ? "text" : "password"}
                  value={feedUrl}
                  placeholder="Overlay token unavailable"
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-dash-text outline-none placeholder:text-dash-text-muted"
                />
                <button
                  type="button"
                  className={ICON_BTN}
                  aria-label={showFeed ? "Hide feed token" : "Show feed token"}
                  onClick={() => setShowFeed((visible) => !visible)}
                >
                  {showFeed ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  className={`${ICON_BTN} disabled:opacity-40`}
                  aria-label="Copy live feed URL"
                  disabled={!feedUrl}
                  onClick={() => copy(feedUrl, "feed")}
                >
                  {copied === "feed" ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <a
                  className={`${ICON_BTN} ${feedUrl ? "" : "pointer-events-none opacity-40"}`}
                  href={feedUrl || "#"}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open live feed"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className={`${CARD}`}>
          <h2 className={`${CARD_TITLE} mb-6 flex items-center gap-2`}>
            <span className="text-dash-accent">
              <CreditCard size={18} />
            </span>
            Merchant Credentials
          </h2>

          <div className="space-y-4">
            <div>
              <label className={`${LABEL} mb-1.5`} htmlFor="aba-usd">
                ABA Merchant Link (USD)
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-dash-border bg-dash-raised px-3 py-2 transition-colors focus-within:border-dash-accent">
                <AbaLogo className="h-6 w-6" />
                <input
                  id="aba-usd"
                  value={abaUsd}
                  onChange={(event) => handleAbaInput("usd", event.target.value)}
                  placeholder="https://link.payway.com.kh/..."
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-dash-text outline-none"
                />
                {usdVerify.status === "checking" ? (
                  <Loader2
                    size={14}
                    className="shrink-0 animate-spin motion-reduce:animate-none text-dash-accent"
                  />
                ) : null}
              </div>
              <VerifyStatus state={usdVerify} url={abaUsd} />
            </div>

            <div>
              <label className={`${LABEL} mb-1.5`} htmlFor="aba-khr">
                ABA Merchant Link (KHR)
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-dash-border bg-dash-raised px-3 py-2 transition-colors focus-within:border-dash-accent">
                <AbaLogo className="h-6 w-6" />
                <input
                  id="aba-khr"
                  value={abaKhr}
                  onChange={(event) => handleAbaInput("khr", event.target.value)}
                  placeholder="https://link.payway.com.kh/..."
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-dash-text outline-none"
                />
                {khrVerify.status === "checking" ? (
                  <Loader2
                    size={14}
                    className="shrink-0 animate-spin motion-reduce:animate-none text-dash-accent"
                  />
                ) : null}
              </div>
              <VerifyStatus state={khrVerify} url={abaKhr} />
            </div>

            <div>
              <label className={`${LABEL} mb-1.5`} htmlFor="bakong-id">
                Bakong ID
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-dash-border bg-dash-raised px-3 py-2 transition-colors focus-within:border-dash-accent">
                <BakongLogo className="h-6 w-6" />
                <input
                  id="bakong-id"
                  value={bakongId}
                  onChange={(event) => setBakongId(event.target.value)}
                  placeholder="Bakong Account ID"
                  className="min-w-0 flex-1 bg-transparent font-mono text-xs text-dash-text outline-none"
                />
              </div>
            </div>

            <div>
              <label className={`${LABEL} mb-1.5`} htmlFor="merchant-display-name">
                Merchant name on tip page
              </label>
              <input
                id="merchant-display-name"
                value={merchantName}
                onChange={(event) => setMerchantName(event.target.value)}
                placeholder="e.g. CHEA LYHENG 1"
                className="w-full rounded-lg border border-dash-border bg-dash-raised px-3 py-2 font-mono text-xs text-dash-text outline-none transition-colors focus:border-dash-accent"
              />
              <p className="mt-1.5 text-[12px] font-rajdhani uppercase tracking-wider text-dash-text-secondary">
                Printed above the QR. The name baked inside the QR itself comes
                from your PayWay / Bakong account and cannot be changed here.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={CARD_TITLE}>Currency Rules</h2>
        <div className="flex items-center gap-3">
          <span className="font-rajdhani text-xs font-bold uppercase tracking-wider text-dash-text-secondary">
            Tip page currency
          </span>
          <div className="flex rounded-lg border border-dash-border bg-dash-raised p-1">
            {(["USD", "KHR"] as Currency[]).map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => setActiveCurrency(currency)}
                className={`rounded-md px-4 py-1.5 font-rajdhani text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeCurrency === currency
                    ? "bg-dash-action text-[color:var(--dash-action-text)]"
                    : "text-dash-text-secondary hover:text-dash-text"
                }`}
              >
                {currency === "USD" ? "USD ($)" : "KHR (៛)"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CurrencyCard
          currency="USD"
          value={usd}
          isActive={activeCurrency === "USD"}
          onChange={setUsd}
        />
        <CurrencyCard
          currency="KHR"
          value={khr}
          isActive={activeCurrency === "KHR"}
          onChange={setKhr}
        />
      </div>

      {notice && (
        <div
          className={
            notice.tone === "error"
              ? "rounded-lg border border-[color:var(--dash-danger-border)] bg-[color:var(--dash-danger-bg)] px-4 py-3 text-sm text-[color:var(--dash-danger)]"
              : "rounded-lg border border-[color:var(--dash-success-border)] bg-[color:var(--dash-success-bg)] px-4 py-3 text-sm text-[color:var(--dash-success)]"
          }
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dash-border pt-5">
        <p className="text-xs text-dash-text-muted">
          The active currency decides what your public tip page accepts on load.
        </p>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-dash-action px-8 py-3 font-rajdhani text-sm font-bold uppercase tracking-widest text-[color:var(--dash-action-text)] transition-colors hover:bg-dash-action-hover motion-safe:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Tip Settings"}
        </button>
      </div>
    </div>
  );
}
