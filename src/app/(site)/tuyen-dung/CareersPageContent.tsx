"use client";

import { HeroSlideshow } from "@/components/site/HeroSlideshow";
import { JobPostingsSection } from "@/components/site/JobPostingsSection";
import { Reveal } from "@/components/site/Reveal";
import { DrawnIcon, WaveEdge, type DrawnIconName } from "@/components/site/Doodles";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import { useEditorSwap } from "@/lib/hooks/useEditorSwap";
import { fetchAllJobPostingsForEditor } from "@/lib/actions/editorContent";
import type { ImageTransform } from "@/components/site/EditableImage";
import type { JobPosting } from "@/lib/types";

const HERO_KEY = "hero-tuyen-dung";
const EMAIL = "funtikidbooks.studio@gmail.com";
const PERK_ICONS: DrawnIconName[] = ["book", "sprout", "users"];

export function CareersPageContent({
  initialPosts,
  heroSlides,
  heroTransforms,
}: {
  initialPosts: JobPosting[];
  heroSlides: string[];
  heroTransforms: Record<string, ImageTransform>;
}) {
  const { t: fullT } = useDict();
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
        overlay="linear-gradient(180deg, rgba(20,18,17,.55) 0%, rgba(20,18,17,.28) 38%, rgba(20,18,17,.6) 62%, rgba(20,18,17,.88) 100%)"
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

      {/* What it's like here, and how to apply — from the studio's own job ads. */}
      <WaveEdge fill="var(--color-surface)" />
      <section className="py-14 sm:py-16" style={{ background: "var(--color-surface)" }}>
        <div className="site-container flex flex-col gap-10">
          <Reveal className="flex flex-col items-center text-center gap-2">
            <div className="text-xs font-bold tracking-[0.12em]" style={{ color: "var(--color-accent-2-700)" }}>
              {t.whyKicker}
            </div>
            <h2 className="text-[28px] sm:text-[34px] leading-tight">{t.whyTitle}</h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {t.perks.map((p, i) => (
              <Reveal key={p.title} delay={i * 80} className="h-full">
                <div className="h-full flex flex-col gap-3 rounded-[18px] p-6" style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" }}>
                  <span
                    className="inline-flex items-center justify-center rounded-full"
                    style={{
                      width: 52,
                      height: 52,
                      background: i % 2 ? "var(--color-accent-2-100)" : "var(--color-accent-100)",
                      color: i % 2 ? "var(--color-accent-2-700)" : "var(--color-accent-700)",
                    }}
                  >
                    <DrawnIcon name={PERK_ICONS[i % PERK_ICONS.length]} size={28} />
                  </span>
                  <h3 className="text-lg">{p.title}</h3>
                  <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-neutral-600)" }}>
                    {p.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5">
            <Reveal>
              <div className="h-full rounded-[18px] p-6 sm:p-8 flex flex-col gap-5" style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" }}>
                <h3 className="text-[22px]">{t.applyTitle}</h3>
                <ol className="flex flex-col gap-4">
                  {t.applySteps.map((s, i) => (
                    <li key={s} className="flex items-start gap-3">
                      <span
                        className="inline-flex items-center justify-center rounded-full font-heading font-bold flex-none"
                        style={{ width: 32, height: 32, background: "var(--color-accent-500)", color: "#fff" }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[15px] leading-snug pt-1 break-words min-w-0">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="h-full rounded-[18px] p-6 sm:p-8 flex flex-col gap-3" style={{ background: "var(--color-accent-100)" }}>
                <h3 className="text-[22px]">{t.openTitle}</h3>
                <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-neutral-700)" }}>
                  {t.openBody}
                </p>
                <a href={`mailto:${EMAIL}?subject=${encodeURIComponent(t.applySubject + " Portfolio")}`} className="btn btn-primary w-full sm:w-fit mt-auto">
                  {t.openCta}
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
      <div style={{ background: "var(--color-surface)" }}>
        <WaveEdge fill="var(--color-bg)" flip />
      </div>
    </>
  );
}
