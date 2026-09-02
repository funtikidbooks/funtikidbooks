"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useDict } from "@/components/site/LocaleProvider";
import { pickLocalized } from "@/lib/i18n";
import { employmentTypeLabel, EMPLOYMENT_TYPES } from "@/lib/jobPostings";
import type { JobPosting } from "@/lib/types";

// Code-split: the rich-text editor (TipTap) it pulls in is heavy and only
// director/admin ever open this dialog — regular visitors shouldn't pay for
// it in their initial page load.
const JobPostingEditDialog = dynamic(
  () => import("@/components/admin/JobPostingEditDialog").then((m) => m.JobPostingEditDialog),
  { ssr: false },
);

function JobRow({ post, canEdit, onEdit }: { post: JobPosting; canEdit: boolean; onEdit: () => void }) {
  const { locale, t } = useDict();
  const dateLocale = locale === "en" ? "en-US" : "vi-VN";
  const emp = EMPLOYMENT_TYPES.find((e) => e.value === post.employment_type);

  return (
    <Link
      href={`/tuyen-dung/${post.slug}`}
      className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--color-surface)]"
      style={{ opacity: post.published && !post.closed ? 1 : 0.6 }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center rounded-full text-lg flex-none"
        style={{ width: 44, height: 44, background: "var(--color-accent-100)" }}
      >
        {emp?.icon ?? "💼"}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <h3 className="text-sm font-bold truncate">{pickLocalized(locale, post.title, post.title_en)}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" style={{ color: "var(--color-neutral-500)" }}>
          {post.location && <span>📍 {post.location}</span>}
          {post.deadline && (
            <span>
              {t.careers.deadline}: {new Date(post.deadline).toLocaleDateString(dateLocale)}
            </span>
          )}
          {!post.published && <span>· {t.careers.unpublished}</span>}
        </div>
      </div>
      <span className="tag tag-accent-2 flex-none whitespace-nowrap">{employmentTypeLabel(locale, post.employment_type)}</span>
      {post.closed && <span className="tag tag-neutral flex-none whitespace-nowrap">{t.careers.closed}</span>}
      {canEdit && (
        <button
          type="button"
          className="text-xs font-bold flex-none"
          style={{ color: "var(--color-accent-600)" }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
        >
          {t.careers.edit}
        </button>
      )}
    </Link>
  );
}

export function JobPostingsSection({ initialPosts, canEdit }: { initialPosts: JobPosting[]; canEdit: boolean }) {
  const { t } = useDict();
  const [posts, setPosts] = useState(initialPosts);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<JobPosting | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? posts.filter((p) => p.title.toLowerCase().includes(q) || (p.title_en?.toLowerCase().includes(q) ?? false))
      : posts;
    // Open positions surface first (stable sort keeps each group's own
    // newest-first order from the initial query).
    return [...matched].sort((a, b) => Number(a.closed) - Number(b.closed));
  }, [posts, query]);

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
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t.careers.recentTitle}</h2>
          <div className="card elev-sm overflow-hidden flex flex-col divide-y" style={{ borderColor: "var(--color-neutral-200)" }}>
            {filtered.map((post) => (
              <div key={post.id} className="[&:not(:last-child)]:border-b" style={{ borderColor: "var(--color-neutral-200)" }}>
                <JobRow post={post} canEdit={canEdit} onEdit={() => setEditing(post)} />
              </div>
            ))}
          </div>
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
