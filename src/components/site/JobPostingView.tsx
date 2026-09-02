"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EditableImage } from "./EditableImage";
import { useDict } from "@/components/site/LocaleProvider";
import { pickLocalized } from "@/lib/i18n";
import { employmentTypeLabel, EMPLOYMENT_TYPES } from "@/lib/jobPostings";
import { updateJobPosting } from "@/lib/actions/admin";
import type { JobPosting } from "@/lib/types";

// Code-split: only director/admin ever open this dialog.
const JobPostingEditDialog = dynamic(
  () => import("@/components/admin/JobPostingEditDialog").then((m) => m.JobPostingEditDialog),
  { ssr: false },
);

const APPLY_EMAIL = "funtikidbooks.studio@gmail.com";

export function JobPostingView({ initialPost, canEdit }: { initialPost: JobPosting; canEdit: boolean }) {
  const { locale, t } = useDict();
  const [post, setPost] = useState(initialPost);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  const title = pickLocalized(locale, post.title, post.title_en);
  const excerpt = pickLocalized(locale, post.excerpt, post.excerpt_en);
  const content = pickLocalized(locale, post.content, post.content_en);
  const dateLocale = locale === "en" ? "en-US" : "vi-VN";
  const emp = EMPLOYMENT_TYPES.find((e) => e.value === post.employment_type);
  const applyHref = `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent(`${t.careers.applySubject} ${title}`)}`;

  return (
    <article className="max-w-[760px] mx-auto px-5 pt-10 pb-20">
      <Link href="/tuyen-dung" className="text-sm font-bold inline-flex items-center gap-1 mb-6" style={{ color: "var(--color-accent-600)" }}>
        {t.careers.backToAll}
      </Link>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="tag tag-accent-2 w-fit">
          {emp?.icon} {employmentTypeLabel(locale, post.employment_type)}
        </span>
        {!post.published && <span className="tag tag-neutral w-fit">{t.careers.unpublished}</span>}
      </div>

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-[28px] lg:text-[34px] leading-[1.2]">{title}</h1>
        {canEdit && (
          <button type="button" className="btn btn-secondary btn-sm flex-none" onClick={() => setEditing(true)}>
            {t.careers.editPost}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm mb-6" style={{ color: "var(--color-neutral-500)" }}>
        {post.location && <span>📍 {post.location}</span>}
        {post.salary_range && <span>💰 {post.salary_range}</span>}
        {post.deadline && (
          <span>
            🗓 {t.careers.deadline}: {new Date(post.deadline).toLocaleDateString(dateLocale)}
          </span>
        )}
      </div>

      <EditableImage
        src={post.cover_image_url}
        alt={title}
        emoji={emp?.icon ?? "💼"}
        canEdit={canEdit}
        onUpload={async (file) => {
          const updated = await updateJobPosting(post.id, { cover: file });
          setPost(updated);
          return updated.cover_image_url ?? "";
        }}
        className="w-full mb-8"
        style={{ height: 300 }}
        resizeWidth={900}
      />

      {excerpt && (
        <p className="text-base font-semibold mb-6" style={{ color: "var(--color-neutral-700)" }}>
          {excerpt}
        </p>
      )}

      {content && <div className="rich-content" dangerouslySetInnerHTML={{ __html: content }} />}

      <div className="mt-10 pt-8 flex flex-col items-start gap-3" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
        <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
          {t.careers.applyHint}
        </p>
        <a href={applyHref} className="btn btn-primary">
          {t.careers.applyNow}
        </a>
      </div>

      {editing && (
        <JobPostingEditDialog
          post={post}
          onClose={() => setEditing(false)}
          onCreated={() => {}}
          onUpdated={(_id, patch) => setPost(patch)}
          onDeleted={() => router.push("/tuyen-dung")}
        />
      )}
    </article>
  );
}
