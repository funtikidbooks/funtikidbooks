import type { Metadata } from "next";
import Link from "next/link";
import { AboutHero, type AboutHeroText } from "@/components/site/AboutHero";
import { AboutTimeline, type TimelineItem } from "@/components/site/AboutTimeline";
import { AboutTeam, type TeamMember } from "@/components/site/AboutTeam";
import { CultureImage, DEFAULT_CULTURE_TRANSFORM } from "@/components/site/CultureImage";
import { CtaBanner } from "@/components/site/CtaBanner";
import { Reveal } from "@/components/site/Reveal";
import { getContentEditorRole, getJsonSetting, getSiteSettings } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";

const PAGE_DESCRIPTION =
  "Funti Kidbooks Studio là xưởng minh hoạ sách thiếu nhi với đội ngũ hoạ sĩ tài năng, chuyên vẽ minh hoạ tay theo phong cách màu nước ấm áp cho sách, storyboard và tài liệu giáo dục.";

export const metadata: Metadata = {
  title: "Giới thiệu",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Giới thiệu · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Giới thiệu · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

// Shown only until the director fills in the real company history — a
// starting draft matching the studio's own design mockup for this page.
const DEFAULT_TIMELINE: TimelineItem[] = [
  {
    id: "seed-1",
    year: "2020",
    title: "Bắt đầu từ con số 0",
    titleEn: "Starting from zero",
    description:
      "Funti khởi đầu từ một xưởng nhỏ với niềm đam mê minh hoạ sách thiếu nhi và khát khao mang những câu chuyện đẹp đến với trẻ em Việt Nam.",
    descriptionEn:
      "Funti began as a small studio, driven by a passion for children's book illustration and a wish to bring beautiful stories to Vietnamese children.",
    image: null,
  },
  {
    id: "seed-2",
    year: "2022",
    title: "Ra mắt sách Funti Kidbooks",
    titleEn: "Launching Funti Kidbooks",
    description:
      "Những cuốn sách đầu tiên mang thương hiệu Funti Kidbooks chính thức ra mắt, đánh dấu bước chuyển mình từ xưởng vẽ thành nhà sáng tạo nội dung.",
    descriptionEn:
      "The first books under the Funti Kidbooks name launched, marking our shift from an illustration studio to a content creator.",
    image: null,
  },
  {
    id: "seed-3",
    year: "2023",
    title: "Funti Kidbooks Studio",
    titleEn: "Funti Kidbooks Studio",
    description:
      "Đội ngũ mở rộng với các hoạ sĩ, thiết kế và quản lý dự án chuyên nghiệp — chính thức trở thành Funti Kidbooks Studio.",
    descriptionEn:
      "The team grew with dedicated illustrators, designers, and project managers — officially becoming Funti Kidbooks Studio.",
    image: null,
  },
  {
    id: "seed-4",
    year: "Hiện tại",
    yearEn: "Present",
    title: "Tiếp tục kể những câu chuyện mới",
    titleEn: "Continuing to tell new stories",
    description:
      "Funti tiếp tục đồng hành cùng tác giả, nhà xuất bản và thương hiệu, không ngừng sáng tạo những câu chuyện mới cho trẻ em.",
    descriptionEn:
      "Funti continues partnering with authors, publishers, and brands — always creating new stories for children.",
    image: null,
  },
];

const DEFAULT_TEAM: TeamMember[] = [
  { id: "seed-1", name: "Phúc Trần", role: "CEO Founder", roleEn: "CEO & Founder", bio: null, bioEn: null, photo: null },
];

export default async function AboutPage() {
  const [locale, editorRole, timeline, team, cultureTransform, settings] = await Promise.all([
    getLocale(),
    getContentEditorRole(),
    getJsonSetting("gioi-thieu-timeline", DEFAULT_TIMELINE),
    getJsonSetting("gioi-thieu-team", DEFAULT_TEAM),
    getJsonSetting("gioi-thieu-culture-transform", DEFAULT_CULTURE_TRANSFORM),
    getSiteSettings(["gioi-thieu-hero-video", "gioi-thieu-culture-image", "gioi-thieu-culture-opacity"]),
  ]);
  const canEdit = editorRole !== null;
  const t = dictionary[locale];
  const heroText = await getJsonSetting<AboutHeroText>("gioi-thieu-hero-text", {
    headline: t.about.title,
    roleLine: t.about.roleLine,
    body: t.about.body,
  });

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
            {t.about.cultureValues.map((v) => (
              <div
                key={v.label}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full"
                style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" }}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {v.icon}
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
