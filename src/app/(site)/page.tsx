import { getPublishedProjects, getHeroSlides, getJsonSetting } from "@/lib/data/site-content";
import type { ImageTransform } from "@/components/site/EditableImage";
import { HomeContent } from "./HomeContent";

const HERO_KEY = "hero-trang-chu";

export default async function HomePage() {
  const [projects, heroSlides, heroTransforms, serviceImages, serviceTransforms] = await Promise.all([
    getPublishedProjects(),
    getHeroSlides(HERO_KEY, ["/brand/funti-team.jpg"]),
    getJsonSetting<Record<string, ImageTransform>>(`${HERO_KEY}-transform`, {}),
    getJsonSetting<Record<number, string>>("trang-chu-services-images", {}),
    getJsonSetting<Record<number, ImageTransform>>("trang-chu-services-transform", {}),
  ]);

  return (
    <HomeContent
      projects={projects}
      heroSlides={heroSlides}
      heroTransforms={heroTransforms}
      serviceImages={serviceImages}
      serviceTransforms={serviceTransforms}
    />
  );
}
