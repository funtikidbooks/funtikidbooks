"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditableImage } from "./EditableImage";
import { useDict } from "@/components/site/LocaleProvider";
import { categoryLabel } from "@/lib/dictionary";
import { pickLocalized } from "@/lib/i18n";
import { updateNewsPost } from "@/lib/actions/admin";
import type { NewsPost } from "@/lib/types";

// Code-split: only director/admin ever open this dialog.
const NewsEditDialog = dynamic(() => import("@/components/admin/NewsEditDialog").then((m) => m.NewsEditDialog), {
  ssr: false,
});

export function NewsArticleView({ initialPost, canEdit }: { initialPost: NewsPost; canEdit: boolean }) {
  const { locale, t } = useDict();
  const [post, setPost] = useState(initialPost);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  const title = pickLocalized(locale, post.title, post.title_en);
  const excerpt = pickLocalized(locale, post.excerpt, post.excerpt_en);
  const content = pickLocalized(locale, post.content, post.content_en);
  const dateLocale = locale === "en" ? "en-US" : "vi-VN";

  return (
    <article className="max-w-[760px] mx-auto px-5 pt-10 pb-20">
      <Link href="/tin-tuc" className="text-sm font-bold inline-flex items-center gap-1 mb-6" style={{ color: "var(--color-accent-600)" }}>
        {t.news.backToAll}
      </Link>

      <div className="flex items-center gap-2 mb-3">
        <span className="tag tag-accent-2 w-fit">{categoryLabel(locale, post.category)}</span>
        {!post.published && <span className="tag tag-neutral w-fit">{t.news.unpublished}</span>}
      </div>

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-[28px] lg:text-[34px] leading-[1.2]">{title}</h1>
        {canEdit && (
          <button type="button" className="btn btn-secondary btn-sm flex-none" onClick={() => setEditing(true)}>
            {t.news.editPost}
          </button>
        )}
      </div>

      <p className="text-sm mb-6" style={{ color: "var(--color-neutral-500)" }}>
        {new Date(post.created_at).toLocaleDateString(dateLocale, { day: "2-digit", month: "long", year: "numeric" })}
      </p>

      <EditableImage
        src={post.cover_image_url}
        alt={title}
        emoji="📰"
        canEdit={canEdit}
        onUpload={async (file) => {
          const updated = await updateNewsPost(post.id, { cover: file });
          setPost(updated);
          return updated.cover_image_url ?? "";
        }}
        className="w-full mb-8"
        style={{ height: 340 }}
      />

      {excerpt && (
        <p className="text-base font-semibold mb-6" style={{ color: "var(--color-neutral-700)" }}>
          {excerpt}
        </p>
      )}

      {content && <div className="rich-content" dangerouslySetInnerHTML={{ __html: content }} />}

      {editing && (
        <NewsEditDialog
          post={post}
          onClose={() => setEditing(false)}
          onCreated={() => {}}
          onUpdated={(_id, patch) => setPost(patch)}
          onDeleted={() => router.push("/tin-tuc")}
        />
      )}
    </article>
  );
}
