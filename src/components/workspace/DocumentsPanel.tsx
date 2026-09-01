"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createStaffDocument, listStaffDocuments } from "@/lib/actions/documents";
import type { Profile, StaffDocument, StaffDocumentType } from "@/lib/types";

const TYPE_LABELS: Record<StaffDocumentType, string> = {
  labor_contract: "Hợp đồng lao động",
  nda: "NDA bảo mật",
  other: "Chứng từ khác",
};

const TYPE_OPTIONS: StaffDocumentType[] = ["labor_contract", "nda", "other"];

function statusTag(status: StaffDocument["status"]) {
  if (status === "signed") return { label: "Đã ký", className: "tag-accent-2" };
  if (status === "voided") return { label: "Đã huỷ", className: "tag-neutral" };
  return { label: "Chờ ký", className: "tag-accent" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN");
}

function NewDocumentForm({
  profiles,
  currentUserId,
  documents,
  onCreated,
  onCancel,
}: {
  profiles: Profile[];
  currentUserId: string;
  documents: StaffDocument[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [profileId, setProfileId] = useState(profiles.find((p) => p.id !== currentUserId)?.id ?? "");
  const [type, setType] = useState<StaffDocumentType>("labor_contract");
  const [title, setTitle] = useState("Hợp đồng lao động");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastOfType = useMemo(
    () => documents.find((d) => d.type === type && d.status !== "voided"),
    [documents, type],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profileId) {
      setError("Vui lòng chọn nhân sự.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createStaffDocument({ profileId, type, title, content });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo văn bản.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Gửi cho
          <select className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Loại văn bản
          <select className="input" value={type} onChange={(e) => setType(e.target.value as StaffDocumentType)}>
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
        <input type="text" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span>Nội dung</span>
          {lastOfType && (
            <button
              type="button"
              onClick={() => setContent(lastOfType.content)}
              className="text-xs font-bold"
              style={{ color: "var(--color-accent-600)" }}
            >
              Sao chép nội dung từ văn bản gần nhất cùng loại
            </button>
          )}
        </div>
        <textarea
          className="input"
          rows={10}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Nội dung hợp đồng / thoả thuận…"
        />
      </label>
      {error && (
        <p className="text-sm" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
          {saving ? "Đang tạo…" : "Tạo và gửi"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          Huỷ
        </button>
      </div>
    </form>
  );
}

export function DocumentsPanel({
  profiles,
  currentUserId,
  canManage,
  initialDocuments,
}: {
  profiles: Profile[];
  currentUserId: string;
  canManage: boolean;
  initialDocuments: StaffDocument[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [showForm, setShowForm] = useState(false);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  async function refresh() {
    setDocuments(await listStaffDocuments());
    setShowForm(false);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-lg">Hợp đồng</h1>
        {canManage && !showForm && (
          <button type="button" onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">
            + Tạo văn bản mới
          </button>
        )}
      </div>

      {canManage && showForm && (
        <NewDocumentForm
          profiles={profiles}
          currentUserId={currentUserId}
          documents={documents}
          onCreated={refresh}
          onCancel={() => setShowForm(false)}
        />
      )}

      {documents.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
          {canManage ? "Chưa có văn bản nào." : "Bạn chưa có văn bản nào cần ký."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => {
            const tag = statusTag(doc.status);
            const staff = profileById.get(doc.profile_id);
            return (
              <Link
                key={doc.id}
                href={`/workspace/hop-dong/${doc.id}`}
                className="card p-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-bold truncate">{doc.title}</span>
                  <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                    {TYPE_LABELS[doc.type]}
                    {canManage && staff && ` · ${staff.display_name}`} · {formatDate(doc.created_at)}
                  </span>
                </div>
                <span className={`tag ${tag.className} flex-none`}>{tag.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
