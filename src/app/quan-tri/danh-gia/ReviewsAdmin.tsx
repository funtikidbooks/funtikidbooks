"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { Review } from "@/lib/types";

const ReviewEditDialog = dynamic(() => import("@/components/admin/ReviewEditDialog").then((m) => m.ReviewEditDialog), {
  ssr: false,
});

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-hidden style={{ color: "var(--status-yellow)" }}>
      {"★".repeat(rating)}
      <span style={{ color: "var(--color-neutral-300)" }}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function ReviewsAdmin({ initialReviews }: { initialReviews: Review[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [editing, setEditing] = useState<Review | "new" | null>(null);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <div>
          <h1 className="text-xl">Quản trị Đánh giá khách hàng</h1>
          <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
            Hiển thị trên trang Dịch vụ công khai
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
          + Thêm đánh giá
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {reviews.length === 0 ? (
          <p style={{ color: "var(--color-neutral-500)" }}>Chưa có đánh giá nào. Bấm &quot;+ Thêm đánh giá&quot; để tạo mới.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {reviews.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setEditing(r)}
                className="text-left card elev-sm p-4 flex flex-col gap-2"
                style={{ opacity: r.published ? 1 : 0.5 }}
              >
                <div className="flex items-center gap-3">
                  {r.avatar_url ? (
                    <Image src={r.avatar_url} alt={r.customer_name} width={40} height={40} className="rounded-full object-cover flex-none" />
                  ) : (
                    <div
                      className="flex items-center justify-center rounded-full text-sm font-bold flex-none"
                      style={{ width: 40, height: 40, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                    >
                      {r.customer_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{r.customer_name}</div>
                    <Stars rating={r.rating} />
                  </div>
                </div>
                <p className="text-sm line-clamp-3" style={{ color: "var(--color-neutral-600)" }}>
                  {r.content}
                </p>
                {!r.published && <span className="text-[11px] font-semibold w-fit tag tag-neutral">Chưa xuất bản</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ReviewEditDialog
          review={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(r) => setReviews((prev) => [...prev, r])}
          onUpdated={(id, patch) => setReviews((prev) => prev.map((r) => (r.id === id ? patch : r)))}
          onDeleted={(id) => setReviews((prev) => prev.filter((r) => r.id !== id))}
        />
      )}
    </div>
  );
}
