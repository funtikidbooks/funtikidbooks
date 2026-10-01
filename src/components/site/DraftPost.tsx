"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useViewer } from "@/components/site/ViewerProvider";
import { NewsArticleView } from "@/components/site/NewsArticleView";
import { JobPostingView } from "@/components/site/JobPostingView";
import { fetchDraftJobPosting, fetchDraftNewsPost } from "@/lib/actions/editorContent";
import type { JobPosting, NewsPost } from "@/lib/types";

// An article/job link the static page has no published post for: a draft
// (shown to a director/admin, fetched from their browser), or nothing.
export function DraftPost({ kind, slug }: { kind: "news" | "job"; slug: string }) {
  const { canEdit } = useViewer();
  const [post, setPost] = useState<NewsPost | JobPosting | null | undefined>(undefined);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    (kind === "news" ? fetchDraftNewsPost(slug) : fetchDraftJobPosting(slug)).then(
      (p) => !cancelled && setPost(p),
      () => !cancelled && setPost(null),
    );
    return () => {
      cancelled = true;
    };
  }, [canEdit, kind, slug]);

  if (post) return kind === "news" ? <NewsArticleView initialPost={post as NewsPost} /> : <JobPostingView initialPost={post as JobPosting} />;

  const back = kind === "news" ? { href: "/tin-tuc", label: "Xem các bài viết khác" } : { href: "/tuyen-dung", label: "Xem các vị trí đang tuyển" };
  return (
    <section className="site-container py-24 flex flex-col items-center gap-4 text-center">
      {canEdit && post === undefined ? (
        <p style={{ color: "var(--color-neutral-500)" }}>Đang tải…</p>
      ) : (
        <>
          <h1 className="text-2xl">{kind === "news" ? "Không tìm thấy bài viết" : "Không tìm thấy vị trí tuyển dụng"}</h1>
          <p style={{ color: "var(--color-neutral-600)" }}>Có thể bài đã được gỡ hoặc đường dẫn bị sai.</p>
          <Link href={back.href} className="btn btn-primary">
            {back.label}
          </Link>
        </>
      )}
    </section>
  );
}
