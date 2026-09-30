"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { EditableImage } from "./EditableImage";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { Reveal } from "./Reveal";
import { useDict } from "@/components/site/LocaleProvider";
import { categoryLabel } from "@/lib/dictionary";
import { pickLocalized } from "@/lib/i18n";
import { updateNewsPost } from "@/lib/actions/admin";
import { resizedUrl } from "@/lib/imageTransform";
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosts(initialPosts);
  }, [initialPosts]);

  const [cat, setCat] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(posts.map((p) => p.category))], [posts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter(
      (p) =>
        (!cat || p.category === cat) &&
        (!q || p.title.toLowerCase().includes(q) || (p.title_en?.toLowerCase().includes(q) ?? false)),
    );
  }, [posts, query, cat]);

  const showFallback = posts.length === 0 && !query;
  const dateLocale = locale === "en" ? "en-US" : "vi-VN";
  // The newest story, large, above the rest — only on the unfiltered list.
  const lead = !query && !cat ? filtered[0] : undefined;
  const rest = lead ? filtered.slice(1) : filtered;
  const chip = (on: boolean) => ({
    background: on ? "var(--color-accent-2-700)" : "var(--color-panel)",
    color: on ? "#fff" : "var(--color-neutral-700)",
    boxShadow: on ? "none" : "inset 0 0 0 1px var(--color-neutral-200)",
  });

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="-mx-5 px-5 md:mx-0 md:px-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <div className="flex items-center gap-2 w-max">
            {[null, ...categories].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className="rounded-full px-4 py-2 text-[13.5px] font-bold whitespace-nowrap"
                style={chip(cat === c)}
              >
                {c ? categoryLabel(locale, c) : t.news.allCategories}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 md:w-[320px] md:flex-none">
          <input className="input" placeholder={t.news.searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm flex-none" onClick={() => setEditing("new")}>
              {t.news.addPost}
            </button>
          )}
        </div>
      </div>

      {lead && (
        <Link
          href={`/tin-tuc/${lead.slug}`}
          className="group grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-5 md:gap-8 items-center mb-10 rounded-[20px] p-3 md:p-4"
          style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-sm)", opacity: lead.published ? 1 : 0.6 }}
        >
          <span className="block relative overflow-hidden rounded-[14px]" style={{ aspectRatio: "16 / 10", background: "var(--color-surface)" }}>
            {lead.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resizedUrl(lead.cover_image_url, 1000)}
                alt={lead.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            )}
          </span>
          <span className="flex flex-col gap-3 px-2 pb-3 md:pb-0 md:pr-6">
            <span className="flex items-center gap-2">
              <span className="tag tag-accent w-fit">{t.news.latest}</span>
              <span className="tag tag-accent-2 w-fit">{categoryLabel(locale, lead.category)}</span>
            </span>
            <span className="font-heading font-bold text-[22px] sm:text-[26px] leading-tight" style={{ color: "var(--color-text)" }}>
              {pickLocalized(locale, lead.title, lead.title_en)}
            </span>
            {(lead.excerpt || lead.excerpt_en) && (
              <span className="text-[15px] leading-relaxed line-clamp-3" style={{ color: "var(--color-neutral-700)" }}>
                {pickLocalized(locale, lead.excerpt ?? "", lead.excerpt_en)}
              </span>
            )}
            <span className="flex items-center gap-4 text-xs" style={{ color: "var(--color-neutral-500)" }}>
              {new Date(lead.created_at).toLocaleDateString(dateLocale)}
              {!lead.published && ` · ${t.news.unpublished}`}
              {canEdit && (
                <button
                  type="button"
                  className="font-bold"
                  style={{ color: "var(--color-accent-600)" }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditing(lead);
                  }}
                >
                  {t.news.edit}
                </button>
              )}
            </span>
          </span>
        </Link>
      )}

      {showFallback ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((post, i) => (
            <Reveal key={post.id} delay={(i % 3) * 80} y={20}>
              <Link
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
                  resizeWidth={500}
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
            </Reveal>
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
