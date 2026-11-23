type DashboardProfileName = {
  display_name?: string | null;
  username?: string | null;
} | null;

export function getDashboardDisplayName(
  profile: DashboardProfileName,
  email?: string | null,
): string {
  const emailName = email?.split("@")[0]?.trim();

  return (
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    emailName ||
    "Creator"
  );
}
