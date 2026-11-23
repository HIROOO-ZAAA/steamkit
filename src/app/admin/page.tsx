import { redirect } from "next/navigation";
import { getPlatformRole } from "@/lib/auth/getPlatformRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getDashboardDisplayName } from "@/lib/dashboard/display-name";
import { Users, KeyRound, History } from "lucide-react";

export const metadata = {
  title: "Admin Overview | Steam Kit",
};

interface HealthCheck {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  detail?: string;
}

interface AdminHealthData {
  checks: HealthCheck[];
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  totalLatencyMs: number;
}

interface AuditEntry {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
}

interface ConfigEntry {
  key: string;
  value: unknown;
  description?: string;
  updated_at?: string;
  updated_by?: string;
}

async function fetchAdminData(ctx: { userId: string; platformRole: string }) {
  const supabase = createAdminClient();

  const [{ data: healthData }, auditResult, configResult] = await Promise.all([
    supabase.rpc("streamkit_admin_health", {}).then(({ data }) => data || null),
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(5),
    supabase.from("platform_config").select("*").limit(5),
  ]);

  return {
    health: (healthData as AdminHealthData | null) || null,
    recentAudit: (auditResult?.data as AuditEntry[]) || [],
    recentConfig: (configResult?.data as ConfigEntry[]) || [],
  };
}

export default async function AdminOverviewPage() {
  const ctx = await getPlatformRole();
  if (!ctx) redirect("/dashboard");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", ctx.userId)
    .maybeSingle();

  const displayName = getDashboardDisplayName(profile, "");
  const adminData = await fetchAdminData(ctx);
  const { health, recentAudit, recentConfig } = adminData;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Admin</h1>
          <p className="text-muted-foreground mt-1">Platform-wide controls and status.</p>
        </div>
        <Badge variant={ctx.platformRole === "super_admin" ? "red" : "gray"} className="capitalize">
          {ctx.platformRole.replace(/_/g, " ")}
        </Badge>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><path d="M17 21v-2a4 4 0 0 0-4-4V5a4 4 0 0 0 4 4v9a4 4 0 0 0-4-4V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2-2h-2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-- pending</div>
            <p className="text-xs text-muted-foreground">Active admin sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-- pending</div>
            <p className="text-xs text-muted-foreground">Platform users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Config Items</CardTitle>
            <KeyRound size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentConfig?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Recent platform config entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Audit Log</CardTitle>
            <History size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentAudit?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Recent audit entries</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Platform Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {health?.checks?.length ? (
              health.checks.map((c: HealthCheck) => (
                <div key={c.name} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div className="font-medium">{c.name}</div>
                  <Badge
                    variant={
                      c.status === "healthy"
                        ? "green"
                        : c.status === "degraded"
                          ? "amber"
                          : "red"
                    }
                    className="capitalize"
                  >
                    {c.status}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">Health check pending.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAudit?.length > 0 ? (
                recentAudit.slice(0, 5).map((entry: AuditEntry) => (
                  <div key={entry.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <div className="font-medium text-sm">{entry.action}</div>
                      <div className="text-xs text-muted-foreground capitalize">{entry.resource_type}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No recent audit entries.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}