"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { Review } from "@/lib/types";

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

  if (items.length === 0 && !canEdit) return null;

  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
        KHÁCH HÀNG NÓI GÌ
      </div>
      <h2 className="text-3xl">Phụ huynh & đối tác đánh giá Funti Kidbooks</h2>
      <p className="max-w-[520px] mb-8" style={{ color: "var(--color-neutral-700)" }}>
        Những chia sẻ thật từ khách hàng đã đồng hành cùng chúng tôi.
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
          <span className="text-xs font-bold">Thêm đánh giá đầu tiên</span>
        </button>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 w-full text-left">
          {items.map((r) => (
            <div key={r.id} className="relative card elev-sm p-6 flex flex-col gap-3" style={{ opacity: r.published ? 1 : 0.55 }}>
              <div className="flex items-center gap-3">
                {r.avatar_url ? (
                  <Image src={r.avatar_url} alt={r.customer_name} width={44} height={44} className="rounded-full object-cover flex-none" />
                ) : (
                  <div
                    className="flex items-center justify-center rounded-full text-sm font-bold flex-none"
                    style={{ width: 44, height: 44, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                  >
                    {r.customer_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{r.customer_name}</div>
                  <Stars rating={r.rating} />
                </div>
              </div>
              <p className="text-sm" style={{ color: "var(--color-neutral-700)" }}>
                {r.content}
              </p>
              {!r.published && <span className="text-[11px] font-semibold w-fit tag tag-neutral">Chưa xuất bản</span>}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="editable-image-btn absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: "rgba(20,18,17,.75)", color: "#fff" }}
                >
                  Sửa
                </button>
              )}
            </div>
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
              <span className="text-xs font-bold">Thêm đánh giá</span>
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
