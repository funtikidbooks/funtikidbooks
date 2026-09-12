import type { Metadata } from "next";
import { getHeroSlides, getJobPostings, getJsonSetting } from "@/lib/data/site-content";
import type { ImageTransform } from "@/components/site/EditableImage";
import { CareersPageContent } from "./CareersPageContent";

const HERO_KEY = "hero-tuyen-dung";

const PAGE_DESCRIPTION = "Vị trí đang tuyển dụng tại Funti Kidbooks Studio — xưởng minh hoạ sách thiếu nhi.";

export const metadata: Metadata = {
  title: "Tuyển dụng",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Tuyển dụng · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Tuyển dụng · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default async function CareersPage() {
  const [posts, heroSlides, heroTransforms] = await Promise.all([
    getJobPostings(false),
    getHeroSlides(HERO_KEY, ["/brand/funti-team.jpg"]),
    getJsonSetting<Record<string, ImageTransform>>(`${HERO_KEY}-transform`, {}),
  ]);

  return <CareersPageContent initialPosts={posts} heroSlides={heroSlides} heroTransforms={heroTransforms} />;
}
