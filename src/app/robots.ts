import type { MetadataRoute } from "next";

const SITE_URL = "https://funtikidbooks.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Internal tools — nothing here is meant for search results, and
        // most of it requires login anyway.
        disallow: ["/workspace", "/workspace-demo", "/quan-tri", "/dang-nhap"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
