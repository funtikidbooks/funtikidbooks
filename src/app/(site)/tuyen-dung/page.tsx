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

// The team's group photos sếp Phúc put in the old home page's slideshow
// (trips, the office) — the careers banner rotates through them, slowly
// zooming, until an editor gives this page a slideshow of its own.
const TEAM_PHOTOS_KEY = "hero-trang-chu";

export default async function CareersPage() {
  const [posts, teamPhotos, teamTransforms, ownTransforms] = await Promise.all([
    getJobPostings(false),
    getHeroSlides(TEAM_PHOTOS_KEY, ["/brand/funti-team.jpg"]),
    getJsonSetting<Record<string, ImageTransform>>(`${TEAM_PHOTOS_KEY}-transform`, {}),
    getJsonSetting<Record<string, ImageTransform>>(`${HERO_KEY}-transform`, {}),
  ]);
  const heroSlides = await getHeroSlides(HERO_KEY, teamPhotos);

  return <CareersPageContent initialPosts={posts} heroSlides={heroSlides} heroTransforms={{ ...teamTransforms, ...ownTransforms }} />;
}
