import type { Metadata } from "next";
import { HeroSlideshow } from "@/components/site/HeroSlideshow";
import { JobPostingsSection } from "@/components/site/JobPostingsSection";
import { CareersStats } from "@/components/site/CareersStats";
import { getContentEditorRole, getHeroSlides, getJobPostings, getJsonSetting } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";
import type { ImageTransform } from "@/components/site/EditableImage";

const HERO_KEY = "hero-tuyen-dung";

const PAGE_DESCRIPTION = "Vị trí đang tuyển dụng tại Funti Kidbooks Studio — xưởng minh hoạ sách thiếu nhi.";

export const metadata: Metadata = {
  title: "Tuyển dụng",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Tuyển dụng · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Tuyển dụng · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default async function CareersPage() {
  const [editorRole, locale] = await Promise.all([getContentEditorRole(), getLocale()]);
  const canEdit = editorRole !== null;
  const t = dictionary[locale].careers;

  const [posts, heroSlides, heroTransforms] = await Promise.all([
    getJobPostings(canEdit),
    getHeroSlides(HERO_KEY, ["/brand/funti-team.jpg"]),
    getJsonSetting<Record<string, ImageTransform>>(`${HERO_KEY}-transform`, {}),
  ]);

  return (
    <>
      <HeroSlideshow
        settingsKey={HERO_KEY}
        images={heroSlides}
        transforms={heroTransforms}
        canEdit={canEdit}
        revalidatePaths={["/tuyen-dung"]}
        overlay="linear-gradient(180deg, rgba(20,18,17,.6) 0%, rgba(20,18,17,.35) 45%, rgba(20,18,17,.7) 100%)"
      >
        <div className="text-xs font-bold tracking-[0.14em]" style={{ color: "#ff9f6e" }}>
          {t.kicker}
        </div>
        <h1 className="text-[32px] leading-[1.25] sm:text-[44px] mt-2">{t.title}</h1>
        <p className="text-base leading-relaxed max-w-[560px] mt-3" style={{ color: "rgba(255,255,255,.9)" }}>
          {t.body}
        </p>
        <a href="#vi-tri" className="btn btn-primary mt-4">
          {t.heroCta}
        </a>
      </HeroSlideshow>

      <section id="vi-tri" className="site-container py-16 scroll-mt-20">
        <JobPostingsSection initialPosts={posts} canEdit={canEdit} />
      </section>

      <CareersStats locale={locale} />
    </>
  );
}
