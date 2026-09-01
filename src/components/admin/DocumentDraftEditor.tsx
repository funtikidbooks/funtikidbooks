"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateDraftDocument, sendDraftDocument, deleteStaffDocument } from "@/lib/actions/documents";
import type { Profile, StaffDocument, StaffDocumentType } from "@/lib/types";

const TYPE_LABELS: Record<StaffDocumentType, string> = {
  labor_contract: "Hợp đồng lao động",
  nda: "NDA bảo mật",
  other: "Chứng từ khác",
};

const TYPE_OPTIONS: StaffDocumentType[] = ["labor_contract", "nda", "other"];

// The compose-and-review screen for a still-draft document — "soạn thử
// xem như nào, rồi mới gửi". Nothing here is visible to the recipient
// until Gửi actually flips the row to 'pending' (see sendDraftDocument).
export function DocumentDraftEditor({ document, profiles }: { document: StaffDocument; profiles: Profile[] }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState(document.profile_id);
  const [type, setType] = useState<StaffDocumentType>(document.type);
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const recipient = profiles.find((p) => p.id === profileId);

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    try {
      await updateDraftDocument(document.id, { profileId, type, title, content });
      setSavedAt(new Date());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể lưu nháp.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!content.trim()) {
      setError("Cần nhập nội dung trước khi gửi.");
      return;
    }
    if (!confirm(`Gửi văn bản này cho ${recipient?.display_name ?? "nhân viên"}?`)) return;
    setSending(true);
    setError(null);
    try {
      await updateDraftDocument(document.id, { profileId, type, title, content });
      await sendDraftDocument(document.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể gửi văn bản.");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Xoá hẳn bản nháp này?")) return;
    setDeleting(true);
    try {
      await deleteStaffDocument(document.id);
      router.push("/quan-tri/hop-dong");
    } finally {
      setDeleting(false);
    }
  }

  const busy = saving || sending || deleting;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-4 max-w-[700px]">
      <div className="flex items-center justify-between">
        <Link href="/quan-tri/hop-dong" className="text-sm font-bold" style={{ color: "var(--color-accent-600)" }}>
          ← Quay lại Hợp đồng
        </Link>
        <span className="tag tag-outline">Bản nháp</span>
      </div>

      <div className="card p-4 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Gửi cho
            <select className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={busy}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Loại văn bản
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as StaffDocumentType)}
              disabled={busy}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Tiêu đề
          <input type="text" className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Nội dung
          <textarea
            className="input"
            rows={20}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nội dung hợp đồng / thoả thuận…"
            disabled={busy}
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
        </label>

        {error && (
          <p className="text-sm" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={handleSend} disabled={busy} className="btn btn-primary btn-sm">
            {sending ? "Đang gửi…" : `Gửi cho ${recipient?.display_name ?? "nhân viên"}`}
          </button>
          <button type="button" onClick={handleSaveDraft} disabled={busy} className="btn btn-ghost btn-sm">
            {saving ? "Đang lưu…" : "Lưu nháp"}
          </button>
          <button type="button" onClick={handleDelete} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: "var(--status-red)" }}>
            {deleting ? "Đang xoá…" : "Xoá nháp"}
          </button>
          {savedAt && (
            <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
              Đã lưu lúc {savedAt.toLocaleTimeString("vi-VN")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
