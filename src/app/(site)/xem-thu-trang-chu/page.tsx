import type { Metadata } from "next";
import { getJsonSetting, getPublishedProjects, getReviews } from "@/lib/data/site-content";
import type { ImageTransform } from "@/components/site/EditableImage";
import { COMPARE_KEY, DEFAULT_COMPARE, type ComparePair } from "@/lib/homeArt";
import { HomeV2 } from "./HomeV2";

// The redesigned home page, for sếp Phúc to look over on his phone/iPad
// before it replaces "/". Not linked anywhere and kept out of search.
export const metadata: Metadata = {
  title: "Xem thử trang chủ mới",
  robots: { index: false, follow: false },
};

export default async function HomePreviewPage() {
  const [projects, reviews, serviceImages, serviceTransforms, compare] = await Promise.all([
    getPublishedProjects(),
    getReviews(),
    getJsonSetting<Record<number, string>>("trang-chu-services-images", {}),
    getJsonSetting<Record<number, ImageTransform>>("trang-chu-services-transform", {}),
    getJsonSetting<Partial<ComparePair>>(COMPARE_KEY, {}),
  ]);

  return (
    <HomeV2
      projects={projects}
      reviews={reviews}
      serviceImages={serviceImages}
      serviceTransforms={serviceTransforms}
      compare={{ sketch: compare.sketch || DEFAULT_COMPARE.sketch, color: compare.color || DEFAULT_COMPARE.color }}
    />
  );
}
