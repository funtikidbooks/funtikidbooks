"use client";

import Link from "next/link";
import { PageHero } from "@/components/site/PageHero";
import { CtaBanner } from "@/components/site/CtaBanner";
import { Reveal } from "@/components/site/Reveal";
import { BookFlipDemo } from "@/components/site/BookFlipDemo";
import { BOOK_DEMO_BACK_COVER, BOOK_DEMO_PAGES } from "@/lib/bookDemo";
import { ReviewsSection } from "@/components/site/ReviewsSection";
import { FaqSection } from "@/components/site/FaqSection";
import { PricingTable } from "@/components/site/PricingTable";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import { useEditorSwap } from "@/lib/hooks/useEditorSwap";
import { fetchAllReviewsForEditor } from "@/lib/actions/editorContent";
import type { PricingTable as PricingTableData, Review } from "@/lib/types";


export function ServicesPageContent({
  pricing,
  initialReviews,
}: {
  pricing: PricingTableData;
  initialReviews: Review[];
}) {
  const { t } = useDict();
  const { canEdit } = useViewer();
  const reviews = useEditorSwap(canEdit, fetchAllReviewsForEditor, initialReviews);

  return (
    <>
      <PageHero
        title={t.services.title}
        body={t.services.body}
        primaryLabel={t.services.ctaPrimary}
        primaryHref="/cong-viec"
        secondaryLabel={t.services.ctaSecondary}
        secondaryHref="/quy-trinh"
        emoji="🎨"
        hideImage
      />

      <section className="site-container py-12">
        {BOOK_DEMO_PAGES.length >= 2 && (
          <Reveal className="flex flex-col items-center text-center gap-2">
            <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
              {t.services.previewKicker}
            </div>
            <h2 className="text-3xl">{t.services.previewTitle}</h2>
            <p className="max-w-[480px] mb-8" style={{ color: "var(--color-neutral-700)" }}>
              {t.services.previewSubtitle}
            </p>
            <div className="relative w-full flex items-center justify-center">
              <BookFlipDemo pages={BOOK_DEMO_PAGES} alt={t.services.previewAlt} backCover={BOOK_DEMO_BACK_COVER} />
            </div>
          </Reveal>
        )}
      </section>

      <Reveal>
        <PricingTable table={pricing} canEdit={canEdit} />
      </Reveal>

      <Reveal>
        <FaqSection title={t.services.faqTitle} items={t.services.faq} />
      </Reveal>

      <section className="site-container py-14">
        <Reveal>
          <ReviewsSection reviews={reviews} canEdit={canEdit} />
        </Reveal>
      </section>

      <section className="py-14" style={{ background: "var(--color-surface)" }}>
        <div className="site-container">
          <Reveal>
            <h2 className="text-3xl text-center mb-10">{t.services.whyTitle}</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.services.why.map((w, i) => (
              <Reveal key={w.title} delay={i * 90} className="flex flex-col items-center text-center gap-2 p-5">
                <span className="text-3xl" aria-hidden>
                  {w.icon}
                </span>
                <h3 className="text-base">{w.title}</h3>
                <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
                  {w.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Reveal className="site-container py-14 flex flex-col items-center text-center gap-4">
        <h2 className="text-3xl">{t.services.processTitle}</h2>
        <p className="max-w-[520px]" style={{ color: "var(--color-neutral-700)" }}>
          {t.services.processBody}
        </p>
        <Link href="/quy-trinh" className="btn btn-secondary">
          {t.services.processCta}
        </Link>
      </Reveal>

      <Reveal>
        <CtaBanner title={t.ctaBanner.title} body={t.ctaBanner.body} ctaLabel={t.ctaBanner.cta} />
      </Reveal>
    </>
  );
}
