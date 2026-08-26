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
      // covers/gallery images, and now for brush packs (lib/actions/brushes.ts
      // allows up to 500MB). Matches the largest app-level check in the repo.
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
