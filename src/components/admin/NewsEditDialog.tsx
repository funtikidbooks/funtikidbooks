"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { CoverDropzone } from "@/components/admin/CoverDropzone";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { LangTabs } from "@/components/admin/LangTabs";
import { createNewsPost, deleteNewsPost, updateNewsPost, uploadContentImage } from "@/lib/actions/admin";
import type { NewsPost } from "@/lib/types";

export const NEWS_CATEGORIES = [
  { value: "Studio", icon: "🏢" },
  { value: "Dự án", icon: "📁" },
  { value: "Chia sẻ", icon: "💡" },
  { value: "Đối tác", icon: "🤝" },
  { value: "Sự kiện", icon: "🎉" },
];

export function NewsEditDialog({
  post,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  post: NewsPost | null;
  onClose: () => void;
  onCreated: (p: NewsPost) => void;
  onUpdated: (id: string, patch: NewsPost) => void;
  onDeleted: (id: string) => void;
}) {
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [title, setTitle] = useState(post?.title ?? "");
  const [titleEn, setTitleEn] = useState(post?.title_en ?? "");
  const [category, setCategory] = useState(post?.category ?? NEWS_CATEGORIES[0].value);
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [excerptEn, setExcerptEn] = useState(post?.excerpt_en ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [contentEn, setContentEn] = useState(post?.content_en ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(post?.cover_image_url ?? null);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickCover(file: File) {
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function save(published: boolean) {
    if (!title.trim()) return;
    setSaving(published ? "publish" : "draft");
    setError(null);
    try {
      if (post) {
        const updated = await updateNewsPost(post.id, {
          title,
          titleEn,
          category,
          excerpt,
          excerptEn,
          content,
          contentEn,
          published,
          cover: coverFile,
        });
        onUpdated(post.id, updated);
      } else {
        const created = await createNewsPost({ title, titleEn, category, excerpt, excerptEn, content, contentEn, cover: coverFile });
        if (published !== created.published) {
          const updated = await updateNewsPost(created.id, { published });
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
    if (!post || !confirm("Xoá bài viết này?")) return;
    setSaving("draft");
    try {
      await deleteNewsPost(post.id);
      onDeleted(post.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setSaving(null);
    }
  }

  const busy = saving !== null;

  return (
    <Modal onClose={onClose} maxWidth={720}>
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <div>
            <h2 className="text-xl">{post ? "Sửa bài viết" : "Viết bài mới"}</h2>
            <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
              Đăng lên trang Tin tức công khai của Funti Kidbooks Studio
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon flex-none" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 max-h-[70vh] overflow-y-auto">
          <LangTabs lang={lang} onChange={setLang} />

          {/* 01 — Thông tin bài viết */}
          <section className="flex flex-col gap-4">
            <SectionHeading step="01" title="Thông tin bài viết" />

            <div className="field">
              <label htmlFor="n-title">
                Tiêu đề {lang === "vi" && <span style={{ color: "var(--status-red)" }}>*</span>}
              </label>
              <input
                id="n-title"
                className="input"
                value={lang === "vi" ? title : titleEn}
                onChange={(e) => (lang === "vi" ? setTitle(e.target.value.slice(0, 100)) : setTitleEn(e.target.value.slice(0, 100)))}
                placeholder={lang === "vi" ? "VD: Funti Kidbooks Studio ra mắt bộ sách tranh mới" : "e.g. Funti Kidbooks Studio launches a new picture book"}
                required={lang === "vi"}
                maxLength={100}
              />
              <div className="text-right text-[11px] mt-1" style={{ color: "var(--color-neutral-400)" }}>
                {(lang === "vi" ? title : titleEn).length}/100
              </div>
            </div>

            <div className="field">
              <label htmlFor="n-excerpt">Mô tả ngắn (hiển thị khi chia sẻ &amp; tìm kiếm)</label>
              <textarea
                id="n-excerpt"
                className="input"
                rows={2}
                value={lang === "vi" ? excerpt : excerptEn}
                onChange={(e) => (lang === "vi" ? setExcerpt(e.target.value) : setExcerptEn(e.target.value))}
                placeholder="Một câu tóm tắt ngắn gọn về bài viết…"
              />
            </div>

            <div className="field">
              <label>
                Chuyên mục <span style={{ color: "var(--status-red)" }}>*</span>
              </label>
              <div className="flex flex-wrap gap-2 mt-1">
                {NEWS_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className="category-chip flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold"
                    style={{
                      background: category === c.value ? "var(--color-accent-500)" : "var(--color-surface)",
                      color: category === c.value ? "#fff" : "var(--color-text)",
                      border: `1.5px solid ${category === c.value ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                    }}
                  >
                    <span aria-hidden>{c.icon}</span>
                    {c.value}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 02 — Nội dung bài viết */}
          <section className="flex flex-col gap-2">
            <SectionHeading step="02" title="Nội dung bài viết" />
            <p className="text-xs -mt-2" style={{ color: "var(--color-neutral-500)" }}>
              Viết bài và chèn hình ảnh, video YouTube trực tiếp vào giữa nội dung. Dùng nút 🖼 để chèn ảnh, 🎬 để chèn video.
            </p>
            {lang === "vi" ? (
              <RichTextEditor key="vi" content={content} onChange={setContent} onUploadImage={uploadContentImage} />
            ) : (
              <RichTextEditor key="en" content={contentEn} onChange={setContentEn} onUploadImage={uploadContentImage} />
            )}
          </section>

          {/* 03 — Ảnh bìa */}
          <section className="flex flex-col gap-3">
            <SectionHeading step="03" title="Ảnh bìa (tuỳ chọn)" />
            <CoverDropzone preview={coverPreview} onPick={pickCover} />
          </section>

          {error && (
            <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {post ? (
            <button type="button" onClick={handleDelete} className="btn btn-danger btn-sm" disabled={busy}>
              🗑 Xoá bài viết
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="btn btn-ghost" disabled={busy}>
              Huỷ
            </button>
            <button type="button" onClick={() => save(false)} className="btn btn-secondary" disabled={busy || !title.trim()}>
              {saving === "draft" ? "Đang lưu…" : "💾 Lưu nháp"}
            </button>
            <button type="button" onClick={() => save(true)} className="btn btn-primary" disabled={busy || !title.trim()}>
              {saving === "publish" ? "Đang đăng…" : "🚀 Đăng bài"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
