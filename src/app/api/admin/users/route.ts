import { createAdminClient } from "@/lib/supabase/admin";
import {
  requirePlatformAdmin,
  auditLog,
  getClientIp,
  getUserAgent,
  type PlatformRoleContext,
} from "@/lib/auth/requirePlatformRole";
import type { PlatformRole } from "@/lib/auth/platformRoles";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * GET /api/admin/users - List platform users with pagination and filtering
 * Requires platform_admin or higher
 */
export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
  const search = url.searchParams.get("search") || "";
  const role = url.searchParams.get("role") || "";

  try {
    const supabase = createAdminClient();

    // Build query for profiles
    let query = supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, stream_title, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    const { data: profiles, count, error } = await query;

    if (error) {
      return json({ error: "Failed to load users." }, 500);
    }

    // Get platform roles for each user
    const userIds = (profiles || []).map((p: { id: string }) => p.id);
    const { data: platformRoles } = await supabase
      .from("platform_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    const roleMap = new Map<string, string[]>();
    (platformRoles || []).forEach((r: { user_id: string; role: string }) => {
      if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
      roleMap.get(r.user_id)!.push(r.role as PlatformRole);
    });

    // Filter by role if specified
    let filtered = (profiles || []).map((p: { id: string; username: string; display_name: string; avatar_url: string; bio: string; stream_title: string; created_at: string }) => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      bio: p.bio,
      streamTitle: p.stream_title,
      createdAt: p.created_at,
      platformRoles: (roleMap.get(p.id) || []) as PlatformRole[],
    }));

    if (role) {
      filtered = filtered.filter((u: { platformRoles: PlatformRole[] }) =>
        u.platformRoles.includes(role as PlatformRole)
      );
    }

    // Audit log
    await auditLog(supabase, {
      actorId: auth.userId,
      actorRole: auth.platformRole,
      action: "view",
      resourceType: "users",
      resourceId: "list",
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });

    return json({
      users: filtered,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Admin users list error:", error);
    return json({ error: "Failed to load users." }, 500);
  }
}

/**
 * POST /api/admin/users - Grant or revoke platform roles
 * Requires platform_admin or higher
 */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (!auth) {
    return Response.json({ error: "Insufficient platform role." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const action = input.action === "revoke" ? "revoke" : "grant";
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const role = typeof input.role === "string" ? input.role.trim() : "";
  const expiresAt = typeof input.expiresAt === "string" ? input.expiresAt.trim() : null;

  if (!userId) {
    return json({ error: "User ID is required." }, 400);
  }

  const validRoles: PlatformRole[] = ["super_admin", "platform_admin", "billing_admin", "support_admin", "creator_admin", "viewer"];
  if (!validRoles.includes(role as PlatformRole)) {
    return json({ error: "Invalid platform role." }, 400);
  }

  // Only super_admin can grant super_admin or platform_admin
  if ((role === "super_admin" || role === "platform_admin") && auth.platformRole !== "super_admin") {
    return json({ error: "Only super_admin can grant administrative roles." }, 403);
  }

  try {
    const supabase = createAdminClient();

    if (action === "grant") {
      const { error } = await supabase
        .from("platform_roles")
        .upsert({
          user_id: userId,
          role: role as PlatformRole,
          granted_by: auth.userId,
          granted_at: new Date().toISOString(),
          expires_at: expiresAt || null,
        }, { onConflict: "user_id,role" });

      if (error) {
        return json({ error: "Failed to grant role." }, 500);
      }

      await auditLog(supabase, {
        actorId: auth.userId,
        actorRole: auth.platformRole,
        action: "grant_role",
        resourceType: "platform_role",
        resourceId: `${userId}:${role}`,
        after: { userId, role, expiresAt },
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });

      return json({ ok: true, action: "granted", role });
    } else {
      const { error } = await supabase
        .from("platform_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);

      if (error) {
        return json({ error: "Failed to revoke role." }, 500);
      }

      await auditLog(supabase, {
        actorId: auth.userId,
        actorRole: auth.platformRole,
        action: "revoke_role",
        resourceType: "platform_role",
        resourceId: `${userId}:${role}`,
        before: { userId, role },
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
      });

      return json({ ok: true, action: "revoked", role });
    }
  } catch (error) {
    console.error("Admin users modify error:", error);
    return json({ error: "Failed to modify user role." }, 500);
  }
}