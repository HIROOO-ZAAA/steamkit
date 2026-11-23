import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

/**
 * Social preview for the public tip page.
 *
 * The page itself is a client component, so it cannot export metadata. This
 * layout is a server component and owns the Open Graph / Twitter tags that make
 * a shared link render a rich card on Facebook, Telegram, Discord and X.
 */
type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";

export async function generateMetadata({
  params,
}: LayoutProps): Promise<Metadata> {
  const { username } = await params;
  const handle = decodeURIComponent(username);

  let displayName = handle;
  let bio: string | null = null;
  let streamTitle: string | null = null;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, bio, stream_title")
      .eq("username", handle.toLowerCase())
      .maybeSingle();

    if (data) {
      displayName = data.display_name?.trim() || handle;
      bio = data.bio ?? null;
      streamTitle = data.stream_title ?? null;
    }
  } catch {
    // Metadata must never break the page; fall back to the handle.
  }

  const description =
    bio?.trim() ||
    streamTitle?.trim() ||
    `Send a tip to ${displayName} and trigger their live alerts.`;

  // The OG image route is relative so it resolves against the deployment host,
  // including preview deployments on other *.vercel.app domains.
  const ogImage = `/pay/${encodeURIComponent(handle)}/opengraph-image`;

  return {
    title: `${displayName} · Tip page`,
    description,
    openGraph: {
      title: `${displayName} · Tip page`,
      description,
      type: "profile",
      images: [{ url: ogImage, width: 1200, height: 630, alt: displayName }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} · Tip page`,
      description,
      images: [ogImage],
    },
    ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  };
}

export default async function TipLayout({ children, params }: LayoutProps) {
  await params;
  return children;
}