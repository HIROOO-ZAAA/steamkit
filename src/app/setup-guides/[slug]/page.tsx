import { notFound, redirect } from "next/navigation";
import { getGuide } from "../guides";

type GuideDeepLinkProps = {
  params: Promise<{ slug: string }>;
};

export default async function GuideDeepLink({ params }: GuideDeepLinkProps) {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) notFound();

  redirect(`/setup-guides?guide=${encodeURIComponent(guide.slug)}`);
}
