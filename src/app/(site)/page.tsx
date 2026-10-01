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
      // Only what the page shows (a title per project, and how many): the full
      // rows — descriptions, both languages, every gallery picture — made the
      // home page ship ~290KB of data a phone then had to read before it
      // could respond.
      projects={projects.map((p) => ({ id: p.id, title: p.title, title_en: p.title_en }))}
      reviews={reviews}
      serviceImages={serviceImages}
      serviceTransforms={serviceTransforms}
      compare={{ sketch: compare.sketch || DEFAULT_COMPARE.sketch, color: compare.color || DEFAULT_COMPARE.color }}
    />
  );
}
