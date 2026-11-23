import { createAdminClient } from "@/lib/supabase/admin";
import {
  requirePlatformAdmin,
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

/**
 * GET /api/admin/audit - List audit log entries
 * Requires platform_admin or higher
 */
export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
  const action = url.searchParams.get("action") || "";
  const resourceType = url.searchParams.get("resourceType") || "";
  const actorId = url.searchParams.get("actorId") || "";
  const since = url.searchParams.get("since") || "";

  try {
    const supabase = createAdminClient();

    let query = supabase
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) {
      query = query.eq("action", action);
    }
    if (resourceType) {
      query = query.eq("resource_type", resourceType);
    }
    if (actorId) {
      query = query.eq("actor_id", actorId);
    }
    if (since) {
      query = query.gte("created_at", since);
    }

    const { data, count, error } = await query;

    if (error) {
      return json({ error: "Failed to load audit logs." }, 500);
    }

    // Get actor usernames for display
    const actorIds = [...new Set((data || []).map((r: { actor_id: string | null }) => r.actor_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", actorIds as string[]);

    const usernameMap = new Map<string, string>();
    (profiles || []).forEach((p: { id: string; username: string }) => {
      usernameMap.set(p.id, p.username);
    });

    const entries = (data || []).map((r: {
      id: string;
      actor_id: string | null;
      actor_role: string;
      action: string;
      resource_type: string;
      resource_id: string;
      before: unknown;
      after: unknown;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
    }) => ({
      id: r.id,
      actorId: r.actor_id,
      actorUsername: r.actor_id ? usernameMap.get(r.actor_id) || null : null,
      actorRole: r.actor_role,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      before: r.before,
      after: r.after,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    }));

    // Get distinct actions and resource types for filter UI
    const { data: actions } = await supabase
      .from("audit_log")
      .select("action")
      .order("action", { ascending: true });
    const { data: resourceTypes } = await supabase
      .from("audit_log")
      .select("resource_type")
      .order("resource_type", { ascending: true });

    const distinctActions = [...new Set((actions || []).map((a: { action: string }) => a.action))];
    const distinctResourceTypes = [...new Set((resourceTypes || []).map((r: { resource_type: string }) => r.resource_type))];

    return json({
      entries,
      total: count || 0,
      limit,
      offset,
      filters: {
        actions: distinctActions,
        resourceTypes: distinctResourceTypes,
      },
    });
  } catch (error) {
    console.error("Audit log list error:", error);
    return json({ error: "Failed to load audit logs." }, 500);
  }
}