"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { createMindmapProject, deleteMindmapProject } from "@/lib/actions/mindmap";
import type { MindmapProject } from "@/lib/types";

const COLORS = ["#FF7A3D", "#4FB3D9", "#3F9E52", "#9146A8", "#D6A400", "#78776F"];

export function MindmapProjectsList({ initialProjects }: { initialProjects: (MindmapProject & { nodeCount: number })[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MindmapProject | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createMindmapProject(title, color);
      setProjects((prev) => [{ ...created, nodeCount: 1 }, ...prev]);
      setShowCreate(false);
      setTitle("");
      setColor(COLORS[0]);
      router.push(`/workspace/du-an/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo dự án");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    await deleteMindmapProject(id).catch(() => {});
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex items-center justify-between gap-4 px-6 py-4 flex-none"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <div>
          <h1 className="text-xl">Dự án</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
            Sơ đồ nhánh cho từng dự án — kéo thả để sắp xếp, gắn bài viết nháp để duyệt trước khi đăng.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm flex-none" onClick={() => setShowCreate(true)}>
          + Dự án mới
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {projects.length === 0 ? (
          <div className="card elev-sm p-8 text-center" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có dự án nào — bấm &quot;+ Dự án mới&quot; để bắt đầu vẽ nhánh đầu tiên.
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {projects.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/workspace/du-an/${p.id}`)}
                onKeyDown={(e) => e.key === "Enter" && router.push(`/workspace/du-an/${p.id}`)}
                className="card elev-sm p-4 flex flex-col gap-3 text-left cursor-pointer"
                style={{ borderTop: `3px solid ${p.color}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-sm leading-snug">{p.title}</span>
                  <button
                    type="button"
                    className="btn-icon flex-none"
                    style={{ width: 26, height: 26, padding: 0, color: "var(--color-neutral-400)" }}
                    title="Xoá dự án"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(p);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  {p.nodeCount} nhánh
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="p-5 flex flex-col gap-4">
            <span className="font-bold text-base">Dự án mới</span>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">Tên dự án</span>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Nội dung SEO chờ duyệt"
                autoFocus
                maxLength={100}
              />
            </label>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold">Màu</span>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="rounded-full flex-none"
                    style={{
                      width: 26,
                      height: 26,
                      background: c,
                      border: color === c ? "2px solid var(--color-text)" : "2px solid transparent",
                      outline: color === c ? "2px solid " + c : undefined,
                      outlineOffset: 1,
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            {error && (
              <p className="text-sm" style={{ color: "var(--status-red)" }}>
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>
                Huỷ
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !title.trim()}>
                {saving ? "Đang tạo…" : "Tạo dự án"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} maxWidth={380}>
          <div className="p-5 flex flex-col gap-4">
            <span className="font-bold text-base">Xoá dự án &quot;{confirmDelete.title}&quot;?</span>
            <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
              Toàn bộ nhánh bên trong sẽ bị xoá theo. Không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>
                Huỷ
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete}>
                Xoá
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
