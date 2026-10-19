export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = typeof ANALYTICS_PERIODS[number];

export type AnalyticsPayment = {
  amount: number;
  currency: "USD" | "KHR";
  provider: string;
  created_at: string;
};

export function normalizeAnalyticsPeriod(value: string | undefined): AnalyticsPeriod {
  const days = Number(value);
  return ANALYTICS_PERIODS.includes(days as AnalyticsPeriod) ? days as AnalyticsPeriod : 30;
}

export function analyticsPeriodStart(days: AnalyticsPeriod, now = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

export function summarizeAnalyticsPayments(payments: AnalyticsPayment[]) {
  const totals = { usd: 0, khr: 0, providerCounts: new Map<string, number>() };
  const dailyCounts = new Map<string, number>();
  for (const payment of payments) {
    const amount = Number(payment.amount);
    if (Number.isFinite(amount)) {
      if (payment.currency === "USD") totals.usd += amount;
      else if (payment.currency === "KHR") totals.khr += amount;
    }
    const provider = payment.provider.toLowerCase();
    totals.providerCounts.set(provider, (totals.providerCounts.get(provider) ?? 0) + 1);
    const date = new Date(payment.created_at);
    if (!Number.isNaN(date.getTime())) {
      const key = date.toISOString().slice(0, 10);
      dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
    }
  }
  return { ...totals, dailyCounts };
}

export function analyticsProviderLabel(value: string): string {
  switch (value.toLowerCase()) {
    case "aba_payway": return "ABA PayWay";
    case "bakong": return "Bakong";
    default: return "Other";
  }
}
