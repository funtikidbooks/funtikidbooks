import type { Metadata } from "next";
import { JobPostingView } from "@/components/site/JobPostingView";
import { DraftPost } from "@/components/site/DraftPost";
import { getJobPostingBySlug, getPublishedJobSlugs } from "@/lib/data/site-content";

// Static, same as tin-tuc/[slug] — see its comment.
export async function generateStaticParams() {
  return (await getPublishedJobSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getJobPostingBySlug(slug);
  if (!post) return { title: "Tuyển dụng", robots: { index: false } };
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

export default async function JobPostingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getJobPostingBySlug(slug);
  if (!post) return <DraftPost kind="job" slug={slug} />;
  return <JobPostingView initialPost={post} />;
}
