"use client";

import { useState, useTransition } from "react";
import { createProposalTemplate, deleteProposalTemplate, updateProposalTemplate } from "@/lib/actions/upwork";
import type { UpworkProposalTemplate } from "@/lib/types";

type Draft = { name: string; jobType: string; content: string };

function TemplateForm({
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: Draft;
  saving: boolean;
  error: string | null;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          Tên mẫu
          <input
            className="input text-sm font-normal"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="VD: Picture book 32 trang"
            maxLength={80}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold">
          Dùng cho loại job
          <input
            className="input text-sm font-normal"
            value={draft.jobType}
            onChange={(e) => setDraft({ ...draft, jobType: e.target.value })}
            placeholder="VD: Character design, Bìa sách"
            maxLength={60}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold">
        Nội dung proposal
        <textarea
          className="input text-sm font-normal font-sans leading-relaxed"
          rows={12}
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          placeholder="Hello [tên khách], ..."
        />
      </label>
      {error && (
        <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => onSave(draft)}>
          {saving ? "Đang lưu…" : "Lưu mẫu"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onChanged,
  onDeleted,
}: {
  template: UpworkProposalTemplate;
  onChanged: (next: UpworkProposalTemplate) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const long = template.content.length > 420 || template.content.split("\n").length > 8;

  async function copy() {
    try {
      await navigator.clipboard.writeText(template.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — "Xem hết" still lets the text be selected by hand.
    }
  }

  if (editing) {
    return (
      <div className="card elev-sm p-4">
        <TemplateForm
          initial={{ name: template.name, jobType: template.job_type ?? "", content: template.content }}
          saving={pending}
          error={error}
          onCancel={() => {
            setError(null);
            setEditing(false);
          }}
          onSave={(draft) =>
            startTransition(async () => {
              try {
                onChanged(await updateProposalTemplate(template.id, draft));
                setError(null);
                setEditing(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Không thể lưu mẫu.");
              }
            })
          }
        />
      </div>
    );
  }

  return (
    <div className="card elev-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1">
          <span className="text-sm font-bold">{template.name}</span>
          {template.job_type && <span className="tag tag-neutral w-fit text-[11px]">{template.job_type}</span>}
        </div>
        <button type="button" className="btn btn-primary btn-sm flex-none" onClick={copy}>
          {copied ? "Đã chép ✓" : "Sao chép"}
        </button>
      </div>

      {/* Padding lives on the wrapper — on the clamped element itself the
          bottom padding would show the top half of the next, hidden line. */}
      <div className="rounded-[8px] p-3" style={{ background: "var(--color-surface)" }}>
        <p
          className="text-sm whitespace-pre-wrap leading-relaxed"
          style={{
            color: "var(--color-text)",
            ...(long && !expanded
              ? { display: "-webkit-box", WebkitLineClamp: 8, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }
              : {}),
          }}
        >
          {template.content}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
        {long && (
          <button type="button" className="hover:underline" style={{ color: "var(--color-accent-700)" }} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Thu gọn" : "Xem hết"}
          </button>
        )}
        <button type="button" className="hover:underline" style={{ color: "var(--color-accent-700)" }} onClick={() => setEditing(true)}>
          Sửa
        </button>
        {confirmDelete ? (
          <span className="flex items-center gap-2">
            <span style={{ color: "var(--color-neutral-500)" }}>Xoá mẫu này?</span>
            <button
              type="button"
              className="hover:underline"
              style={{ color: "var(--status-red)" }}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deleteProposalTemplate(template.id);
                  onDeleted();
                })
              }
            >
              Xoá
            </button>
            <button type="button" className="hover:underline" style={{ color: "var(--color-neutral-500)" }} onClick={() => setConfirmDelete(false)}>
              Huỷ
            </button>
          </span>
        ) : (
          <button type="button" className="hover:underline" style={{ color: "var(--color-neutral-500)" }} onClick={() => setConfirmDelete(true)}>
            Xoá
          </button>
        )}
      </div>
    </div>
  );
}

export function ProposalTemplates({
  templates,
  onTemplatesChange,
}: {
  templates: UpworkProposalTemplate[];
  onTemplatesChange: (next: UpworkProposalTemplate[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs max-w-[60ch]" style={{ color: "var(--color-neutral-500)" }}>
          Mỗi loại job một mẫu. Ca đêm chọn mẫu hợp nhất để soạn proposal riêng cho từng job; sếp cũng có thể bấm Sao chép để
          dùng trực tiếp.
        </p>
        {!adding && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            + Thêm mẫu
          </button>
        )}
      </div>

      {adding && (
        <div className="card elev-sm p-4">
          <TemplateForm
            initial={{ name: "", jobType: "", content: "" }}
            saving={pending}
            error={error}
            onCancel={() => {
              setError(null);
              setAdding(false);
            }}
            onSave={(draft) =>
              startTransition(async () => {
                try {
                  const created = await createProposalTemplate(draft);
                  onTemplatesChange([...templates, created]);
                  setError(null);
                  setAdding(false);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Không thể lưu mẫu.");
                }
              })
            }
          />
        </div>
      )}

      {templates.length === 0 && !adding ? (
        <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
          Chưa có mẫu nào. Bấm &quot;+ Thêm mẫu&quot; để lưu proposal đầu tiên.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onChanged={(next) => onTemplatesChange(templates.map((x) => (x.id === next.id ? next : x)))}
              onDeleted={() => onTemplatesChange(templates.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
