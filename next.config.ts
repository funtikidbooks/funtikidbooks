import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      // Default is 1MB — too small for real illustration files uploaded as
      // covers/gallery images. Matches the 20MB app-level checks in
      // lib/actions/admin.ts, board.ts and task-detail.ts.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
