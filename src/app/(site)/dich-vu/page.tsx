import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/PageHero";
import { CtaBanner } from "@/components/site/CtaBanner";
import { Reveal } from "@/components/site/Reveal";
import { BookFlipDemo } from "@/components/site/BookFlipDemo";
import { ReviewsSection } from "@/components/site/ReviewsSection";
import { FaqSection } from "@/components/site/FaqSection";
import { PricingTable } from "@/components/site/PricingTable";
import { DEFAULT_PRICING_TABLE, PRICING_SETTING_KEY } from "@/lib/pricing";
import { getContentEditorRole, getJsonSetting, getReviews } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";

const PAGE_DESCRIPTION =
  "Dịch vụ minh hoạ sách thiếu nhi, thiết kế nhân vật, dàn trang và thiết kế bìa sách — chuẩn khổ KDP/Amazon, sẵn sàng in ấn. Xem bảng giá và đặt lịch tư vấn dự án.";

export const metadata: Metadata = {
  title: "Dịch vụ",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Dịch vụ · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Dịch vụ · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

const BOOK_DEMO_BASE = "https://ueixkrrdwptymmawwred.supabase.co/storage/v1/object/public/site-content";

// "The Adventures of Momo & Dodo" — the real front cover, then the
// dedication page and every interior double-page spread, each pre-split
// into a left and right single page (the project's art is authored as
// spreads, not individual pages), in story order. The back cover is
// passed separately below.
const bookPages = [
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-front-cover-75e0788e-f273-49dd-9cb6-9a676b73cb7c.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-dedication-left-c2039f8e-fdf3-4cb9-8d49-99daa2572da6.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-dedication-right-5f56d6cb-db3b-42c2-883c-0aaa406280cf.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-01-left-474f7e32-6654-474b-9a08-672415ac4576.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-01-right-e59aa561-ca0c-453c-8b68-e50392a6df86.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-02-left-c3cdaae2-ad44-4819-9ddd-ef13ff4088c7.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-02-right-bda7aae6-3c99-474e-b8ac-6d8d417f78b8.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-03-left-a20fcdbf-b7d6-4e40-916a-b2d5bd6bbad8.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-03-right-516585fa-9df4-4a6d-9ca1-5c5fe60dde37.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-04-left-16337866-2714-4868-a134-dba28fd2f460.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-04-right-82b2249c-83f0-4504-8116-d3ab8fbbd9fb.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-05-left-4988acba-a1c3-41be-8d65-9554cd331a48.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-05-right-5ffcb791-1f2b-453a-b3e7-be7e96786f3a.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-06-left-cdd9898d-c61b-4879-abdc-479d884721bc.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-06-right-3382bf99-50c3-49c1-a60b-96256147e01b.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-07-left-12407f43-53a2-4b07-b9e4-7d127989f85d.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-07-right-f9d1e329-72d4-4b39-8a33-8d059f1a497a.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-08-left-cf4550e9-97df-4888-a237-c7f6199f5d5a.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-08-right-3b941a8f-21a8-4647-8201-a92d9e955eac.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-09-left-88649c47-0179-459d-aded-06fe66ff22d6.jpg`,
  `${BOOK_DEMO_BASE}/book-demo/momo-dodo-spread-09-right-1cb0deff-a79c-419b-8dc9-9301228672a6.jpg`,
];

const bookBackCover = `${BOOK_DEMO_BASE}/book-demo/momo-dodo-back-cover-a73caed4-2a7b-4a91-9bcf-c7717adb57fb.jpg`;

export default async function ServicesPage() {
  const [locale, editorRole, pricing] = await Promise.all([
    getLocale(),
    getContentEditorRole(),
    getJsonSetting(PRICING_SETTING_KEY, DEFAULT_PRICING_TABLE),
  ]);
  const canEdit = editorRole !== null;
  const reviews = await getReviews(canEdit);
  const t = dictionary[locale];

  return (
    <>
      <PageHero
        title={t.services.title}
        body={t.services.body}
        primaryLabel={t.services.ctaPrimary}
        primaryHref="/lien-he"
        secondaryLabel={t.services.ctaSecondary}
        secondaryHref="/quy-trinh"
        emoji="🎨"
        hideImage
      />

      <section className="site-container py-12">
        {bookPages.length >= 2 && (
          <Reveal className="flex flex-col items-center text-center gap-2">
            <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
              {t.services.previewKicker}
            </div>
            <h2 className="text-3xl">{t.services.previewTitle}</h2>
            <p className="max-w-[480px] mb-8" style={{ color: "var(--color-neutral-700)" }}>
              {t.services.previewSubtitle}
            </p>
            <div className="relative w-full flex items-center justify-center">
              <BookFlipDemo pages={bookPages} alt={t.services.previewAlt} backCover={bookBackCover} />
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
