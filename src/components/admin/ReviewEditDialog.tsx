"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CoverDropzone } from "@/components/admin/CoverDropzone";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { createReview, deleteReview, updateReview } from "@/lib/actions/admin";
import type { Review } from "@/lib/types";

function StarPicker({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} sao`}
          className="text-2xl leading-none"
          style={{ color: n <= rating ? "var(--status-yellow)" : "var(--color-neutral-300)" }}
        >
          ★
        </button>
      ))}
      <span className="text-sm font-semibold ml-1" style={{ color: "var(--color-neutral-600)" }}>
        {rating}/5
      </span>
    </div>
  );
}

export function ReviewEditDialog({
  review,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  review: Review | null;
  onClose: () => void;
  onCreated: (r: Review) => void;
  onUpdated: (id: string, patch: Review) => void;
  onDeleted: (id: string) => void;
}) {
  const [customerName, setCustomerName] = useState(review?.customer_name ?? "");
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [content, setContent] = useState(review?.content ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(review?.avatar_url ?? null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickAvatar(file: File) {
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarRemoved(false);
  }

  function removeAvatar() {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarRemoved(true);
  }

  async function save(published: boolean) {
    if (!customerName.trim() || !content.trim()) return;
    setSaving(published ? "publish" : "draft");
    setError(null);
    const avatar: File | null | undefined = avatarFile ?? (avatarRemoved ? null : undefined);
    try {
      if (review) {
        const updated = await updateReview(review.id, { customerName, rating, content, published, avatar });
        onUpdated(review.id, updated);
      } else {
        const created = await createReview({ customerName, rating, content, avatar });
        if (published !== created.published) {
          const updated = await updateReview(created.id, { published });
          onCreated(updated);
        } else {
          onCreated(created);
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete() {
    if (!review || !confirm("Xoá đánh giá này?")) return;
    setSaving("draft");
    try {
      await deleteReview(review.id);
      onDeleted(review.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setSaving(null);
    }
  }

  const busy = saving !== null;

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <div>
            <h2 className="text-xl">{review ? "Sửa đánh giá" : "Thêm đánh giá mới"}</h2>
            <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
              Hiển thị trên trang Dịch vụ công khai
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon flex-none" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 max-h-[70vh] overflow-y-auto">
          <section className="flex flex-col gap-4">
            <SectionHeading step="01" title="Thông tin khách hàng" />

            <div className="field">
              <label htmlFor="r-name">
                Tên khách hàng <span style={{ color: "var(--status-red)" }}>*</span>
              </label>
              <input
                id="r-name"
                className="input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value.slice(0, 80))}
                placeholder="VD: Nguyễn Thị A."
                maxLength={80}
              />
            </div>

            <div className="field">
              <label>Ảnh đại diện (không bắt buộc)</label>
              <CoverDropzone
                preview={avatarPreview}
                onPick={pickAvatar}
                onRemove={avatarPreview ? removeAvatar : undefined}
                label="Click hoặc kéo-thả ảnh đại diện"
                aspect={1}
              />
            </div>

            <div className="field">
              <label>
                Số sao <span style={{ color: "var(--status-red)" }}>*</span>
              </label>
              <StarPicker rating={rating} onChange={setRating} />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeading step="02" title="Nội dung đánh giá" />
            <textarea
              className="input"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 600))}
              placeholder="Nội dung khách hàng đã chia sẻ…"
              maxLength={600}
            />
            <div className="text-right text-[11px]" style={{ color: "var(--color-neutral-400)" }}>
              {content.length}/600
            </div>
          </section>

          {error && (
            <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {review ? (
            <button type="button" onClick={handleDelete} className="btn btn-danger btn-sm" disabled={busy}>
              🗑 Xoá đánh giá
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="btn btn-ghost" disabled={busy}>
              Huỷ
            </button>
            <button type="button" onClick={() => save(false)} className="btn btn-secondary" disabled={busy || !customerName.trim() || !content.trim()}>
              {saving === "draft" ? "Đang lưu…" : "💾 Lưu nháp"}
            </button>
            <button type="button" onClick={() => save(true)} className="btn btn-primary" disabled={busy || !customerName.trim() || !content.trim()}>
              {saving === "publish" ? "Đang đăng…" : "🚀 Đăng đánh giá"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
