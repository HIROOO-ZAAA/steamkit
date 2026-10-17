import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Next 16 blocks cross-origin requests to its dev resources, including the
  // `/_next/hmr` websocket, and answers with a body that is not a valid
  // upgrade response. The dev server listens on `localhost`, so opening the
  // overlay at `http://127.0.0.1:3000` — which is what OBS is configured with,
  // and what browser-source URLs are built from — is treated as cross-origin.
  // Without this the dev overlay never connects and HMR silently does nothing.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
