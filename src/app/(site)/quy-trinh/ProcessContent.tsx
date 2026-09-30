"use client";

import Link from "next/link";
import { PageHero } from "@/components/site/PageHero";
import { CtaBanner } from "@/components/site/CtaBanner";
import { FaqSection } from "@/components/site/FaqSection";
import { Reveal } from "@/components/site/Reveal";
import { StageStrip } from "@/components/site/PageArt";
import { DrawnIcon, WaveEdge } from "@/components/site/Doodles";
import { useDict } from "@/components/site/LocaleProvider";
import { resizedUrl } from "@/lib/imageTransform";
import { PROCESS_ART, type PageArt } from "@/lib/pageArt";

// Quy trình: the six steps, each shown with the real picture from one book
// (the Princess and The Frog cover) at that stage, and what goes each way.

// The questions from Dịch vụ's FAQ that are about how the work goes:
// how long, how many rounds, what's delivered, who owns it.
const PROCESS_FAQ = [1, 2, 3, 7];

function Picture({ art, alt, className = "" }: { art: PageArt; alt: string; className?: string }) {
  return (
    <span className={`block overflow-hidden rounded-[10px] ${className}`} style={{ aspectRatio: `${art.w} / ${art.h}`, boxShadow: "var(--shadow-md)", background: "var(--color-panel)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={resizedUrl(art.src, 720)} alt={alt} className="w-full h-full object-cover" loading="lazy" />
    </span>
  );
}

// What each step looks like — the brief as a note, then the real pictures.
function StepVisual({ step, title }: { step: number; title: string }) {
  const a = PROCESS_ART;
  if (step === 0) {
    return (
      <div className="relative rounded-[14px] p-6 sm:p-8 flex flex-col gap-3 w-full max-w-[380px] mx-auto" style={{ background: "var(--color-accent-100)", transform: "rotate(-1.5deg)", boxShadow: "var(--shadow-sm)" }} aria-hidden>
        <span style={{ color: "var(--color-accent-700)" }}>
          <DrawnIcon name="chat" size={40} />
        </span>
        {[82, 64, 90, 48].map((w, i) => (
          <span key={i} className="block h-[9px] rounded-full" style={{ width: `${w}%`, background: "var(--color-accent-200)" }} />
        ))}
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="relative flex items-end justify-center gap-2 rounded-[14px] px-6 pt-6 pb-3" style={{ background: "var(--color-accent-2-100)" }}>
        {a.characters.map((c) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={c.src} src={resizedUrl(c.src, 360)} alt={title} className="w-[42%] h-auto" style={{ filter: "drop-shadow(0 8px 10px rgba(40,28,16,.18))" }} loading="lazy" />
        ))}
      </div>
    );
  }
  const art = [null, null, a.thumbnails, a.color, a.lettered, a.printed][step]!;
  return <Picture art={art} alt={`${a.project.title} — ${title}`} className={step === 3 || step === 4 ? "max-w-[300px] mx-auto" : ""} />;
}

export function ProcessContent() {
  const { t } = useDict();
  const p = t.process;

  return (
    <>
      <PageHero
        kicker={p.kicker}
        title={p.title}
        body={p.body}
        primaryLabel={p.ctaPrimary}
        primaryHref="/cong-viec"
        secondaryLabel={p.ctaSecondary}
        secondaryHref="/du-an"
        art={<StageStrip stages={p.stages} />}
      />

      {/* ------------------------------------------------------ THE STEPS */}
      <section className="site-container py-14 sm:py-16">
        <Reveal className="flex flex-col items-center text-center gap-2 mb-12 sm:mb-16">
          <div className="text-xs font-bold tracking-[0.12em]" style={{ color: "var(--color-accent-2-700)" }}>
            {p.stepsKicker}
          </div>
          <h2 className="text-[28px] sm:text-[34px] leading-tight max-w-[640px]" style={{ textWrap: "balance" }}>
            {p.stepsTitle}
          </h2>
          <p className="max-w-[560px] text-[15px]" style={{ color: "var(--color-neutral-600)" }}>
            {p.exampleNote}{" "}
            <Link href={`/du-an?p=${PROCESS_ART.project.projectId}`} className="fk-navlink font-bold">
              {p.exampleLink}
            </Link>
          </p>
        </Reveal>

        <ol className="relative flex flex-col gap-12 sm:gap-16">
          {/* The thread the steps hang on (computer only). */}
          <span className="hidden lg:block absolute left-1/2 top-4 bottom-4 -translate-x-1/2" style={{ borderLeft: "2px dashed var(--color-neutral-300)" }} aria-hidden />
          {p.steps.map((step, i) => {
            const ex = p.exchange[i];
            const flip = i % 2 === 1;
            return (
              <li key={step.title} className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-20 items-center">
                <Reveal y={18} className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex items-center justify-center rounded-full font-heading font-bold text-[17px] flex-none"
                        style={{
                          width: 44,
                          height: 44,
                          background: i % 2 === 0 ? "var(--color-accent-500)" : "var(--color-accent-2-500)",
                          color: "#fff",
                        }}
                      >
                        {i + 1}
                      </span>
                      <h3 className="text-[22px] sm:text-[24px] leading-tight">{step.title}</h3>
                    </div>
                    <p className="text-[15.5px] leading-relaxed" style={{ color: "var(--color-neutral-700)" }}>
                      {step.desc}
                    </p>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1">
                      <div className="rounded-[12px] px-4 py-3" style={{ background: "var(--color-neutral-100)" }}>
                        <dt className="text-[11.5px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
                          {p.youSend}
                        </dt>
                        <dd className="text-[14px] leading-snug mt-1">{ex.give}</dd>
                      </div>
                      <div className="rounded-[12px] px-4 py-3" style={{ background: "var(--color-accent-100)" }}>
                        <dt className="text-[11.5px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-accent-700)" }}>
                          {p.weSend}
                        </dt>
                        <dd className="text-[14px] leading-snug mt-1">{ex.get}</dd>
                      </div>
                    </dl>
                  </div>
                </Reveal>
                <Reveal y={18} delay={80} className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
                  <StepVisual step={i} title={step.title} />
                </Reveal>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ------------------------------------------------------ THE FACTS */}
      <WaveEdge fill="var(--color-surface)" />
      <section className="py-12 sm:py-14" style={{ background: "var(--color-surface)" }}>
        <div className="site-container flex flex-col gap-8">
          <Reveal>
            <h2 className="text-[26px] sm:text-[30px] text-center leading-tight">{p.factsTitle}</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {p.facts.map((f, i) => (
              <Reveal key={f.value} delay={i * 80} className="h-full">
                <div className="h-full flex flex-col gap-2 rounded-[18px] p-6 text-center items-center" style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" }}>
                  <span className="font-heading font-bold text-[30px] leading-none" style={{ color: "var(--color-accent-600)" }}>
                    {f.value}
                  </span>
                  <span className="text-[14.5px] leading-snug" style={{ color: "var(--color-neutral-700)" }}>
                    {f.label}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <div style={{ background: "var(--color-surface)" }}>
        <WaveEdge fill="var(--color-bg)" flip />
      </div>

      <Reveal>
        <FaqSection title={p.faqTitle} items={PROCESS_FAQ.map((i) => t.services.faq[i]).filter(Boolean)} />
      </Reveal>

      <Reveal>
        <CtaBanner title={t.ctaBanner.title} body={t.ctaBanner.body} ctaLabel={t.ctaBanner.cta} />
      </Reveal>
    </>
  );
}
