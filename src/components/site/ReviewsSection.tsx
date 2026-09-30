"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { Review } from "@/lib/types";
import { useDict } from "@/components/site/LocaleProvider";
import { isSupabaseStorageUrl, resizedUrl } from "@/lib/imageTransform";

// Code-split: only director/admin ever open this dialog — regular visitors
// shouldn't pay for it in their initial page load.
const ReviewEditDialog = dynamic(() => import("@/components/admin/ReviewEditDialog").then((m) => m.ReviewEditDialog), {
  ssr: false,
});

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-hidden style={{ color: "var(--status-yellow)", letterSpacing: 2 }}>
      {"★".repeat(rating)}
      <span style={{ color: "var(--color-neutral-300)" }}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function ReviewsSection({ reviews, canEdit = false }: { reviews: Review[]; canEdit?: boolean }) {
  const [items, setItems] = useState(reviews);
  const [editing, setEditing] = useState<Review | "new" | null>(null);
  const { t } = useDict();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(reviews);
  }, [reviews]);

  if (items.length === 0 && !canEdit) return null;

  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
        {t.reviews.kicker}
      </div>
      <h2 className="text-3xl">{t.reviews.title}</h2>
      <p className="max-w-[520px] mb-8" style={{ color: "var(--color-neutral-700)" }}>
        {t.reviews.subtitle}
      </p>

      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="w-full max-w-[420px] flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] py-10"
          style={{ border: "2px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)" }}
        >
          <span className="text-2xl leading-none" aria-hidden>
            +
          </span>
          <span className="text-xs font-bold">{t.reviews.addFirst}</span>
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 w-full text-left">
          {items.map((r) => (
            // The words first; under them, what the review is about. Most
            // reviews come from marketplace jobs, whose "name" is the job's
            // title — shown as the project, not as a person.
            <figure key={r.id} className="relative card elev-sm p-6 flex flex-col gap-3" style={{ opacity: r.published ? 1 : 0.55 }}>
              <div className="flex items-center justify-between gap-3">
                <Stars rating={r.rating} />
                <span className="font-heading text-[40px] leading-[0.6] h-[18px]" style={{ color: "var(--color-accent-300)" }} aria-hidden>
                  “
                </span>
              </div>
              <blockquote className="text-[14.5px] leading-relaxed" style={{ color: "var(--color-text)" }}>
                {r.content.replace(/^["“]|["”]$/g, "")}
              </blockquote>
              <figcaption className="mt-auto pt-3 flex items-center gap-2.5 min-w-0" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
                {r.avatar_url && (
                  <Image
                    src={isSupabaseStorageUrl(r.avatar_url) ? (resizedUrl(r.avatar_url, 120) ?? r.avatar_url) : r.avatar_url}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized={isSupabaseStorageUrl(r.avatar_url)}
                    className="rounded-full object-cover flex-none"
                  />
                )}
                <span className="text-[12.5px] leading-snug line-clamp-2 min-w-0" style={{ color: "var(--color-neutral-600)" }}>
                  <b style={{ color: "var(--color-neutral-700)" }}>{t.reviews.projectLabel}:</b> {r.customer_name}
                </span>
              </figcaption>
              {!r.published && <span className="text-[11px] font-semibold w-fit tag tag-neutral">{t.reviews.unpublished}</span>}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="editable-image-btn absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
                >
                  {t.reviews.edit}
                </button>
              )}
            </figure>
          ))}

          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)]"
              style={{ border: "2px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)", minHeight: 160 }}
            >
              <span className="text-2xl leading-none" aria-hidden>
                +
              </span>
              <span className="text-xs font-bold">{t.reviews.add}</span>
            </button>
          )}
        </div>
      )}

      {editing && (
        <ReviewEditDialog
          review={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(r) => setItems((prev) => [...prev, r])}
          onUpdated={(id, patch) => setItems((prev) => prev.map((r) => (r.id === id ? patch : r)))}
          onDeleted={(id) => setItems((prev) => prev.filter((r) => r.id !== id))}
        />
      )}
    </div>
  );
}
