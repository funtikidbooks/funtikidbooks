"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { createEditorProject, deleteEditorProject } from "@/lib/actions/editor";
import { isSupabaseStorageUrl } from "@/lib/imageTransform";
import type { EditorProject } from "@/lib/types";

type ProjectSummary = Pick<EditorProject, "id" | "name" | "background_url" | "background_width" | "background_height" | "updated_at">;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function NewProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (p: EditorProject) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    setFile(f);
    setName((prev) => prev || f.name.replace(/\.[^.]+$/, ""));
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new window.Image();
    img.onload = () => setDims({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
  }

  async function submit() {
    if (!file || !dims) return;
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("width", String(dims.width));
      formData.append("height", String(dims.height));
      const created = await createEditorProject(formData);
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={480}>
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <div>
            <h2 className="text-xl">Bản chỉnh sửa mới</h2>
            <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
              Tải file khách hàng lên để chèn chữ/ảnh góp ý lên trên
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon flex-none" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6">
          <div
            onClick={() => inputRef.current?.click()}
            className="relative flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] cursor-pointer overflow-hidden"
            style={{ minHeight: 180, border: "2px dashed var(--color-neutral-300)", background: "var(--color-surface)" }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="max-h-[240px] object-contain" />
            ) : (
              <>
                <span className="text-2xl" aria-hidden>
                  🖼️
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--color-neutral-600)" }}>
                  Click để chọn file khách hàng
                </span>
                <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  JPG/PNG/WEBP · tối đa 20MB
                </span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="proj-name">Tên bản chỉnh sửa</label>
            <input
              id="proj-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 100))}
              placeholder="VD: Bìa Momo & Dodo - góp ý vòng 1"
            />
          </div>

          {error && (
            <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>
            Huỷ
          </button>
          <button type="button" onClick={submit} className="btn btn-primary" disabled={saving || !file}>
            {saving ? "Đang tạo…" : "Tạo & mở biên tập"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function EditorProjectList({ initialProjects }: { initialProjects: ProjectSummary[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [showNew, setShowNew] = useState(false);
  const router = useRouter();

  async function handleDelete(id: string) {
    if (!confirm("Xoá bản chỉnh sửa này?")) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    try {
      await deleteEditorProject(id);
    } catch {
      router.refresh();
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <div>
          <h1 className="text-xl">Biên tập</h1>
          <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
            Chèn chữ, ảnh lên file khách hàng gửi để góp ý/chỉnh sửa trực tiếp
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          + Bản chỉnh sửa mới
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {projects.length === 0 ? (
          <p style={{ color: "var(--color-neutral-500)" }}>Chưa có bản chỉnh sửa nào. Bấm &quot;+ Bản chỉnh sửa mới&quot; để bắt đầu.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <div key={p.id} className="relative card elev-sm overflow-hidden flex flex-col" style={{ height: 220 }}>
                <button
                  type="button"
                  onClick={() => router.push(`/workspace/bien-tap/${p.id}`)}
                  className="flex-1 relative"
                  style={{ background: "var(--color-surface)" }}
                >
                  {p.background_url && (
                    <Image
                      src={p.background_url}
                      alt={p.name}
                      fill
                      unoptimized={isSupabaseStorageUrl(p.background_url)}
                      className="object-contain"
                      sizes="360px"
                    />
                  )}
                </button>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate" title={p.name}>
                      {p.name}
                    </h3>
                    <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                      Sửa lúc {formatDate(p.updated_at)}
                    </span>
                  </div>
                  <button type="button" onClick={() => handleDelete(p.id)} className="btn-icon flex-none" aria-label="Xoá" title="Xoá">
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewProjectDialog
          onClose={() => setShowNew(false)}
          onCreated={(p) => {
            setShowNew(false);
            router.push(`/workspace/bien-tap/${p.id}`);
          }}
        />
      )}
    </div>
  );
}
