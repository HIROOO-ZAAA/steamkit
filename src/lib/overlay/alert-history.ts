export const ALERT_HISTORY_PAGE_SIZE = 20;

const ALLOWED_STATUSES = new Set([
  "completed",
  "successful",
  "test",
  "pending",
  "processing",
  "failed",
  "review_required",
]);
const ALLOWED_SOURCES = new Set(["aba", "bakong", "test", "other"]);

export type AlertHistoryFilters = {
  page: number;
  status: string;
  source: string;
  query: string;
};

export function normalizeAlertHistoryFilters(params: {
  page?: string;
  status?: string;
  source?: string;
  q?: string;
}): AlertHistoryFilters {
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(1, requestedPage), 10_000) : 1;
  const status = ALLOWED_STATUSES.has(params.status ?? "") ? params.status! : "all";
  const source = ALLOWED_SOURCES.has(params.source ?? "") ? params.source! : "all";
  // Search is intentionally restricted to payment source labels, not donor data.
  const query = (params.q ?? "").replace(/[^\p{L}\p{N} -]/gu, " ").trim().slice(0, 50);
  return { page, status, source, query };
}

export function alertHistorySourceLabel(value: unknown): string {
  const source = typeof value === "string" ? value.toLowerCase() : "";
  if (source.includes("aba")) return "ABA PayWay";
  if (source.includes("bakong")) return "Bakong";
  if (source === "test") return "Test alert";
  return "Other";
}

export function alertHistoryStatusLabel(value: unknown): string {
  switch (value) {
    case "completed":
    case "successful": return "Completed";
    case "test": return "Test";
    case "pending": return "Pending";
    case "processing": return "Processing";
    case "failed": return "Failed";
    case "review_required": return "Needs review";
    default: return "Unknown";
  }
}

export function alertHistoryStatusClass(value: unknown): string {
  switch (value) {
    case "completed":
    case "successful":
    case "test":
    case "pending":
    case "processing":
    case "failed":
    case "review_required":
      return `status_${value}`;
    default:
      return "status_unknown";
  }
}
