"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { CoverDropzone } from "@/components/admin/CoverDropzone";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { LangTabs } from "@/components/admin/LangTabs";
import { EMPLOYMENT_TYPES } from "@/lib/jobPostings";
import { createJobPosting, deleteJobPosting, updateJobPosting, uploadJobPostingContentImage } from "@/lib/actions/admin";
import type { EmploymentType, JobPosting } from "@/lib/types";

export function JobPostingEditDialog({
  post,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  post: JobPosting | null;
  onClose: () => void;
  onCreated: (p: JobPosting) => void;
  onUpdated: (id: string, patch: JobPosting) => void;
  onDeleted: (id: string) => void;
}) {
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [title, setTitle] = useState(post?.title ?? "");
  const [titleEn, setTitleEn] = useState(post?.title_en ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType>(post?.employment_type ?? "full_time");
  const [location, setLocation] = useState(post?.location ?? "");
  const [salaryRange, setSalaryRange] = useState(post?.salary_range ?? "");
  const [deadline, setDeadline] = useState(post?.deadline ?? "");
  const [closed, setClosed] = useState(post?.closed ?? false);
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
        const updated = await updateJobPosting(post.id, {
          title,
          titleEn,
          employmentType,
          location,
          salaryRange,
          deadline: deadline || null,
          excerpt,
          excerptEn,
          content,
          contentEn,
          published,
          closed,
          cover: coverFile,
        });
        onUpdated(post.id, updated);
      } else {
        const created = await createJobPosting({
          title,
          titleEn,
          employmentType,
          location,
          salaryRange,
          deadline,
          excerpt,
          excerptEn,
          content,
          contentEn,
          closed,
          cover: coverFile,
        });
        if (published !== created.published) {
          const updated = await updateJobPosting(created.id, { published });
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
    if (!post || !confirm("Xoá tin tuyển dụng này?")) return;
    setSaving("draft");
    try {
      await deleteJobPosting(post.id);
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
            <h2 className="text-xl">{post ? "Sửa tin tuyển dụng" : "Đăng tin tuyển dụng"}</h2>
            <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
              Đăng lên trang Tuyển dụng công khai của Funti Kidbooks Studio
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon flex-none" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 max-h-[70vh] overflow-y-auto">
          <LangTabs lang={lang} onChange={setLang} />

          {/* 01 — Thông tin vị trí */}
          <section className="flex flex-col gap-4">
            <SectionHeading step="01" title="Thông tin vị trí" />

            <div className="field">
              <label htmlFor="j-title">
                Tên vị trí {lang === "vi" && <span style={{ color: "var(--status-red)" }}>*</span>}
              </label>
              <input
                id="j-title"
                className="input"
                value={lang === "vi" ? title : titleEn}
                onChange={(e) => (lang === "vi" ? setTitle(e.target.value.slice(0, 100)) : setTitleEn(e.target.value.slice(0, 100)))}
                placeholder={lang === "vi" ? "VD: Hoạ sĩ minh hoạ sách thiếu nhi" : "e.g. Children's Book Illustrator"}
                required={lang === "vi"}
                maxLength={100}
              />
              <div className="text-right text-[11px] mt-1" style={{ color: "var(--color-neutral-400)" }}>
                {(lang === "vi" ? title : titleEn).length}/100
              </div>
            </div>

            <div className="field">
              <label>
                Hình thức làm việc <span style={{ color: "var(--status-red)" }}>*</span>
              </label>
              <div className="flex flex-wrap gap-2 mt-1">
                {EMPLOYMENT_TYPES.map((et) => (
                  <button
                    key={et.value}
                    type="button"
                    onClick={() => setEmploymentType(et.value)}
                    className="category-chip flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold"
                    style={{
                      background: employmentType === et.value ? "var(--color-accent-500)" : "var(--color-surface)",
                      color: employmentType === et.value ? "#fff" : "var(--color-text)",
                      border: `1.5px solid ${employmentType === et.value ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                    }}
                  >
                    <span aria-hidden>{et.icon}</span>
                    {et.vi}
                  </button>
                ))}
              </div>
            </div>

            {lang === "vi" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="field">
                  <label htmlFor="j-location">Địa điểm làm việc</label>
                  <input
                    id="j-location"
                    className="input"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="VD: TP.HCM (làm tại văn phòng)"
                  />
                </div>
                <div className="field">
                  <label htmlFor="j-salary">Mức lương</label>
                  <input
                    id="j-salary"
                    className="input"
                    value={salaryRange}
                    onChange={(e) => setSalaryRange(e.target.value)}
                    placeholder="VD: Thoả thuận, hoặc 8-12 triệu"
                  />
                </div>
                <div className="field">
                  <label htmlFor="j-deadline">Hạn nộp hồ sơ</label>
                  <input id="j-deadline" type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </div>
              </div>
            )}

            {lang === "vi" && (
              <label className="flex items-center gap-2 text-sm font-semibold w-fit cursor-pointer">
                <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
                Đã đóng tuyển (vẫn hiển thị công khai, gắn nhãn &quot;Đã đóng&quot;, ngừng nhận ứng tuyển)
              </label>
            )}

            <div className="field">
              <label htmlFor="j-excerpt">Mô tả ngắn (hiển thị khi chia sẻ &amp; tìm kiếm)</label>
              <textarea
                id="j-excerpt"
                className="input"
                rows={2}
                value={lang === "vi" ? excerpt : excerptEn}
                onChange={(e) => (lang === "vi" ? setExcerpt(e.target.value) : setExcerptEn(e.target.value))}
                placeholder="Một câu tóm tắt ngắn gọn về vị trí này…"
              />
            </div>
          </section>

          {/* 02 — Mô tả công việc */}
          <section className="flex flex-col gap-2">
            <SectionHeading step="02" title="Mô tả công việc" />
            <p className="text-xs -mt-2" style={{ color: "var(--color-neutral-500)" }}>
              Viết mô tả công việc, yêu cầu, quyền lợi... và chèn hình ảnh trực tiếp vào giữa nội dung.
            </p>
            {lang === "vi" ? (
              <RichTextEditor key="vi" content={content} onChange={setContent} onUploadImage={uploadJobPostingContentImage} />
            ) : (
              <RichTextEditor key="en" content={contentEn} onChange={setContentEn} onUploadImage={uploadJobPostingContentImage} />
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
              🗑 Xoá tin
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
              {saving === "publish" ? "Đang đăng…" : "🚀 Đăng tin"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
