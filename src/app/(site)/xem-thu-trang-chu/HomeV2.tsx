"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BookFlipDemo } from "@/components/site/BookFlipDemo";
import { CtaBanner } from "@/components/site/CtaBanner";
import { PartnersMarquee } from "@/components/site/PartnersMarquee";
import { Reveal } from "@/components/site/Reveal";
import { ServicesGrid } from "@/components/site/ServicesGrid";
import { SketchCompare } from "@/components/site/SketchCompare";
import { Sparkle, Squiggle, StepIcon, Tape, WaveEdge } from "@/components/site/Doodles";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import type { ImageTransform } from "@/components/site/EditableImage";
import { BOOK_DEMO_BACK_COVER, BOOK_DEMO_PAGES } from "@/lib/bookDemo";
import { HERO_BOOKS, HOME_GALLERY, SERVICE_ART, type ComparePair, type HomeArt } from "@/lib/homeArt";
import { resizedUrl } from "@/lib/imageTransform";
import type { Project, Review } from "@/lib/types";

// The home page, redrawn around the studio's own pictures: the books on a
// table, a book to flip through, the services shown with real art, a wall
// of spreads, sketch → colour, what clients say, the team. Shown at
// /xem-thu-trang-chu until sếp Phúc approves it for "/".

const GALLERY_FIRST = 12;

// How each book stands on the shelf, left to right: its height against the
// tallest (the middle one, in front), and a slight lean.
const SHELF = [
  { height: 0.88, r: -2.5, z: 1 },
  { height: 1, r: 0, z: 2 },
  { height: 0.76, r: 2, z: 1 },
];
// Books tuck behind the middle one by this much of the tallest's height.
const SHELF_OVERLAP = 0.12;

// Each picture to whichever column is shortest so far — an even wall
// whatever the mix of wide spreads and tall character art.
function spread(items: HomeArt[], n: number) {
  const cols = Array.from({ length: n }, () => ({ h: 0, items: [] as HomeArt[] }));
  for (const it of items) {
    const c = cols.reduce((a, b) => (b.h < a.h - 0.001 ? b : a));
    c.items.push(it);
    c.h += it.h / it.w + 0.06;
  }
  return cols.map((c) => c.items);
}

