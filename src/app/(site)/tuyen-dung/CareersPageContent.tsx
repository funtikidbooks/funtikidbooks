"use client";

import { HeroSlideshow } from "@/components/site/HeroSlideshow";
import { JobPostingsSection } from "@/components/site/JobPostingsSection";
import { CareersStats } from "@/components/site/CareersStats";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import { useEditorSwap } from "@/lib/hooks/useEditorSwap";
import { fetchAllJobPostingsForEditor } from "@/lib/actions/editorContent";
import type { ImageTransform } from "@/components/site/EditableImage";
import type { JobPosting } from "@/lib/types";

const HERO_KEY = "hero-tuyen-dung";

export function CareersPageContent({
  initialPosts,
  heroSlides,
  heroTransforms,
}: {
  initialPosts: JobPosting[];
  heroSlides: string[];
  heroTransforms: Record<string, ImageTransform>;
}) {
  const { locale, t: fullT } = useDict();
  const t = fullT.careers;
  const { canEdit } = useViewer();
  const posts = useEditorSwap(canEdit, fetchAllJobPostingsForEditor, initialPosts);

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
