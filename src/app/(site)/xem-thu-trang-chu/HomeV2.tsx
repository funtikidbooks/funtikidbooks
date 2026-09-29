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
import { HOME_GALLERY, SERVICE_ART, type ComparePair, type HomeArt } from "@/lib/homeArt";
import { resizedUrl } from "@/lib/imageTransform";
import type { Project, Review } from "@/lib/types";

// The home page, redrawn around the studio's own pictures: the books on a
// table, a book to flip through, the services shown with real art, a wall
// of spreads, sketch → colour, what clients say, the team. Shown at
// /xem-thu-trang-chu until sếp Phúc approves it for "/".

const GALLERY_FIRST = 12;

// Where each book lies on the table (percent of the pile's box).
const BOOK_SLOTS = [
  { left: "2%", top: "15%", w: 33, r: -11, z: 1 },
  { left: "65%", top: "11%", w: 33, r: 10, z: 1 },
  { left: "12%", top: "31%", w: 37, r: -5, z: 2 },
  { left: "51%", top: "29%", w: 37, r: 6, z: 2 },
  { left: "28%", top: "16%", w: 44, r: -1.5, z: 3 },
];

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

function BookPile({ books, alt }: { books: Project[]; alt: string }) {
  return (
    <div className="relative w-full max-w-[360px] sm:max-w-[440px] lg:max-w-[560px] mx-auto" style={{ aspectRatio: "1 / 0.92" }}>
      {/* The table: a soft blot of the studio's sky blue. */}
      <div
        className="absolute"
        style={{
          inset: "10% 3% 4% 5%",
          background: "var(--color-accent-2-100)",
          borderRadius: "58% 42% 55% 45% / 48% 55% 45% 52%",
        }}
        aria-hidden
      />
      <Sparkle size={22} className="absolute" style={{ left: "4%", top: "6%" }} />
      <Sparkle size={14} color="var(--color-accent-2-500)" className="absolute" style={{ right: "2%", top: "55%" }} />
      <Sparkle size={16} className="absolute" style={{ left: "46%", bottom: "2%" }} />
      {books.slice(0, BOOK_SLOTS.length).map((b, i) => {
        const s = BOOK_SLOTS[i];
        return (
          <Link
            key={b.id}
            href={`/du-an?p=${b.id}`}
            aria-label={b.title}
            className="fk-book absolute block overflow-hidden"
            style={{
              left: s.left,
              top: s.top,
              width: `${s.w}%`,
              aspectRatio: "3 / 4",
              zIndex: s.z,
              borderRadius: "4px 10px 10px 4px",
              boxShadow: "var(--shadow-md)",
              background: "var(--color-neutral-100)",
              ["--r" as string]: `${s.r}deg`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resizedUrl(b.cover_image_url, 520)}
              alt={`${alt} — ${b.title}`}
              className="w-full h-full object-cover"
              draggable={false}
              fetchPriority={s.z === 3 ? "high" : undefined}
            />
          </Link>
        );
      })}
      {/* Funti, sitting on the pile. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/funti-mascot.png"
        alt=""
        aria-hidden
        className="fk-bob absolute pointer-events-none"
        style={{ right: "18%", top: "0%", width: "21%", zIndex: 5, filter: "drop-shadow(0 6px 10px rgba(0,0,0,.15))" }}
      />
    </div>
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
  const books = projects.filter((p) => p.cover_image_url && p.tag.startsWith("Sách")).slice(0, 5);
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
        <div className="site-container grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] items-center gap-6 lg:gap-6 pt-6 pb-12 sm:pt-12 lg:pt-16 lg:pb-20">
          <div className="flex flex-col items-start gap-5 min-w-0">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold"
              style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
            >
              ✏️ {h.chip}
            </span>
            <h1 className="leading-[1.12]" style={{ fontSize: "clamp(34px, 5vw, 60px)", textWrap: "balance" }}>
              {h.heroTitleA}{" "}
              <span className="relative inline-block whitespace-nowrap" style={{ color: "var(--color-accent-600)" }}>
                {h.heroTitleHighlight}
                <Squiggle />
              </span>
              <br className="hidden sm:block" /> {h.heroTitleB}
            </h1>
            <p className="text-[16.5px] sm:text-[17px] leading-relaxed max-w-[540px]" style={{ color: "var(--color-neutral-700)" }}>
              {t.home.heroBody}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/cong-viec" className="btn btn-primary">
                {h.heroCta} →
              </Link>
              <a href="#lat-sach" className="btn btn-secondary">
                📖 {h.heroFlip}
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13.5px]" style={{ color: "var(--color-neutral-600)" }}>
              {avg && (
                <span>
                  <span style={{ color: "var(--color-accent-500)", letterSpacing: 1 }} aria-hidden>
                    ★★★★★
                  </span>{" "}
                  <b style={{ color: "var(--color-text)" }}>{h.reviewsProof.replace("{avg}", avg).replace("{n}", String(rated.length))}</b>
                </span>
              )}
              {t.home.stats.slice(0, 2).map((s) => (
                <span key={s.label}>
                  <b style={{ color: "var(--color-text)" }}>{s.value}</b> {s.label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
          {/* On a phone the books come first, so the opening screen shows art. */}
          <div className="order-first lg:order-none">
            <BookPile books={books} alt={t.services.previewAlt} />
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