function SectionHead({ kicker, title, body, align = "center" }: { kicker: string; title: React.ReactNode; body?: string; align?: "center" | "left" }) {
  return (
    <div className={`flex flex-col gap-2 ${align === "center" ? "items-center text-center" : "items-start text-left"}`}>
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

// Real covers standing face-out on a shelf, each at its own proportions and
// bottoms lined up on the board; Funti peeks over the last one.
function BookShelf({ books, note }: { books: HomeArt[]; note: string }) {
  const slots = books.slice(0, SHELF.length);
  const widths = slots.map((b, i) => SHELF[i].height * (b.w / b.h));
  const total = widths.reduce((a, b) => a + b, 0) - SHELF_OVERLAP * (slots.length - 1);
  const pct = (v: number) => `${((v / total) * 100).toFixed(2)}%`;
  const FUNTI = 0.4; // Funti's width against the book it hides behind

  return (
    <figure className="relative w-full max-w-[420px] sm:max-w-[520px] lg:max-w-none mx-auto flex flex-col items-center gap-4">
      <div className="relative w-full pt-[6%]">
        {/* The wall behind: one soft round of the studio's sky blue. */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{ width: "66%", aspectRatio: "1", bottom: "2%", background: "var(--color-accent-2-100)" }}
          aria-hidden
        />
        <Sparkle size={22} className="absolute" style={{ left: "3%", top: "10%" }} />
        <Sparkle size={14} color="var(--color-accent-2-500)" className="absolute" style={{ right: "4%", top: "4%" }} />
        <Sparkle size={12} className="absolute" style={{ left: "12%", top: "34%" }} />

        <div className="relative flex items-end justify-center">
          {slots.map((b, i) => {
            const s = SHELF[i];
            const last = i === slots.length - 1;
            return (
              <Link
                key={b.projectId}
                href={`/du-an?p=${b.projectId}`}
                title={b.title}
                aria-label={b.title}
                className="fk-book relative block shrink-0"
                style={{
                  width: pct(widths[i]),
                  aspectRatio: `${b.w} / ${b.h}`,
                  marginLeft: i ? pct(-SHELF_OVERLAP) : undefined,
                  zIndex: s.z,
                  ["--r" as string]: `${s.r}deg`,
                }}
              >
                {last && (
                  <span
                    className="absolute pointer-events-none"
                    style={{ width: `${FUNTI * 100}%`, right: "9%", top: `${-0.72 * FUNTI * (b.w / b.h) * 100}%`, zIndex: -1 }}
                    aria-hidden
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/funti-mascot.png" alt="" className="fk-bob block w-full" draggable={false} />
                  </span>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resizedUrl(b.src, 560)}
                  alt={b.title}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ borderRadius: "inherit" }}
                  draggable={false}
                  fetchPriority={s.z === 2 ? "high" : undefined}
                />
              </Link>
            );
          })}
        </div>
        {/* The shelf board: a lit top edge over its front face. */}
        <div className="fk-shelf relative" aria-hidden />
      </div>
      <figcaption className="text-[12.5px] text-center" style={{ color: "var(--color-neutral-600)" }}>
        {note}
      </figcaption>
    </figure>
  );
}

export function HomeV2({
  projects,
  reviews,
  serviceImages,
  serviceTransforms,
  compare,
}: {
  projects: Project[];
  reviews: Review[];
  serviceImages: Record<number, string>;
  serviceTransforms: Record<number, ImageTransform>;
  compare: ComparePair;
}) {
  const { t, locale } = useDict();
  const { canEdit } = useViewer();
  const h = t.homeV2;
  const [showAll, setShowAll] = useState(false);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const titleOf = (p: Project) => (locale === "en" && p.title_en ? p.title_en : p.title);
  const books = HERO_BOOKS.filter((b) => byId.has(b.projectId));
  const gallery = HOME_GALLERY.filter((g) => byId.has(g.projectId));
  const shown = showAll ? gallery : gallery.slice(0, GALLERY_FIRST);
  // Uploaded pictures win; a card nobody has given one gets a real project's.
  const services = { ...SERVICE_ART, ...serviceImages };

  const rated = reviews.filter((r) => r.rating > 0);
  const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : null;
  const quotes = reviews.slice(0, 3);
  const noteBg = ["var(--color-accent-100)", "var(--color-accent-2-100)", "var(--color-neutral-100)"];
  const noteTilt = [-1.4, 1, -0.6];

  return (
    <>
      {canEdit && (
        <div className="text-center text-[12.5px] font-semibold py-1.5" style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>
          👀 {h.previewNote}
        </div>
      )}

      {/* ------------------------------------------------------------ HERO */}
      <section className="fk-paper overflow-hidden">
        <div className="site-container grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center gap-10 lg:gap-14 pt-8 pb-14 sm:pt-12 lg:py-20">
          {/* Centred under the books on a phone/iPad; a left-aligned column beside them on a computer. */}
          <div className="fk-hero-copy flex flex-col items-center text-center lg:items-start lg:text-left min-w-0">
            <span
              className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3.5 py-1.5 text-[12.5px] font-bold"
              style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
            >
              <StepIcon step={1} size={16} />
              {h.chip}
            </span>
            {/* Two lines on a wide column; four even ones on a phone — it only ever breaks between phrases. */}
            <h1 className="fk-hero-title mt-5">
              <span className="fk-hero-line">
                <span className="fk-phrase">{h.heroTitleA}</span>{" "}
                <span className="fk-phrase">
                  <span className="relative" style={{ color: "var(--color-accent-600)" }}>
                    {h.heroTitleHighlight}
                    <Squiggle />
                  </span>
                  ,
                </span>
              </span>{" "}
              <span className="fk-hero-line">
                <span className="fk-phrase">{h.heroTitleB1}</span> <span className="fk-phrase">{h.heroTitleB2}</span>
              </span>
            </h1>
            <p className="mt-5 text-[16px] sm:text-[17px] leading-relaxed max-w-[34em]" style={{ color: "var(--color-neutral-700)", textWrap: "pretty" }}>
              {t.home.heroBody}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Link href="/cong-viec" className="btn btn-primary btn-lg w-full sm:w-auto">
                {h.heroCta} →
              </Link>
              <a href="#lat-sach" className="btn btn-secondary btn-lg w-full sm:w-auto">
                <StepIcon step={3} size={20} />
                {h.heroFlip}
              </a>
            </div>
            <dl className="fk-hero-stats mt-9 pt-6 w-full max-w-[520px] grid grid-cols-3" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
              {[
                ...(avg ? [{ value: avg, stars: true, label: h.reviewsCount.replace("{n}", String(rated.length)) }] : []),
                ...t.home.stats.slice(0, 2).map((s) => ({ value: s.value, stars: false, label: s.label })),
              ].map((s) => (
                <div key={s.label} className="flex flex-col-reverse justify-end gap-1.5 px-2 sm:px-4 lg:first:pl-0">
                  <dt className="text-[12.5px] sm:text-[13px] leading-snug" style={{ color: "var(--color-neutral-600)" }}>
                    {s.label}
                  </dt>
                  <dd className="flex items-center justify-center lg:justify-start gap-1.5 leading-none">
                    <span className="text-[24px] sm:text-[28px]" style={{ fontFamily: "var(--font-heading)", fontWeight: 700 }}>
                      {s.value}
                    </span>
                    {s.stars && (
                      <span className="text-[13px] tracking-[1px]" style={{ color: "var(--color-accent-500)" }} aria-hidden>
                        <span className="sm:hidden">★</span>
                        <span className="hidden sm:inline">★★★★★</span>
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {/* On a phone the books come first, so the opening screen shows art. */}
          <div className="order-first lg:order-none min-w-0">
            <BookShelf books={books} note={h.shelfNote} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ FLIP A BOOK */}
      <div id="lat-sach" style={{ scrollMarginTop: 72 }}>
        <WaveEdge fill="var(--color-surface)" />
        <section className="py-12 sm:py-16" style={{ background: "var(--color-surface)" }}>
          <div className="site-container flex flex-col items-center gap-8">
            <div className="relative">
              <SectionHead kicker={h.flipKicker} title={h.flipTitle} body={t.services.previewSubtitle} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/funti-mascot.png"
                alt=""
                aria-hidden
                className="hidden md:block absolute pointer-events-none"
                style={{ width: 64, right: -84, top: -6, transform: "rotate(12deg)" }}
              />
            </div>
            <BookFlipDemo pages={BOOK_DEMO_PAGES} alt={t.services.previewAlt} backCover={BOOK_DEMO_BACK_COVER} />
          </div>
        </section>
        <div style={{ background: "var(--color-surface)" }}>
          <WaveEdge fill="var(--color-bg)" flip />
        </div>
      </div>

      {/* ------------------------------------------------------ SERVICES */}
      <section className="site-container py-14 sm:py-20 flex flex-col gap-10">
        <Reveal>
          <SectionHead kicker={h.servicesKicker} title={h.servicesTitle} body={h.servicesBody} />
        </Reveal>
        <Reveal delay={100}>
          <ServicesGrid services={t.home.services} initialImages={services} initialTransforms={serviceTransforms} canEdit={canEdit} />
        </Reveal>
        <div className="flex justify-center">
          <Link href="/dich-vu" className="fk-navlink text-sm font-bold">
            {t.home.servicesMore}
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------- GALLERY */}
      <section className="pb-14 sm:pb-20">
        <div className="site-container flex flex-col gap-8">
          <Reveal>
            <SectionHead kicker={h.galleryKicker} title={h.galleryTitle} />
          </Reveal>
          {/* The wall, laid out ahead of loading from each picture's known
              proportions: every picture goes to the shortest column so far.
              Three layouts, one shown per screen size (the hidden ones' lazy
              images never load). */}
          {([2, 3, 4] as const).map((n) => (
            <div
              key={n}
              className={
                n === 2 ? "grid grid-cols-2 gap-3 md:hidden" : n === 3 ? "hidden md:grid xl:hidden grid-cols-3 gap-4" : "hidden xl:grid grid-cols-4 gap-4"
              }
            >
              {spread(shown, n).map((col, ci) => (
                <div key={ci} className="flex flex-col gap-3 md:gap-4 min-w-0">
                  {col.map((g) => {
                    const p = byId.get(g.projectId) as Project;
                    return (
                      <Link
                        key={g.src}
                        href={`/du-an?p=${g.projectId}`}
                        className="group relative block overflow-hidden rounded-[14px]"
                        style={{ background: "var(--color-neutral-100)", boxShadow: "var(--shadow-sm)" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resizedUrl(g.src, 640)}
                          alt={titleOf(p)}
                          loading="lazy"
                          draggable={false}
                          className="block w-full h-auto transition-transform duration-500 group-hover:scale-[1.04]"
                          style={{ aspectRatio: `${g.w} / ${g.h}` }}
                        />
                        <span
                          className="hidden sm:block absolute inset-x-0 bottom-0 px-3 pt-6 pb-2.5 text-[12.5px] font-semibold text-white"
                          style={{ background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.6))" }}
                        >
                          {titleOf(p)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!showAll && gallery.length > GALLERY_FIRST && (
              <button type="button" className="btn btn-secondary" onClick={() => setShowAll(true)}>
                {h.galleryShowMore.replace("{n}", String(gallery.length - GALLERY_FIRST))}
              </button>
            )}
            <Link href="/du-an" className="btn btn-primary">
              {h.galleryMore.replace("{n}", String(projects.length))}
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- PROCESS */}
      <WaveEdge fill="var(--color-surface)" />
      <section className="py-12 sm:py-16" style={{ background: "var(--color-surface)" }}>
        <div className="site-container grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="flex flex-col gap-7">
            <SectionHead kicker={h.processKicker} title={h.processTitle} align="left" />
            <ol className="relative flex flex-col gap-6">
              {/* the pencil line joining the steps */}
              <span
                className="absolute top-6 bottom-6"
                style={{ left: 27, borderLeft: "2px dashed var(--color-accent-300)" }}
                aria-hidden
              />
              {h.steps.map((s, i) => (
                <li key={s.title} className="relative flex items-start gap-4">
                  <span
                    className="relative flex-none flex items-center justify-center rounded-full"
                    style={{ width: 56, height: 56, background: "var(--color-panel)", color: "var(--color-accent-600)", boxShadow: "var(--shadow-sm)" }}
                  >
                    <StepIcon step={i as 0 | 1 | 2 | 3} />
                    <span
                      className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ width: 20, height: 20, background: "var(--color-accent-500)", color: "#fff" }}
                    >
                      {i + 1}
                    </span>
                  </span>
                  <div className="flex flex-col gap-0.5 pt-1.5 min-w-0">
                    <span className="text-[17px] font-bold">{s.title}</span>
                    <span className="text-[14.5px]" style={{ color: "var(--color-neutral-700)" }}>
                      {s.desc}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/quy-trinh" className="fk-navlink text-sm font-bold self-start">
              {h.processMore}
            </Link>
          </div>
          <Reveal>
            <SketchCompare
              initial={compare}
              canEdit={canEdit}
              labels={{
                sketch: h.sketchLabel,
                color: h.colorLabel,
                hint: h.compareHint,
                sketchUpload: h.sketchUpload,
                colorUpload: h.colorUpload,
                editorHint: h.compareEditorHint,
              }}
            />
          </Reveal>
        </div>
      </section>
      <div style={{ background: "var(--color-surface)" }}>
        <WaveEdge fill="var(--color-bg)" flip />
      </div>

      {/* ------------------------------------------------------- REVIEWS */}
      {quotes.length > 0 && (
        <section className="site-container py-14 sm:py-20 flex flex-col gap-10">
          <Reveal>
            <SectionHead kicker={h.reviewsKicker} title={h.reviewsTitle} />
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-5 items-start">
            {quotes.map((r, i) => (
              <Reveal key={r.id} delay={i * 90}>
                <figure
                  className="relative flex flex-col gap-3 rounded-[6px] px-5 pt-7 pb-5"
                  style={{ background: noteBg[i % 3], transform: `rotate(${noteTilt[i % 3]}deg)`, boxShadow: "var(--shadow-sm)" }}
                >
                  <Tape style={{ top: -10, left: "50%", marginLeft: -37, transform: `rotate(${i % 2 ? 4 : -3}deg)` }} />
                  <span style={{ color: "var(--color-accent-500)", letterSpacing: 1.5 }} aria-label={`${r.rating}/5`}>
                    {"★".repeat(Math.max(0, Math.min(5, r.rating)))}
                  </span>
                  <blockquote className="text-[15px] leading-relaxed line-clamp-6" style={{ color: "var(--color-text)" }}>
                    {r.content.replace(/^["“]|["”]$/g, "")}
                  </blockquote>
                  <figcaption className="text-[13px] font-bold" style={{ color: "var(--color-neutral-600)" }}>
                    — {r.customer_name}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- ABOUT */}
      <section className="site-container pb-14 sm:pb-20 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <Reveal>
          <figure
            className="relative mx-auto max-w-[560px] p-3 pb-12 rounded-[6px]"
            style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-lg)", transform: "rotate(-1.5deg)" }}
          >
            <Tape style={{ top: -11, left: 24, transform: "rotate(-8deg)" }} />
            <Tape style={{ top: -11, right: 24, transform: "rotate(7deg)" }} />
            <div className="relative w-full overflow-hidden rounded-[3px]" style={{ aspectRatio: "4 / 3" }}>
              <Image src="/brand/funti-team.jpg" alt="Funti Kidbooks Studio" fill sizes="(min-width: 1024px) 560px, 92vw" className="object-cover" />
            </div>
            <figcaption
              className="absolute left-0 right-0 bottom-3 text-center text-[22px]"
              style={{ fontFamily: "var(--font-funti-wordmark), var(--font-heading)", color: "var(--color-accent-600)" }}
            >
              Funti team ♥
            </figcaption>
          </figure>
        </Reveal>
        <Reveal delay={120}>
          <div className="flex flex-col gap-4">
            <SectionHead kicker={t.home.aboutKicker} title={t.home.aboutTitle} body={t.home.aboutBody} align="left" />
            <div className="grid grid-cols-3 gap-4 mt-1">
              {t.home.stats.map((s) => (
                <div key={s.label} className="flex flex-col gap-0.5">
                  <span className="font-heading font-bold leading-none" style={{ fontSize: "clamp(30px, 4vw, 44px)", color: "var(--color-accent-600)" }}>
                    {s.value}
                  </span>
                  <span className="text-[13px]" style={{ color: "var(--color-neutral-600)" }}>
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

      {/* ------------------------------------------------------ PARTNERS */}
      <section className="pb-14">
        <div className="site-container flex flex-col items-center text-center gap-2 mb-6">
          <div className="text-xs font-bold tracking-[0.12em]" style={{ color: "var(--color-accent-2-700)" }}>
            {t.home.partnersKicker}
          </div>
          <h2 className="text-[24px] sm:text-[28px]">{h.partnersTitle}</h2>
        </div>
        <PartnersMarquee />
      </section>

      <Reveal>
        <CtaBanner title={t.ctaBanner.title} body={t.ctaBanner.body} ctaLabel={t.ctaBanner.cta} />
      </Reveal>
    </>
  );
}
