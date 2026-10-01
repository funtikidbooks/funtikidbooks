import type { Metadata } from "next";
import { NewsArticleView } from "@/components/site/NewsArticleView";
import { DraftPost } from "@/components/site/DraftPost";
import { getNewsPostBySlug, getPublishedNewsSlugs } from "@/lib/data/site-content";

// Static like the rest of the public site — no cookies in the render path
// (they made every view a fresh render in Singapore). Published articles are
// prerendered and refreshed when one is saved (revalidatePath in
// lib/actions/admin.ts); the language and edit rights are picked up in the
// browser, and a draft's link shows the draft to an editor (DraftPost).
export async function generateStaticParams() {
  return (await getPublishedNewsSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getNewsPostBySlug(slug);
  if (!post) return { title: "Tin tức", robots: { index: false } };
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getNewsPostBySlug(slug);
  if (!post) return <DraftPost kind="news" slug={slug} />;
  return <NewsArticleView initialPost={post} />;
}
