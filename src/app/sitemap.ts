import type { MetadataRoute } from "next";
import { getJobPostings, getPublishedNewsPosts } from "@/lib/data/site-content";

const SITE_URL = "https://funtikidbooks.com";

const STATIC_PAGES = ["", "dich-vu", "du-an", "gioi-thieu", "lien-he", "quy-trinh", "tin-tuc", "tuyen-dung"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((path) => ({
    url: path ? `${SITE_URL}/${path}` : SITE_URL,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));

  const posts = await getPublishedNewsPosts().catch(() => []);
  const newsEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/tin-tuc/${post.slug}`,
    lastModified: new Date(post.updated_at ?? post.created_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const jobPostings = await getJobPostings(false).catch(() => []);
  const jobEntries: MetadataRoute.Sitemap = jobPostings.map((post) => ({
    url: `${SITE_URL}/tuyen-dung/${post.slug}`,
    lastModified: new Date(post.updated_at ?? post.created_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...newsEntries, ...jobEntries];
}
