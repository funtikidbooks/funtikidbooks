"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { EditableImage } from "./EditableImage";
import { Reveal } from "./Reveal";
import { useDict } from "@/components/site/LocaleProvider";
import { pickLocalized } from "@/lib/i18n";
import { employmentTypeLabel, EMPLOYMENT_TYPES } from "@/lib/jobPostings";
import { updateJobPosting } from "@/lib/actions/admin";
import type { JobPosting } from "@/lib/types";

// Code-split: the rich-text editor (TipTap) it pulls in is heavy and only
// director/admin ever open this dialog — regular visitors shouldn't pay for
// it in their initial page load.
const JobPostingEditDialog = dynamic(
  () => import("@/components/admin/JobPostingEditDialog").then((m) => m.JobPostingEditDialog),
  { ssr: false },
);

export function JobPostingsGrid({ initialPosts, canEdit }: { initialPosts: JobPosting[]; canEdit: boolean }) {
  const { locale, t } = useDict();
  const [posts, setPosts] = useState(initialPosts);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<JobPosting | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => p.title.toLowerCase().includes(q) || (p.title_en?.toLowerCase().includes(q) ?? false));
  }, [posts, query]);

  const dateLocale = locale === "en" ? "en-US" : "vi-VN";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="max-w-[360px] flex-1 min-w-[220px]">
          <input
            className="input"
            placeholder={t.careers.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {canEdit && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
            {t.careers.addPost}
          </button>
        )}
      </div>

      {posts.length === 0 && !query ? (
        <div className="card elev-sm flex flex-col items-center gap-2 py-16 px-6 text-center">
          <span className="text-3xl" aria-hidden>
            🌱
          </span>
          <p className="text-sm font-semibold">{t.careers.emptyTitle}</p>
          <p className="text-sm max-w-[420px]" style={{ color: "var(--color-neutral-500)" }}>
            {t.careers.emptyBody}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--color-neutral-500)" }}>{t.careers.noResults}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post, i) => {
            const emp = EMPLOYMENT_TYPES.find((e) => e.value === post.employment_type);
            return (
              <Reveal key={post.id} delay={(i % 3) * 80} y={20}>
                <Link
                  href={`/tuyen-dung/${post.slug}`}
                  className="card elev-sm overflow-hidden flex flex-col transition-transform hover:-translate-y-0.5"
                  style={{ opacity: post.published ? 1 : 0.6 }}
                >
                  <EditableImage
                    src={post.cover_image_url}
                    alt={post.title}
                    emoji={emp?.icon ?? "💼"}
                    canEdit={canEdit}
                    onUpload={async (file) => {
                      const updated = await updateJobPosting(post.id, { cover: file });
                      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
                      return updated.cover_image_url ?? "";
                    }}
                    className="w-full"
                    style={{ height: 150, borderRadius: 0 }}
                    resizeWidth={500}
                  />
                  <div className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tag tag-accent-2 w-fit">
                        {emp?.icon} {employmentTypeLabel(locale, post.employment_type)}
                      </span>
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
                          {t.careers.edit}
                        </button>
                      )}
                    </div>
                    <h3 className="text-sm">{pickLocalized(locale, post.title, post.title_en)}</h3>
                    {post.location && (
                      <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                        📍 {post.location}
                      </span>
                    )}
                    {post.deadline && (
                      <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                        {t.careers.deadline}: {new Date(post.deadline).toLocaleDateString(dateLocale)}
                      </span>
                    )}
                    {!post.published && (
                      <span className="tag tag-neutral w-fit">{t.careers.unpublished}</span>
                    )}
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      )}

      {editing && (
        <JobPostingEditDialog
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
