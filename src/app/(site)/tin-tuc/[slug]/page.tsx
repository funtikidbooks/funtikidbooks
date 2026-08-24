import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsArticleView } from "@/components/site/NewsArticleView";
import { getContentEditorRole, getNewsPostBySlug } from "@/lib/data/site-content";
import { getLocale } from "@/lib/getLocale";
import { pickLocalized } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [post, locale] = await Promise.all([getNewsPostBySlug(slug), getLocale()]);
  if (!post) return { title: "Tin tức" };

  const title = pickLocalized(locale, post.title, post.title_en);
  const excerpt = pickLocalized(locale, post.excerpt, post.excerpt_en);

  return {
    title,
    description: excerpt ?? undefined,
    openGraph: {
      title,
      description: excerpt ?? undefined,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, editorRole] = await Promise.all([getNewsPostBySlug(slug), getContentEditorRole()]);
  if (!post) notFound();

  return <NewsArticleView initialPost={post} canEdit={editorRole !== null} />;
}
