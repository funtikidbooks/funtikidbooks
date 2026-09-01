"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDraftDocument } from "@/lib/actions/documents";
import type { Profile, StaffDocument, StaffDocumentType } from "@/lib/types";

const TYPE_LABELS: Record<StaffDocumentType, string> = {
  labor_contract: "Hợp đồng lao động",
  probation_contract: "Hợp đồng thử việc",
  nda: "NDA bảo mật",
  other: "Chứng từ khác",
};

const TYPE_TITLE_DEFAULTS: Record<StaffDocumentType, string> = {
  labor_contract: "Hợp đồng lao động",
  probation_contract: "Hợp đồng thử việc",
  nda: "Thoả thuận bảo mật (NDA)",
  other: "Chứng từ",
};

const TYPE_OPTIONS: StaffDocumentType[] = ["labor_contract", "probation_contract", "nda", "other"];

function statusTag(status: StaffDocument["status"]) {
  if (status === "signed") return { label: "Đã ký", className: "tag-accent-2" };
  if (status === "voided") return { label: "Đã huỷ", className: "tag-neutral" };
  if (status === "draft") return { label: "Nháp", className: "tag-outline" };
  return { label: "Chờ ký", className: "tag-accent" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN");
}

function NewDraftStarter({ profiles, onCreated, onCancel }: { profiles: Profile[]; onCreated: (id: string) => void; onCancel: () => void }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [type, setType] = useState<StaffDocumentType>("labor_contract");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!profileId) {
      setError("Vui lòng chọn nhân sự.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const doc = await createDraftDocument({ profileId, type, title: TYPE_TITLE_DEFAULTS[type], content: "" });
      onCreated(doc.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tạo nháp.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
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
      {error && (
        <p className="text-sm" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleCreate} disabled={creating} className="btn btn-primary btn-sm">
          {creating ? "Đang tạo…" : "Tạo bản nháp"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
          Huỷ
        </button>
      </div>
    </div>
  );
}

export function DocumentsAdminPanel({
  profiles,
  initialDocuments,
}: {
  profiles: Profile[];
  initialDocuments: StaffDocument[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-lg">Hợp đồng</h1>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)} className="btn btn-primary btn-sm">
            + Tạo văn bản mới
          </button>
        )}
      </div>

      {showForm && (
        <NewDraftStarter
          profiles={profiles}
          onCreated={(id) => router.push(`/quan-tri/hop-dong/${id}`)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {initialDocuments.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
          Chưa có văn bản nào.
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-w-[700px]">
          {initialDocuments.map((doc) => {
            const tag = statusTag(doc.status);
            const staff = profileById.get(doc.profile_id);
            return (
              <Link key={doc.id} href={`/quan-tri/hop-dong/${doc.id}`} className="card p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-bold truncate">{doc.title}</span>
                  <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                    {TYPE_LABELS[doc.type]} · {staff?.display_name ?? "—"} · {formatDate(doc.created_at)}
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
