"use client";

import Link from "next/link";
import { PageHero } from "@/components/site/PageHero";
import { CtaBanner } from "@/components/site/CtaBanner";
import { Reveal } from "@/components/site/Reveal";
import { ReviewsSection } from "@/components/site/ReviewsSection";
import { FaqSection } from "@/components/site/FaqSection";
import { PricingTable } from "@/components/site/PricingTable";
import { ServicesGrid } from "@/components/site/ServicesGrid";
import { ServicesCollage } from "@/components/site/PageArt";
import { DrawnIcon, WaveEdge, type DrawnIconName } from "@/components/site/Doodles";
import type { ImageTransform } from "@/components/site/EditableImage";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import { useEditorSwap } from "@/lib/hooks/useEditorSwap";
import { fetchAllReviewsForEditor } from "@/lib/actions/editorContent";
import { SERVICE_ART } from "@/lib/homeArt";
import { PROCESS_ART, SERVICE_SAMPLE_CATEGORY } from "@/lib/pageArt";
import { resizedUrl } from "@/lib/imageTransform";
import type { PricingTable as PricingTableData, Review } from "@/lib/types";

// Dịch vụ, in the order a client weighs it: what Funti draws (with real
// pictures), what it costs, why Funti, what others say, the questions,
// how the work goes — then the way in.

const WHY_ICONS: DrawnIconName[] = ["heart", "star", "hands", "sprout"];

function SectionHead({ kicker, title, body }: { kicker: string; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className="text-xs font-bold tracking-[0.12em]" style={{ color: "var(--color-accent-2-700)" }}>
        {kicker}
      </div>
      <h2 className="text-[28px] sm:text-[34px] leading-tight" style={{ textWrap: "balance" }}>
        {title}
      </h2>
      {body && (
        <p className="max-w-[560px]" style={{ color: "var(--color-neutral-700)" }}>
          {body}
        </p>
      )}
    </div>
  );
}

export function ServicesPageContent({
  pricing,
  initialReviews,
  serviceImages,
  serviceTransforms,
}: {
  pricing: PricingTableData;
  initialReviews: Review[];
  serviceImages: Record<number, string>;
  serviceTransforms: Record<number, ImageTransform>;
}) {
  const { t } = useDict();
  const { canEdit } = useViewer();
  const s = t.services;
  const reviews = useEditorSwap(canEdit, fetchAllReviewsForEditor, initialReviews);
  const strip = [PROCESS_ART.sketch, PROCESS_ART.color, PROCESS_ART.printed];

  return (
    <>
      <PageHero
        kicker={s.kicker}
        title={s.title}
        body={s.body}
        primaryLabel={s.ctaPrimary}
        primaryHref="/cong-viec"
        secondaryLabel={s.ctaSecondary}
        secondaryHref="#bang-gia"
        art={<ServicesCollage labels={s.artLabels} />}
      />

      {/* ------------------------------------------------ WHAT WE DRAW */}
      <section className="site-container py-14 sm:py-16 flex flex-col gap-10">
        <Reveal>
          <SectionHead kicker={s.listKicker} title={s.listTitle} body={s.listBody} />
        </Reveal>
        <ServicesGrid
          services={t.home.services}
          initialImages={{ ...SERVICE_ART, ...serviceImages }}
          initialTransforms={serviceTransforms}
          canEdit={canEdit}
          details={{
            forWhoLabel: s.forWhoLabel,
            forWho: s.forWho,
            sampleLabel: s.sampleLink,
            sampleHref: (i) => (SERVICE_SAMPLE_CATEGORY[i] ? `/du-an?c=${encodeURIComponent(SERVICE_SAMPLE_CATEGORY[i]!)}` : "/du-an"),
          }}
        />
      </section>

      {/* ------------------------------------------------------ PRICING */}
      <WaveEdge fill="var(--color-surface)" />
      <div style={{ background: "var(--color-surface)" }}>
        <Reveal>
          <PricingTable table={pricing} canEdit={canEdit} />
        </Reveal>
      </div>
      <div style={{ background: "var(--color-surface)" }}>
        <WaveEdge fill="var(--color-bg)" flip />
      </div>

      {/* ---------------------------------------------------------- WHY */}
      <section className="site-container py-14 sm:py-16 flex flex-col gap-10">
        <Reveal>
          <SectionHead kicker={s.whyKicker} title={s.whyTitle} />
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {s.why.map((w, i) => (
            <Reveal key={w.title} delay={i * 80} className="h-full">
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
                  <DrawnIcon name={WHY_ICONS[i % WHY_ICONS.length]} size={28} />
                </span>
                <h3 className="text-lg">{w.title}</h3>
                <p className="text-[15px] leading-relaxed" style={{ color: "var(--color-neutral-600)" }}>
                  {w.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ REVIEWS */}
      <section className="site-container pb-14">
        <Reveal>
          <ReviewsSection reviews={reviews} canEdit={canEdit} />
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- FAQ */}
      <Reveal>
        <FaqSection title={s.faqTitle} items={s.faq} />
      </Reveal>

      {/* ------------------------------------------------------ PROCESS */}
      <section className="site-container py-14">
        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-8 lg:gap-12 items-center rounded-[24px] p-6 sm:p-10" style={{ background: "var(--color-accent-100)" }}>
            <div className="flex flex-col gap-3 items-center text-center lg:items-start lg:text-left">
              <div className="text-xs font-bold tracking-[0.12em]" style={{ color: "var(--color-accent-700)" }}>
                {s.processKicker}
              </div>
              <h2 className="text-[26px] sm:text-[32px] leading-tight">{s.processTitle}</h2>
              <p style={{ color: "var(--color-neutral-700)" }}>{s.processBody}</p>
              <Link href="/quy-trinh" className="btn btn-primary mt-2">
                {s.processCta}
              </Link>
            </div>
            <Link href="/quy-trinh" className="grid grid-cols-3 gap-3 sm:gap-4 items-end" aria-label={s.processCta}>
              {strip.map((a, i) => (
                <figure key={a.src} className="flex flex-col items-center gap-2">
                  <span className="block w-full overflow-hidden rounded-[8px]" style={{ aspectRatio: "4 / 5", boxShadow: "var(--shadow-md)", background: "var(--color-panel)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resizedUrl(a.src, 360)} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </span>
                  <figcaption className="text-[12.5px] font-bold" style={{ color: "var(--color-accent-800)" }}>
                    {i + 1}. {t.process.stages[i]}
                  </figcaption>
                </figure>
              ))}
            </Link>
          </div>
        </Reveal>
      </section>

      <Reveal>
        <CtaBanner title={t.ctaBanner.title} body={t.ctaBanner.body} ctaLabel={t.ctaBanner.cta} />
      </Reveal>
    </>
  );
}
