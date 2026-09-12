import type { Metadata } from "next";
import { getNewsPosts, getSiteSettings } from "@/lib/data/site-content";
import { NewsPageContent } from "./NewsPageContent";

const PAGE_DESCRIPTION = "Tin tức, dự án mới và cập nhật từ Funti Kidbooks Studio — xưởng minh hoạ sách thiếu nhi.";

export const metadata: Metadata = {
  title: "Tin tức",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Tin tức · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Tin tức · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default async function NewsPage() {
  const [posts, settings] = await Promise.all([getNewsPosts(false), getSiteSettings(["hero-tin-tuc"])]);

  return <NewsPageContent initialPosts={posts} heroImage={settings["hero-tin-tuc"]} />;
}
