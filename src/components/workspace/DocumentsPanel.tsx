"use client";

import Link from "next/link";
import type { StaffDocument, StaffDocumentType } from "@/lib/types";

const TYPE_LABELS: Record<StaffDocumentType, string> = {
  labor_contract: "Hợp đồng lao động",
  nda: "NDA bảo mật",
  other: "Chứng từ khác",
};

function statusTag(status: StaffDocument["status"]) {
  if (status === "signed") return { label: "Đã ký", className: "tag-accent-2" };
  if (status === "voided") return { label: "Đã huỷ", className: "tag-neutral" };
  return { label: "Chờ ký", className: "tag-accent" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN");
}

// The recipient's own inbox — every hợp đồng/NDA/chứng từ someone at
// Funti Kidbooks has sent this staff member. Composing and sending lives
// in /quan-tri/hop-dong instead; this page is read-only until a tap
// opens the sign screen for a still-pending one.
export function DocumentsPanel({ documents }: { documents: StaffDocument[] }) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 gap-4">
      <h1 className="font-heading font-bold text-lg">Hợp đồng</h1>

      {documents.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
          Bạn chưa có văn bản nào cần ký.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => {
            const tag = statusTag(doc.status);
            return (
              <Link key={doc.id} href={`/workspace/hop-dong/${doc.id}`} className="card p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-bold truncate">{doc.title}</span>
                  <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                    {TYPE_LABELS[doc.type]} · {formatDate(doc.created_at)}
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
