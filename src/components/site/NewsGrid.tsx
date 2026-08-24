"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { EditableImage } from "./EditableImage";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { useDict } from "@/components/site/LocaleProvider";
import { categoryLabel } from "@/lib/dictionary";
import { pickLocalized } from "@/lib/i18n";
import { updateNewsPost } from "@/lib/actions/admin";
import type { NewsPost } from "@/lib/types";

// Code-split: the rich-text editor (TipTap) it pulls in is heavy and only
// director/admin ever open this dialog — regular visitors shouldn't pay for
// it in their initial page load.
const NewsEditDialog = dynamic(() => import("@/components/admin/NewsEditDialog").then((m) => m.NewsEditDialog), {
  ssr: false,
});

const FALLBACK_ARTICLES = [
  { title: "Funti Kidbooks Studio ra mắt bộ sách tranh mới", date: "12/07/2026", tag: "Dự án" },
  { title: "Behind the scenes: quy trình phác thảo nhân vật", date: "28/06/2026", tag: "Studio" },
  { title: "5 xu hướng minh hoạ sách thiếu nhi năm 2026", date: "15/06/2026", tag: "Chia sẻ" },
  { title: "Funti hợp tác cùng nhà xuất bản ABC", date: "02/06/2026", tag: "Đối tác" },
];

export function NewsGrid({ initialPosts, canEdit }: { initialPosts: NewsPost[]; canEdit: boolean }) {
  const { locale, t } = useDict();
  const [posts, setPosts] = useState(initialPosts);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<NewsPost | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => p.title.toLowerCase().includes(q) || (p.title_en?.toLowerCase().includes(q) ?? false));
  }, [posts, query]);

  const showFallback = posts.length === 0 && !query;
  const dateLocale = locale === "en" ? "en-US" : "vi-VN";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="max-w-[360px] flex-1 min-w-[220px]">
          <input
            className="input"
            placeholder={t.news.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
            {t.news.addPost}
          </button>
        )}
      </div>

      {showFallback ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FALLBACK_ARTICLES.map((a) => (
            <article key={a.title} className="card elev-sm overflow-hidden flex flex-col">
              <ImagePlaceholder emoji="📰" style={{ minHeight: 170, borderRadius: 0 }} />
              <div className="p-4 flex flex-col gap-2">
                <span className="tag tag-accent-2 w-fit">{categoryLabel(locale, a.tag)}</span>
                <h3 className="text-sm">{a.title}</h3>
                <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  {a.date}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--color-neutral-500)" }}>{t.news.noResults}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            <Link
              key={post.id}
              href={`/tin-tuc/${post.slug}`}
              className="card elev-sm overflow-hidden flex flex-col transition-transform hover:-translate-y-0.5"
              style={{ opacity: post.published ? 1 : 0.6 }}
            >
              <EditableImage
                src={post.cover_image_url}
                alt={post.title}
                emoji="📰"
                canEdit={canEdit}
                onUpload={async (file) => {
                  const updated = await updateNewsPost(post.id, { cover: file });
                  setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
                  return updated.cover_image_url ?? "";
                }}
                className="w-full"
                style={{ height: 170, borderRadius: 0 }}
              />
              <div className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="tag tag-accent-2 w-fit">{categoryLabel(locale, post.category)}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="text-xs font-bold"
                      style={{ color: "var(--color-accent-600)" }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditing(post);
                      }}
                    >
                      {t.news.edit}
                    </button>
                  )}
                </div>
                <h3 className="text-sm">{pickLocalized(locale, post.title, post.title_en)}</h3>
                <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  {new Date(post.created_at).toLocaleDateString(dateLocale)}
                  {!post.published && ` · ${t.news.unpublished}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {editing && (
        <NewsEditDialog
          post={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(p) => setPosts((prev) => [p, ...prev])}
          onUpdated={(id, patch) => setPosts((prev) => prev.map((p) => (p.id === id ? patch : p)))}
          onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
        />
      )}
    </>
  );
}
