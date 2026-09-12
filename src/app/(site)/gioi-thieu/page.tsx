import type { Metadata } from "next";
import type { TimelineItem } from "@/components/site/AboutTimeline";
import type { TeamMember } from "@/components/site/AboutTeam";
import type { AboutHeroText } from "@/components/site/AboutHero";
import { DEFAULT_CULTURE_TRANSFORM } from "@/components/site/CultureImage";
import { getJsonSetting, getSiteSettings } from "@/lib/data/site-content";
import { AboutPageContent } from "./AboutPageContent";

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

// Shown only until the director fills in real hero copy for this page —
// not locale-aware since it's a placeholder, matching DEFAULT_TIMELINE/
// DEFAULT_TEAM above.
const DEFAULT_HERO_TEXT: AboutHeroText = {
  headline: "Chúng tôi là Funti Kidbooks Studio",
  roleLine: "Xưởng minh hoạ sách thiếu nhi",
  body: "Một đội ngũ hoạ sĩ đam mê kể chuyện qua từng nét vẽ.",
};

export default async function AboutPage() {
  const [timeline, team, cultureTransform, settings, heroText] = await Promise.all([
    getJsonSetting("gioi-thieu-timeline", DEFAULT_TIMELINE),
    getJsonSetting("gioi-thieu-team", DEFAULT_TEAM),
    getJsonSetting("gioi-thieu-culture-transform", DEFAULT_CULTURE_TRANSFORM),
    getSiteSettings(["gioi-thieu-hero-video", "gioi-thieu-culture-image", "gioi-thieu-culture-opacity"]),
    getJsonSetting<AboutHeroText>("gioi-thieu-hero-text", DEFAULT_HERO_TEXT),
  ]);

  return (
    <AboutPageContent
      timeline={timeline}
      team={team}
      cultureTransform={cultureTransform}
      settings={settings}
      heroText={heroText}
    />
  );
}
