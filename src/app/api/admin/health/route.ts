import { createAdminClient } from "@/lib/supabase/admin";
import {
  requirePlatformAdmin,
  auditLog,
  getClientIp,
  getUserAgent,
} from "@/lib/auth/requirePlatformRole";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  detail?: string;
}

/**
 * GET /api/admin/health - Platform health metrics
 * Requires platform_admin or higher
 */
export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  const checks: HealthCheck[] = [];
  const start = Date.now();

  // Database check
  try {
    const supabase = createAdminClient();
    const dbStart = Date.now();
    const { error: dbError } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);
    checks.push({
      name: "database",
      status: dbError ? "unhealthy" : "healthy",
      latencyMs: Date.now() - dbStart,
      detail: dbError ? dbError.message : undefined,
    });

    // Payment transactions check
    const txStart = Date.now();
    const { count: txCount, error: txError } = await supabase
      .from("payment_transactions")
      .select("*", { count: "exact", head: true });
    checks.push({
      name: "payment_transactions",
      status: txError ? "unhealthy" : "healthy",
      latencyMs: Date.now() - txStart,
      detail: txError ? txError.message : `${txCount || 0} records`,
    });

    // Audit log check
    const auditStart = Date.now();
    const { count: auditCount, error: auditError } = await supabase
      .from("audit_log")
      .select("*", { count: "exact", head: true });
    checks.push({
      name: "audit_log",
      status: auditError ? "unhealthy" : "healthy",
      latencyMs: Date.now() - auditStart,
      detail: auditError ? auditError.message : `${auditCount || 0} records`,
    });

    // Platform roles check
    const rolesStart = Date.now();
    const { count: rolesCount, error: rolesError } = await supabase
      .from("platform_roles")
      .select("*", { count: "exact", head: true });
    checks.push({
      name: "platform_roles",
      status: rolesError ? "unhealthy" : "healthy",
      latencyMs: Date.now() - rolesStart,
      detail: rolesError ? rolesError.message : `${rolesCount || 0} grants`,
    });

    // Recent payment activity (last 24h)
    const recentStart = Date.now();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentTxs, error: recentError } = await supabase
      .from("payment_transactions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", yesterday);
    checks.push({
      name: "recent_transactions",
      status: recentError ? "degraded" : "healthy",
      latencyMs: Date.now() - recentStart,
      detail: recentError ? recentError.message : `${recentTxs || 0} in 24h`,
    });

    // Audit log the health check
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "view",
      resourceType: "health",
      resourceId: "platform",
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    const overallStatus = checks.every(c => c.status === "healthy")
      ? "healthy"
      : checks.some(c => c.status === "unhealthy")
        ? "unhealthy"
        : "degraded";

    return json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
      totalLatencyMs: Date.now() - start,
    });
  } catch (error) {
    console.error("Health check error:", error);
    return json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      checks: [{ name: "platform", status: "unhealthy", detail: "Health check failed" }],
      totalLatencyMs: Date.now() - start,
    }, 503);
  }
}