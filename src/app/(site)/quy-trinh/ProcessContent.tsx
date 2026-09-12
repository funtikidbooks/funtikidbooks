"use client";

import { PageHero } from "@/components/site/PageHero";
import { CtaBanner } from "@/components/site/CtaBanner";
import { Reveal } from "@/components/site/Reveal";
import { useDict } from "@/components/site/LocaleProvider";

export function ProcessContent() {
  const { t } = useDict();

  return (
    <>
      <PageHero
        kicker={t.process.kicker}
        title={t.process.title}
        body={t.process.body}
        primaryLabel={t.process.ctaPrimary}
        primaryHref="/lien-he"
        secondaryLabel={t.process.ctaSecondary}
        secondaryHref="/du-an"
        emoji="🧭"
      />

      <section className="site-container py-14">
        <Reveal className="flex flex-col items-center text-center gap-2 mb-12">
          <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
            {t.process.stepsKicker}
          </div>
          <h2 className="text-3xl max-w-[560px]">{t.process.stepsTitle}</h2>
        </Reveal>

        <div className="flex flex-col gap-4 max-w-[760px] mx-auto">
          {t.process.steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 80} y={18} className="card elev-sm p-6 flex gap-5 items-start">
              <div
                className="flex items-center justify-center rounded-full font-heading font-bold text-lg flex-none"
                style={{
                  width: 52,
                  height: 52,
                  background: i % 2 === 0 ? "var(--color-accent-100)" : "var(--color-accent-2-100)",
                  color: i % 2 === 0 ? "var(--color-accent-700)" : "var(--color-accent-2-800)",
                }}
              >
                0{i + 1}
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg">{step.title}</h3>
                <p style={{ color: "var(--color-neutral-600)" }}>{step.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal>
        <CtaBanner title={t.ctaBanner.title} body={t.ctaBanner.body} ctaLabel={t.ctaBanner.cta} />
      </Reveal>
    </>
  );
}
