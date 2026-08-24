"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { CoverDropzone } from "@/components/admin/CoverDropzone";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { LangTabs } from "@/components/admin/LangTabs";
import { createProject, deleteProject, updateProject, uploadContentImage } from "@/lib/actions/admin";
import type { Project } from "@/lib/types";

export const PROJECT_TAGS = [
  { value: "Sách tranh", icon: "📖" },
  { value: "Sách truyện", icon: "📚" },
  { value: "Sách giáo dục", icon: "🎓" },
  { value: "Character Design", icon: "🧸" },
  { value: "Product & Merch", icon: "🎁" },
  { value: "Sự kiện & Lễ", icon: "🎉" },
];

export function ProjectEditDialog({
  project,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  project: Project | null;
  onClose: () => void;
  onCreated: (p: Project) => void;
  onUpdated: (id: string, patch: Project) => void;
  onDeleted: (id: string) => void;
}) {
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [title, setTitle] = useState(project?.title ?? "");
  const [titleEn, setTitleEn] = useState(project?.title_en ?? "");
  const [tag, setTag] = useState(project?.tag ?? PROJECT_TAGS[0].value);
  const [description, setDescription] = useState(project?.description ?? "");
  const [descriptionEn, setDescriptionEn] = useState(project?.description_en ?? "");
  const [content, setContent] = useState(project?.content ?? "");
  const [contentEn, setContentEn] = useState(project?.content_en ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(project?.cover_image_url ?? null);
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
      if (project) {
        const updated = await updateProject(project.id, {
          title,
          titleEn,
          tag,
          description,
          descriptionEn,
          content,
          contentEn,
          published,
          cover: coverFile,
        });
        onUpdated(project.id, updated);
      } else {
        const created = await createProject({ title, titleEn, tag, description, descriptionEn, content, contentEn, cover: coverFile });
        if (published !== created.published) {
          const updated = await updateProject(created.id, { published });
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
    if (!project || !confirm("Xoá dự án này?")) return;
    setSaving("draft");
    try {
      await deleteProject(project.id);
      onDeleted(project.id);
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
            <h2 className="text-xl">{project ? "Sửa dự án" : "Thêm dự án mới"}</h2>
            <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
              Đăng lên trang Dự án công khai của Funti Kidbooks Studio
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon flex-none" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 max-h-[70vh] overflow-y-auto">
          <LangTabs lang={lang} onChange={setLang} />

          {/* 01 — Thông tin dự án */}
          <section className="flex flex-col gap-4">
            <SectionHeading step="01" title="Thông tin dự án" />

            <div className="field">
              <label htmlFor="p-title">
                Tên dự án {lang === "vi" && <span style={{ color: "var(--status-red)" }}>*</span>}
              </label>
              <input
                id="p-title"
                className="input"
                value={lang === "vi" ? title : titleEn}
                onChange={(e) => (lang === "vi" ? setTitle(e.target.value.slice(0, 100)) : setTitleEn(e.target.value.slice(0, 100)))}
                placeholder={lang === "vi" ? "VD: Miền Dâu Dại – Chuyện phiêu lưu" : "e.g. Wandering Berry Land"}
                required={lang === "vi"}
                maxLength={100}
              />
              <div className="text-right text-[11px] mt-1" style={{ color: "var(--color-neutral-400)" }}>
                {(lang === "vi" ? title : titleEn).length}/100
              </div>
            </div>

            <div className="field">
              <label htmlFor="p-desc">Mô tả ngắn (hiển thị dưới tên dự án)</label>
              <textarea
                id="p-desc"
                className="input"
                rows={2}
                value={lang === "vi" ? description : descriptionEn}
                onChange={(e) => (lang === "vi" ? setDescription(e.target.value) : setDescriptionEn(e.target.value))}
                placeholder="Một câu tóm tắt ngắn gọn về dự án…"
              />
            </div>

            <div className="field">
              <label>
                Thể loại <span style={{ color: "var(--status-red)" }}>*</span>
              </label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PROJECT_TAGS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTag(t.value)}
                    className="category-chip flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold"
                    style={{
                      background: tag === t.value ? "var(--color-accent-500)" : "var(--color-surface)",
                      color: tag === t.value ? "#fff" : "var(--color-text)",
                      border: `1.5px solid ${tag === t.value ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                    }}
                  >
                    <span aria-hidden>{t.icon}</span>
                    {t.value}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 02 — Nội dung dự án */}
          <section className="flex flex-col gap-2">
            <SectionHeading step="02" title="Nội dung dự án" />
            <p className="text-xs -mt-2" style={{ color: "var(--color-neutral-500)" }}>
              Kể câu chuyện của dự án — chèn ảnh minh hoạ xen kẽ chữ, giống cách trình bày trên Behance. Dùng nút 🖼 để chèn ảnh, 🎬 để chèn video.
            </p>
            {lang === "vi" ? (
              <RichTextEditor key="vi" content={content} onChange={setContent} onUploadImage={uploadContentImage} />
            ) : (
              <RichTextEditor key="en" content={contentEn} onChange={setContentEn} onUploadImage={uploadContentImage} />
            )}
          </section>

          {/* 03 — Ảnh bìa */}
          <section className="flex flex-col gap-3">
            <SectionHeading step="03" title="Ảnh bìa (hiển thị trên lưới Dự án)" />
            <CoverDropzone preview={coverPreview} onPick={pickCover} />
          </section>

          {error && (
            <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {project ? (
            <button type="button" onClick={handleDelete} className="btn btn-danger btn-sm" disabled={busy}>
              🗑 Xoá dự án
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
              {saving === "publish" ? "Đang đăng…" : "🚀 Đăng dự án"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
