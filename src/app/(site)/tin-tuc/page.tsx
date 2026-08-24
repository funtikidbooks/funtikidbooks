import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { NewsGrid } from "@/components/site/NewsGrid";
import { getContentEditorRole, getNewsPosts, getSiteSettings } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";

const PAGE_DESCRIPTION = "Tin tức, dự án mới và cập nhật từ Funti Kidbooks Studio — xưởng minh hoạ sách thiếu nhi.";

export const metadata: Metadata = {
  title: "Tin tức",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Tin tức · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Tin tức · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default async function NewsPage() {
  const [editorRole, locale] = await Promise.all([getContentEditorRole(), getLocale()]);
  const canEdit = editorRole !== null;
  const t = dictionary[locale].news;

  const [posts, settings] = await Promise.all([
    getNewsPosts(canEdit),
    getSiteSettings(["hero-tin-tuc"]),
  ]);

  return (
    <>
      <PageHero
        kicker={t.kicker}
        title={t.title}
        body={t.body}
        emoji="📰"
        heroKey="hero-tin-tuc"
        imageSrc={settings["hero-tin-tuc"]}
        canEditImage={canEdit}
        revalidatePaths={["/tin-tuc"]}
      />
      <section className="max-w-[1280px] mx-auto px-5 pb-16">
        <NewsGrid initialPosts={posts} canEdit={canEdit} />
      </section>
    </>
  );
}
