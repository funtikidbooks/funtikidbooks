"use client";

import Link from "next/link";
import { AboutHero, type AboutHeroText } from "@/components/site/AboutHero";
import { AboutTimeline, type TimelineItem } from "@/components/site/AboutTimeline";
import { AboutTeam, type TeamMember } from "@/components/site/AboutTeam";
import { CultureImage } from "@/components/site/CultureImage";
import { CtaBanner } from "@/components/site/CtaBanner";
import { Reveal } from "@/components/site/Reveal";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import type { ImageTransform } from "@/components/site/EditableImage";
import { DrawnIcon, type DrawnIconName } from "@/components/site/Doodles";

// Tận tâm, Sáng tạo, Hợp tác, Chất lượng.
const CULTURE_ICONS: DrawnIconName[] = ["sprout", "bulb", "hands", "book"];

export function AboutPageContent({
  timeline,
  team,
  cultureTransform,
  settings,
  heroText,
}: {
  timeline: TimelineItem[];
  team: TeamMember[];
  cultureTransform: ImageTransform;
  settings: Record<string, string>;
  heroText: AboutHeroText;
}) {
  const { t } = useDict();
  const { canEdit } = useViewer();

  return (
    <>
      <AboutHero
        kicker={t.about.kicker}
        text={heroText}
        stats={t.about.stats}
        videoSrc={settings["gioi-thieu-hero-video"] ?? null}
        canEdit={canEdit}
      />

      <AboutTimeline items={timeline} canEdit={canEdit} />

      <AboutTeam members={team} canEdit={canEdit} />

      {/* Culture band */}
      <section className="relative py-16" style={{ background: "linear-gradient(135deg, var(--color-accent-2-100), var(--color-accent-100))" }}>
        <CultureImage
          imageSrc={settings["gioi-thieu-culture-image"] ?? null}
          opacityPct={Number(settings["gioi-thieu-culture-opacity"] ?? 35)}
          transform={cultureTransform}
          canEdit={canEdit}
        />
        <Reveal className="relative z-[1] max-w-[880px] mx-auto px-5 flex flex-col items-center text-center gap-4">
          <h2 className="text-3xl">{t.about.cultureTitle}</h2>
          <p className="text-base max-w-[560px]" style={{ color: "var(--color-neutral-700)" }}>
            {t.about.cultureBody}
          </p>
          <Link href="/tuyen-dung" className="btn btn-primary mt-1">
            {t.about.cultureCta}
          </Link>

          <div className="flex flex-wrap justify-center gap-4 mt-6">
            {t.about.cultureValues.map((v, i) => (
              <div
                key={v.label}
                className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full"
                style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" }}
              >
                <span style={{ color: i % 2 ? "var(--color-accent-2-700)" : "var(--color-accent-600)" }}>
                  <DrawnIcon name={CULTURE_ICONS[i % CULTURE_ICONS.length]} size={22} />
                </span>
                <span className="text-sm font-bold">{v.label}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <Reveal>
        <CtaBanner title={t.ctaBanner.title} body={t.ctaBanner.body} ctaLabel={t.ctaBanner.cta} />
      </Reveal>
    </>
  );
}
