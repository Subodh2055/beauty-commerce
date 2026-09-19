import type { NextConfig } from "next";

// Origin of the FastAPI backend (for proxying uploaded media same-origin).
const API_ORIGIN = (
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000/api/v1"
).replace(/\/api\/v1\/?$/, "");

const nextConfig: NextConfig = {
  // Standalone output keeps the production Docker image small.
  output: "standalone",
  images: {
    remotePatterns: [
      // Demo seed images. Replace with the real product CDN host.
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  // Serve uploaded media same-origin (/uploads/*) by proxying to the API in dev.
  // In production Nginx serves /uploads directly, so this is a dev convenience.
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` }];
  },
};

export default nextConfig;
