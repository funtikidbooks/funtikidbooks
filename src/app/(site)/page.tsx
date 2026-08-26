import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { CtaBanner } from "@/components/site/CtaBanner";
import { Reveal } from "@/components/site/Reveal";
import { VideoTeaser } from "@/components/site/VideoTeaser";
import { ProjectCarousel } from "@/components/site/ProjectCarousel";
import { PartnersMarquee } from "@/components/site/PartnersMarquee";
import { HeroSlideshow } from "@/components/site/HeroSlideshow";
import { FitText } from "@/components/site/FitText";
import { ServicesGrid } from "@/components/site/ServicesGrid";
import { getPublishedProjects, getContentEditorRole, getHeroSlides, getJsonSetting } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";
import type { ImageTransform } from "@/components/site/EditableImage";

const HERO_KEY = "hero-trang-chu";

// Used only for the "FUNTIKIDBOOKS" wordmark in the hero banner — not the
// site-wide heading font, so it's declared locally rather than in layout.tsx.
const wordmarkFont = localFont({ src: "../fonts/1FTV-VIP-Original-Fish.otf" });

export default async function HomePage() {
  const [projects, locale, editorRole, heroSlides, heroTransforms, serviceImages, serviceTransforms] = await Promise.all([
    getPublishedProjects(),
    getLocale(),
    getContentEditorRole(),
    getHeroSlides(HERO_KEY, ["/brand/funti-team.jpg"]),
    getJsonSetting<Record<string, ImageTransform>>(`${HERO_KEY}-transform`, {}),
    getJsonSetting<Record<number, string>>("trang-chu-services-images", {}),
    getJsonSetting<Record<number, ImageTransform>>("trang-chu-services-transform", {}),
  ]);
  const t = dictionary[locale];
  const canEdit = editorRole !== null;

  return (
    <>
      {/* Hero — full-bleed photo slideshow */}
      <HeroSlideshow
        settingsKey={HERO_KEY}
        images={heroSlides}
        transforms={heroTransforms}
        canEdit={canEdit}
        revalidatePaths={["/"]}
        overlay="linear-gradient(180deg, rgba(20,18,17,.55) 0%, rgba(20,18,17,.3) 45%, rgba(20,18,17,.65) 100%)"
      >
        <div style={{ opacity: 0.8 }}>
          <Reveal x={0} y={-30}>
            <FitText
              text="Funtikidbooks"
              className={`${wordmarkFont.className} text-[88px] sm:text-[128px] tracking-tight leading-none`}
            />
          </Reveal>
          <h1 className="text-[32px] leading-[1.25] sm:text-[44px] mt-6">
            {t.home.heroTitle[0]}
            <br />
            {t.home.heroTitle[1]}
          </h1>
        </div>
        <p className="text-base leading-relaxed max-w-[560px]" style={{ color: "rgba(255,255,255,.9)" }}>
          {t.home.heroBody}
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          <Reveal x={-48} y={0} delay={150}>
            <Link href="/lien-he" className="btn btn-primary">
              {t.home.heroCta1}
            </Link>
          </Reveal>
          <Reveal x={48} y={0} delay={250}>
            <Link
              href="/du-an"
              className="btn"
              style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1.5px solid rgba(255,255,255,.6)" }}
            >
              {t.home.heroCta2}
            </Link>
          </Reveal>
        </div>
      </HeroSlideshow>

      <Reveal>
        <VideoTeaser />
      </Reveal>

      {/* Services */}
      <section className="max-w-[1800px] mx-auto px-10 pt-6 pb-20">
        <Reveal className="relative flex flex-col items-center text-center gap-2 mb-12">
          <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
            {t.home.servicesKicker}
          </div>
          <h2 className="text-3xl">{t.home.servicesTitle}</h2>
          <p className="max-w-[480px]" style={{ color: "var(--color-neutral-700)" }}>
            {t.home.servicesBody}
          </p>
          <svg
            className="hidden sm:block absolute"
            style={{ top: 2, right: "6%", width: 26, height: 24 }}
            viewBox="0 0 26 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M13 21C13 21 2 14.5 2 7.8 2 4 5 2 8 2c2.3 0 4 1.3 5 3.1C14 3.3 15.7 2 18 2c3 0 6 2 6 5.8 0 6.7-11 13.2-11 13.2z"
              stroke="var(--color-accent-500)"
              strokeWidth="1.6"
            />
          </svg>
        </Reveal>
        <Reveal delay={120}>
          <ServicesGrid
            services={t.home.services}
            initialImages={serviceImages}
            initialTransforms={serviceTransforms}
            canEdit={canEdit}
          />
        </Reveal>
        <div className="flex justify-center mt-12">
          <Link href="/dich-vu" className="fk-navlink text-sm font-bold">
            {t.home.servicesMore}
          </Link>
        </div>
      </section>

      {/* Featured projects */}
      <section className="py-16" style={{ background: "var(--color-surface)" }}>
        <div className="max-w-[1280px] mx-auto px-5">
          <Reveal className="flex flex-col items-center text-center gap-2 mb-10">
            <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-700)" }}>
              {t.home.projectsKicker}
            </div>
            <h2 className="text-3xl">{t.home.projectsTitle}</h2>
          </Reveal>
          <Reveal delay={120}>
            <ProjectCarousel projects={projects} />
          </Reveal>
        </div>
      </section>

      {/* About + stats */}
      <section className="max-w-[1280px] mx-auto px-5 py-16 flex flex-col lg:flex-row gap-11 items-center">
        <Reveal className="flex-1 w-full">
          <div className="relative rounded-[var(--radius-lg)] overflow-hidden" style={{ minHeight: 320 }}>
            <Image src="/brand/funti-team.jpg" alt="Funti Kidbooks Studio team" fill className="object-cover" />
          </div>
        </Reveal>
        <Reveal className="flex-1" delay={150}>
          <div className="flex flex-col gap-4">
            <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
              {t.home.aboutKicker}
            </div>
            <h2 className="text-3xl">{t.home.aboutTitle}</h2>
            <p style={{ color: "var(--color-neutral-700)" }}>{t.home.aboutBody}</p>
            <div className="flex gap-8 mt-2">
              {t.home.stats.map((s) => (
                <div key={s.label} className="flex flex-col gap-1">
                  <span className="text-2xl font-heading font-bold" style={{ color: "var(--color-accent-700)" }}>
                    {s.value}
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-neutral-600)" }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            <Link href="/gioi-thieu" className="btn btn-secondary w-fit mt-2">
              {t.home.aboutMore}
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Partners */}
      <section className="pb-16">
        <Reveal className="max-w-[1280px] mx-auto px-5 flex flex-col items-center text-center gap-2 mb-8">
          <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-700)" }}>
            {t.home.partnersKicker}
          </div>
          <h2 className="text-2xl sm:text-3xl">
            {t.home.partnersTitlePrefix}
            <span style={{ color: "var(--color-accent-600)" }}>{t.home.partnersTitleHighlight}</span>
          </h2>
          <p className="max-w-[480px]" style={{ color: "var(--color-neutral-700)" }}>
            {t.home.partnersBody}
          </p>
        </Reveal>
        <PartnersMarquee />
        <div className="max-w-[1280px] mx-auto px-5">
          <Reveal
            delay={120}
            y={16}
            className="card elev-sm mt-8 p-6 flex flex-col items-center text-center gap-1"
            style={{ background: "var(--color-accent-100)", border: "none" }}
          >
            <span className="text-xl" aria-hidden>
              💌
            </span>
            <p className="font-bold" style={{ color: "var(--color-accent-800)" }}>
              {t.home.thanksTitle}
            </p>
            <p className="text-sm" style={{ color: "var(--color-accent-700)" }}>
              {t.home.thanksBody}
            </p>
          </Reveal>
        </div>
      </section>

      <Reveal>
        <CtaBanner title={t.ctaBanner.title} body={t.ctaBanner.body} ctaLabel={t.ctaBanner.cta} />
      </Reveal>
    </>
  );
}
