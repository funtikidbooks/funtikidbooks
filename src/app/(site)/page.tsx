import { getJsonSetting, getPublishedProjects, getReviews } from "@/lib/data/site-content";
import type { ImageTransform } from "@/components/site/EditableImage";
import { COMPARE_KEY, DEFAULT_COMPARE, type ComparePair } from "@/lib/homeArt";
import { HomeContent } from "./HomeContent";

export default async function HomePage() {
  const [projects, reviews, serviceImages, serviceTransforms, compare] = await Promise.all([
    getPublishedProjects(),
    getReviews(),
    getJsonSetting<Record<number, string>>("trang-chu-services-images", {}),
    getJsonSetting<Record<number, ImageTransform>>("trang-chu-services-transform", {}),
    getJsonSetting<Partial<ComparePair>>(COMPARE_KEY, {}),
  ]);

  return (
    <HomeContent
      projects={projects}
      reviews={reviews}
      serviceImages={serviceImages}
      serviceTransforms={serviceTransforms}
      compare={{ sketch: compare.sketch || DEFAULT_COMPARE.sketch, color: compare.color || DEFAULT_COMPARE.color }}
    />
  );
}
