"use client";

import { useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  deleteDocumentLibraryItem,
  getDocumentLibraryFileUrl,
  updateDocumentLibraryItem,
  uploadDocumentLibraryItem,
} from "@/lib/actions/documentsLibrary";
import type { DocumentLibraryItem } from "@/lib/types";

const UNSORTED = "__unsorted__";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
}

function iconFor(mime: string | null) {
  if (!mime) return "📄";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📕";
  if (mime.includes("word")) return "📘";
  if (mime.includes("sheet") || mime.includes("excel")) return "📗";
  return "📄";
}

// Upload/edit share this form shape — the same fields either become a new
// row (upload) or patch an existing one (edit), so one modal component
// covers both instead of two near-identical dialogs.
function DocumentFormModal({
  folders,
  defaultFolder,
  editing,
  onClose,
  onSaved,
}: {
  folders: string[];
  defaultFolder: string;
  editing: DocumentLibraryItem | null;
  onClose: () => void;
  onSaved: (item: DocumentLibraryItem) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [folder, setFolder] = useState(editing?.folder ?? (defaultFolder === UNSORTED ? "" : defaultFolder));
  const [note, setNote] = useState(editing?.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const updated = await updateDocumentLibraryItem(editing.id, { title, folder, note });
        onSaved(updated);
      } else {
        if (!file) {
          setError("Vui lòng chọn tệp cần tải lên.");
          setSaving(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", file);
        const created = await uploadDocumentLibraryItem({ title: title || file.name, folder, note }, formData);
        onSaved(created);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <h2 className="text-xl">{editing ? "Sửa tài liệu" : "Tải tài liệu lên"}</h2>
          <button type="button" onClick={onClose} className="btn-icon flex-none" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6">
          {!editing && (
            <div className="field">
              <label htmlFor="doc-file">Tệp</label>
              <input
                ref={fileInputRef}
                id="doc-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                className="input"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                }}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="doc-title">Tên tài liệu</label>
            <input
              id="doc-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 150))}
              placeholder="VD: Quy trình duyệt bìa sách"
            />
          </div>
          <div className="field">
            <label htmlFor="doc-folder">Thư mục</label>
            <input
              id="doc-folder"
              className="input"
              list="doc-folder-options"
              value={folder}
              onChange={(e) => setFolder(e.target.value.slice(0, 60))}
              placeholder="VD: SOP, Thuế, Bảo hiểm, Bảng lương…"
            />
            <datalist id="doc-folder-options">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="doc-note">Ghi chú (không bắt buộc)</label>
            <textarea
              id="doc-note"
              className="input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
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
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : editing ? "Lưu" : "Tải lên"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DocumentsLibraryPanel({ initialItems }: { initialItems: DocumentLibraryItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DocumentLibraryItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.folder) set.add(it.folder);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visibleItems = useMemo(() => {
    if (activeFolder === "all") return items;
    if (activeFolder === UNSORTED) return items.filter((it) => !it.folder);
    return items.filter((it) => it.folder === activeFolder);
  }, [items, activeFolder]);

  function upsertItem(item: DocumentLibraryItem) {
    setItems((prev) => {
      const exists = prev.some((it) => it.id === item.id);
      return exists ? prev.map((it) => (it.id === item.id ? item : it)) : [item, ...prev];
    });
  }

  async function handleDownload(item: DocumentLibraryItem) {
    setDownloadingId(item.id);
    setError(null);
    try {
      const url = await getDocumentLibraryFileUrl(item.file_path, item.file_name);
      if (!url) throw new Error("Không thể tạo liên kết tải về");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải tài liệu");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(item: DocumentLibraryItem) {
    if (!confirm(`Xoá tài liệu "${item.title}"?`)) return;
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    try {
      await deleteDocumentLibraryItem(item.id, item.file_path);
    } catch {
      setError("Không thể xoá tài liệu. Vui lòng thử lại.");
      setItems((prev) => [item, ...prev]);
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-[220px] flex-none flex flex-col gap-1 p-4 overflow-y-auto" style={{ borderRight: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-lg mb-2">Tài liệu</h1>
        <button
          type="button"
          onClick={() => setActiveFolder("all")}
          className="flex items-center justify-between px-2.5 py-2 rounded-[8px] text-[13px] font-semibold text-left"
          style={{ background: activeFolder === "all" ? "var(--color-accent-100)" : "transparent", color: activeFolder === "all" ? "var(--color-accent-700)" : "var(--color-text)" }}
        >
          <span>📂 Tất cả</span>
          <span className="tag tag-neutral">{items.length}</span>
        </button>
        {folders.map((f) => {
          const count = items.filter((it) => it.folder === f).length;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setActiveFolder(f)}
              className="flex items-center justify-between px-2.5 py-2 rounded-[8px] text-[13px] font-semibold text-left truncate"
              style={{ background: activeFolder === f ? "var(--color-accent-100)" : "transparent", color: activeFolder === f ? "var(--color-accent-700)" : "var(--color-text)" }}
            >
              <span className="truncate" title={f}>📁 {f}</span>
              <span className="tag tag-neutral flex-none">{count}</span>
            </button>
          );
        })}
        {items.some((it) => !it.folder) && (
          <button
            type="button"
            onClick={() => setActiveFolder(UNSORTED)}
            className="flex items-center justify-between px-2.5 py-2 rounded-[8px] text-[13px] font-semibold text-left"
            style={{ background: activeFolder === UNSORTED ? "var(--color-accent-100)" : "transparent", color: activeFolder === UNSORTED ? "var(--color-accent-700)" : "var(--color-text)" }}
          >
            <span>🗂️ Chưa phân loại</span>
            <span className="tag tag-neutral">{items.filter((it) => !it.folder).length}</span>
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            Lưu SOP, thuế, bảo hiểm, bảng lương gốc… và các tài liệu ngoài khác cho gọn gàng, dễ tìm.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm flex-none"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            + Tải tài liệu lên
          </button>
        </div>

        {error && (
          <p className="text-xs font-semibold px-6 pt-3" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {visibleItems.length === 0 ? (
            <p style={{ color: "var(--color-neutral-500)" }}>Chưa có tài liệu nào ở đây. Bấm &quot;+ Tải tài liệu lên&quot; để bắt đầu.</p>
          ) : (
            <div className="flex flex-col gap-2 max-w-[720px]">
              {visibleItems.map((it) => (
                <div key={it.id} className="card elev-sm p-3 flex items-center gap-3">
                  <span className="text-2xl flex-none" aria-hidden>
                    {iconFor(it.mime_type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold truncate" title={it.title}>
                      {it.title}
                    </h3>
                    <span className="text-[11px] truncate block" style={{ color: "var(--color-neutral-500)" }}>
                      {it.file_name} {formatSize(it.file_size) && `· ${formatSize(it.file_size)}`} · {formatDate(it.created_at)}
                      {it.folder && activeFolder === "all" && ` · 📁 ${it.folder}`}
                    </span>
                    {it.note && (
                      <p className="text-[12px] mt-1" style={{ color: "var(--color-neutral-600)" }}>
                        {it.note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <button
                      type="button"
                      onClick={() => handleDownload(it)}
                      disabled={downloadingId === it.id}
                      className="btn-icon"
                      aria-label="Tải về"
                      title="Tải về"
                    >
                      ⬇
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(it);
                        setShowForm(true);
                      }}
                      className="btn-icon"
                      aria-label="Sửa"
                      title="Sửa"
                    >
                      ✏️
                    </button>
                    <button type="button" onClick={() => handleDelete(it)} className="btn-icon" aria-label="Xoá" title="Xoá">
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <DocumentFormModal
          folders={folders}
          defaultFolder={activeFolder}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={upsertItem}
        />
      )}
    </div>
  );
}
