"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TokenRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/overlay/alerts?token=${encodeURIComponent(token)}`);
  }, [router, token]);

  return null;
}
