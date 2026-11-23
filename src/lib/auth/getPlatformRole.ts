import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PlatformRole } from "./platformRoles";

export interface AdminContext {
  userId: string;
  platformRole: PlatformRole;
}

/**
 * Resolve the caller's highest platform role from the server session.
 * Returns null when there is no authenticated user or no platform role.
 * Safe to call from server components and route handlers.
 */
export async function getPlatformRole(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  try {
    const adminClient = createAdminClient();
    const { data: role, error } = await adminClient.rpc(
      "streamkit_get_platform_role",
      { p_user_id: user.id },
    );

    if (error || !role) return null;

    return {
      userId: user.id,
      platformRole: role as PlatformRole,
    };
  } catch {
    return null;
  }
}