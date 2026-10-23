"use client";

import { useRef, useState } from "react";
import { deleteDocumentTemplate, saveDocumentTemplate } from "@/lib/actions/documents";
import { TEMPLATE_FIELDS } from "@/lib/documentTemplate";
import type { StaffDocumentTemplate, StaffDocumentType } from "@/lib/types";

const TYPE_LABELS: Record<StaffDocumentType, string> = {
  labor_contract: "Hợp đồng lao động",
  probation_contract: "Hợp đồng thử việc",
  nda: "NDA bảo mật",
  other: "Chứng từ khác",
};
const TYPE_OPTIONS: StaffDocumentType[] = ["labor_contract", "probation_contract", "nda", "other"];

type Draft = { id?: string; type: StaffDocumentType; name: string; title: string; content: string };

// Quản trị → Hợp đồng → "Hợp đồng mẫu": the fixed starting texts. Making a
// document for someone can start from one of these (see NewDraftStarter and
// DocumentDraftEditor); the {{…}} blanks are filled from that person's
// profile and CCCD record.
export function DocumentTemplatesSection({
  templates,
  onChange,
}: {
  templates: StaffDocumentTemplate[];
  onChange: (next: StaffDocumentTemplate[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function insertField(key: string) {
    const el = contentRef.current;
    if (!el || !editing) return;
    const token = `{{${key}}}`;
    const start = el.selectionStart ?? editing.content.length;
    const end = el.selectionEnd ?? start;
    const next = editing.content.slice(0, start) + token + editing.content.slice(end);
    setEditing({ ...editing, content: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveDocumentTemplate(editing);
      onChange(editing.id ? templates.map((t) => (t.id === saved.id ? saved : t)) : [...templates, saved]);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể lưu mẫu.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing?.id || !confirm(`Xoá mẫu "${editing.name}"? Các hợp đồng đã tạo từ mẫu này không bị ảnh hưởng.`)) return;
    setBusy(true);
    try {
      await deleteDocumentTemplate(editing.id);
      onChange(templates.filter((t) => t.id !== editing.id));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xoá mẫu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 px-0.5 py-1 text-left flex-1">
          <span
            aria-hidden
            className="text-[10px] transition-transform"
            style={{ color: "var(--color-neutral-400)", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ▶
          </span>
          <h2 className="text-xs font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
            HỢP ĐỒNG MẪU
          </h2>
          <span className="text-xs" style={{ color: "var(--color-neutral-400)" }}>
            {templates.length}
          </span>
        </button>
        {open && !editing && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setEditing({ type: "probation_contract", name: "", title: "Hợp đồng thử việc", content: "" })}
          >
            + Mẫu mới
          </button>
        )}
      </div>

      {open && !editing && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {templates.length === 0 && (
            <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
              Chưa có mẫu nào.
            </p>
          )}
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditing({ id: t.id, type: t.type, name: t.name, title: t.title, content: t.content })}
              className="card p-3 flex flex-col gap-0.5 text-left"
            >
              <span className="text-sm font-bold truncate">{t.name}</span>
              <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                {TYPE_LABELS[t.type]} · sửa lần cuối {new Date(t.updated_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
              </span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <div className="card p-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              Tên mẫu
              <input
                className="input"
                value={editing.name}
                placeholder="VD: Hợp đồng thử việc — hoạ sĩ"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Loại văn bản
              <select
                className="input"
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value as StaffDocumentType })}
                disabled={busy}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Tiêu đề văn bản
              <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} disabled={busy} />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
              Bấm để chèn ô tự điền vào chỗ con trỏ — khi tạo hợp đồng cho ai, web tự thay bằng thông tin người đó (hồ sơ + CCCD):
            </span>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => insertField(f.key)}
                  disabled={busy}
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-neutral-200)" }}
                  title={`{{${f.key}}}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            ref={contentRef}
            className="input"
            rows={22}
            value={editing.content}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            disabled={busy}
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />

          {error && (
            <p className="text-sm" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={save} disabled={busy} className="btn btn-primary btn-sm">
              {busy ? "Đang lưu…" : "Lưu mẫu"}
            </button>
            <button type="button" onClick={() => setEditing(null)} disabled={busy} className="btn btn-ghost btn-sm">
              Huỷ
            </button>
            {editing.id && (
              <button type="button" onClick={remove} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: "var(--status-red)" }}>
                Xoá mẫu
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
