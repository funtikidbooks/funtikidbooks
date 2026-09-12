"use client";

import { PageHero } from "@/components/site/PageHero";
import { NewsGrid } from "@/components/site/NewsGrid";
import { useDict } from "@/components/site/LocaleProvider";
import { useViewer } from "@/components/site/ViewerProvider";
import { useEditorSwap } from "@/lib/hooks/useEditorSwap";
import { fetchAllNewsForEditor } from "@/lib/actions/editorContent";
import type { NewsPost } from "@/lib/types";

export function NewsPageContent({
  initialPosts,
  heroImage,
}: {
  initialPosts: NewsPost[];
  heroImage: string | undefined;
}) {
  const { t: fullT } = useDict();
  const t = fullT.news;
  const { canEdit } = useViewer();
  const posts = useEditorSwap(canEdit, fetchAllNewsForEditor, initialPosts);

  return (
    <>
      <PageHero
        kicker={t.kicker}
        title={t.title}
        body={t.body}
        emoji="📰"
        heroKey="hero-tin-tuc"
        imageSrc={heroImage}
        canEditImage={canEdit}
        revalidatePaths={["/tin-tuc"]}
      />
      <section className="site-container pb-16">
        <NewsGrid initialPosts={posts} canEdit={canEdit} />
      </section>
    </>
  );
}
