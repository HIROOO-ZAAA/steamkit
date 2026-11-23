/**
 * Platform role guard utilities for admin API routes
 * Uses service_role client to check platform_roles table
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getHighestRole, hasRole, PLATFORM_ROLES, type PlatformRole } from "./platformRoles";

export interface PlatformRoleContext {
  userId: string;
  platformRole: PlatformRole;
  isAdmin: boolean;
}

/**
 * Extract user from request and verify platform role
 * Returns null if not authenticated or insufficient role
 */
export async function requirePlatformRole(
  request: Request,
  minRole: PlatformRole
): Promise<PlatformRoleContext | null> {
  const userClient = await createServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return null;
  }

  try {
    const adminClient = createAdminClient();

    const { data: roleRows, error } = await adminClient
      .from("platform_roles")
      .select("role, expires_at")
      .eq("user_id", user.id);

    if (error) {
      console.error("Platform role check failed:", error);
      return null;
    }

    const now = Date.now();
    const activeRoles = (roleRows ?? [])
      .filter((row) => !row.expires_at || Date.parse(row.expires_at) > now)
      .map((row) => row.role)
      .filter((role): role is PlatformRole =>
        PLATFORM_ROLES.includes(role as PlatformRole)
      );
    const userPlatformRole = getHighestRole(activeRoles);

    if (!hasRole(userPlatformRole, minRole)) {
      return null;
    }

    const hasAccess = await checkRoleHierarchy(adminClient, user.id, minRole);

    if (!hasAccess) {
      return null;
    }

    return {
      userId: user.id,
      platformRole: userPlatformRole,
      isAdmin: hasRole(userPlatformRole, "platform_admin"),
    };
  } catch (error) {
    console.error("Platform role verification error:", error);
    return null;
  }
}

/**
 * Check if user has a platform role at or above minRole
 * Uses the database RPC for consistent hierarchy enforcement
 */
async function checkRoleHierarchy(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  minRole: PlatformRole
): Promise<boolean> {
  const { data, error } = await adminClient.rpc("streamkit_has_platform_role", {
    p_user_id: userId,
    p_min_role: minRole,
  });

  if (error) {
    console.error("Role hierarchy check failed:", error);
    return false;
  }

  return data === true;
}

/**
 * Require super_admin role (highest level)
 */
export async function requireSuperAdmin(
  request: Request
): Promise<PlatformRoleContext | null> {
  return requirePlatformRole(request, "super_admin");
}

/**
 * Require platform_admin or higher
 */
export async function requirePlatformAdmin(
  request: Request
): Promise<PlatformRoleContext | null> {
  return requirePlatformRole(request, "platform_admin");
}

/**
 * Require billing_admin or higher
 */
export async function requireBillingAdmin(
  request: Request
): Promise<PlatformRoleContext | null> {
  return requirePlatformRole(request, "billing_admin");
}

/**
 * Require support_admin or higher
 */
export async function requireSupportAdmin(
  request: Request
): Promise<PlatformRoleContext | null> {
  return requirePlatformRole(request, "support_admin");
}

/**
 * Require creator_admin or higher
 */
export async function requireCreatorAdmin(
  request: Request
): Promise<PlatformRoleContext | null> {
  return requirePlatformRole(request, "creator_admin");
}

/**
 * Create standardized error responses
 */
export function unauthorizedResponse(message = "Authentication required") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = "Insufficient platform role") {
  return Response.json({ error: message }, { status: 403 });
}

export function serviceUnavailableResponse(message = "Authorization service temporarily unavailable") {
  return Response.json({ error: message }, { status: 503 });
}

/**
 * Log admin action to audit_log via RPC
 */
export async function auditLog(
  adminClient: ReturnType<typeof createAdminClient>,
  params: {
    actorId: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string;
    before?: unknown;
    after?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    const { error } = await adminClient.rpc("streamkit_audit_log", {
      p_actor_id: params.actorId,
      p_actor_role: params.actorRole,
      p_action: params.action,
      p_resource_type: params.resourceType,
      p_resource_id: params.resourceId,
      p_before: params.before ?? null,
      p_after: params.after ?? null,
      p_ip_address: params.ipAddress ?? null,
      p_user_agent: params.userAgent ?? null,
    });

    if (error) {
      console.error("Audit log failed:", error);
    }
  } catch (error) {
    console.error("Audit log error:", error);
  }
}

/**
 * Extract client IP from request headers
 */
export function getClientIp(request: Request): string | undefined {
  // Check common proxy headers first
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback - may be undefined in some environments
  return undefined;
}

/**
 * Extract user agent from request
 */
export function getUserAgent(request: Request): string | undefined {
  return request.headers.get("user-agent") || undefined;
}

// Re-export for convenience
export { createAdminClient } from "@/lib/supabase/admin";
export { createClient as createServerClient } from "@/lib/supabase/server";