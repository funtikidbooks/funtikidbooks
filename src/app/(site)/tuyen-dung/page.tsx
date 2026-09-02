import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { JobPostingsGrid } from "@/components/site/JobPostingsGrid";
import { getContentEditorRole, getJobPostings, getSiteSettings } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { dictionary } from "@/lib/dictionary";

const PAGE_DESCRIPTION = "Vị trí đang tuyển dụng tại Funti Kidbooks Studio — xưởng minh hoạ sách thiếu nhi.";

export const metadata: Metadata = {
  title: "Tuyển dụng",
  description: PAGE_DESCRIPTION,
  openGraph: { title: "Tuyển dụng · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
  twitter: { title: "Tuyển dụng · Funti Kidbooks Studio", description: PAGE_DESCRIPTION },
};

export default async function CareersPage() {
  const [editorRole, locale] = await Promise.all([getContentEditorRole(), getLocale()]);
  const canEdit = editorRole !== null;
  const t = dictionary[locale].careers;

  const [posts, settings] = await Promise.all([
    getJobPostings(canEdit),
    getSiteSettings(["hero-tuyen-dung"]),
  ]);

  return (
    <>
      <PageHero
        kicker={t.kicker}
        title={t.title}
        body={t.body}
        emoji="🌱"
        heroKey="hero-tuyen-dung"
        imageSrc={settings["hero-tuyen-dung"]}
        canEditImage={canEdit}
        revalidatePaths={["/tuyen-dung"]}
      />
      <section className="site-container pb-16">
        <JobPostingsGrid initialPosts={posts} canEdit={canEdit} />
      </section>
    </>
  );
}
