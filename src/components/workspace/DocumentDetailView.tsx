"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signStaffDocument, voidStaffDocument, deleteStaffDocument } from "@/lib/actions/documents";
import { SignaturePad, type SignaturePadHandle } from "@/components/workspace/SignaturePad";
import { DocumentPrintCard } from "@/components/workspace/DocumentPrintCard";
import type { Profile, StaffDocument } from "@/lib/types";

export function DocumentDetailView({
  document,
  profile,
  currentUserId,
  canManage,
  backHref = "/workspace/hop-dong",
  backLabel = "Quay lại Hợp đồng",
}: {
  document: StaffDocument;
  profile: Profile;
  currentUserId: string;
  canManage: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const isMine = document.profile_id === currentUserId;
  const canSign = isMine && document.status === "pending";

  const [signedName, setSignedName] = useState(profile.display_name);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"void" | "delete" | null>(null);
  const padRef = useRef<SignaturePadHandle | null>(null);

  async function handleSign() {
    if (!hasDrawn) {
      setError("Vui lòng ký hoặc nhập tên vào khung chữ ký trước.");
      return;
    }
    if (!signedName.trim()) {
      setError("Vui lòng nhập họ tên xác nhận.");
      return;
    }
    if (!agreed) {
      setError("Vui lòng xác nhận đã đọc và đồng ý nội dung.");
      return;
    }
    setError(null);
    setSigning(true);
    try {
      const blob = await padRef.current?.getBlob();
      if (!blob) throw new Error("Không lấy được chữ ký, vui lòng ký lại.");
      const formData = new FormData();
      formData.set("signature", blob, "signature.png");
      await signStaffDocument(document.id, signedName, formData);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể ký văn bản.");
    } finally {
      setSigning(false);
    }
  }

  async function handleVoid() {
    if (!confirm("Huỷ văn bản này? Bạn có thể tạo văn bản mới nếu cần.")) return;
    setBusyAction("void");
    try {
      await voidStaffDocument(document.id);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Xoá hẳn văn bản chưa ký này?")) return;
    setBusyAction("delete");
    try {
      await deleteStaffDocument(document.id);
      router.push(backHref);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center py-8 px-4"
      style={{ background: "var(--color-surface)" }}
    >
      <div className="no-print flex items-center justify-between w-full max-w-[700px] mb-4">
        <Link href={backHref} className="text-sm font-bold" style={{ color: "var(--color-accent-600)" }}>
          ← {backLabel}
        </Link>
        <div className="flex items-center gap-2">
          {canManage && document.status !== "voided" && (
            <button type="button" onClick={handleVoid} disabled={busyAction !== null} className="btn btn-ghost btn-sm">
              {busyAction === "void" ? "Đang huỷ…" : "Huỷ văn bản"}
            </button>
          )}
          {canManage && document.status === "pending" && (
            <button type="button" onClick={handleDelete} disabled={busyAction !== null} className="btn btn-ghost btn-sm" style={{ color: "var(--status-red)" }}>
              {busyAction === "delete" ? "Đang xoá…" : "Xoá"}
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
            🖨 In / Xuất PDF
          </button>
        </div>
      </div>

      <DocumentPrintCard
        title={document.title}
        type={document.type}
        status={document.status}
        content={document.content}
        createdAt={document.created_at}
        recipientName={profile.display_name}
        recipientRole={profile.role}
        recipientEmail={profile.email}
        signedAt={document.signed_at}
        signedName={document.signed_name}
        signatureImageUrl={document.signature_image_url}
      />

      {document.status === "signed" && document.signed_at && (
        <div
          className="no-print flex items-center gap-1.5 text-sm font-bold w-full max-w-[700px] mt-4"
          style={{ color: "var(--status-green)" }}
        >
          ✓ Đã xác nhận lúc {new Date(document.signed_at).toLocaleString("vi-VN")}
        </div>
      )}

      {document.status === "voided" ? (
        <div className="no-print text-sm text-center py-4" style={{ color: "var(--status-red)" }}>
          Văn bản này đã bị huỷ.
        </div>
      ) : canSign ? (
        <div className="no-print flex flex-col gap-3 w-full max-w-[700px] mt-4">
          <div className="text-xs font-bold tracking-[0.08em]" style={{ color: "var(--color-neutral-500)" }}>
            KÝ XÁC NHẬN
          </div>
          <SignaturePad ref={padRef} onChange={setHasDrawn} />
          <label className="flex flex-col gap-1 text-sm">
            Họ tên xác nhận
            <input
              type="text"
              className="input"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              placeholder="Nhập họ tên đầy đủ"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            Tôi đã đọc và đồng ý với nội dung văn bản trên
          </label>
          {error && (
            <p className="text-sm" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
          <button type="button" onClick={handleSign} disabled={signing} className="btn btn-primary self-start">
            {signing ? "Đang ký…" : "Ký xác nhận"}
          </button>
        </div>
      ) : document.status === "pending" ? (
        <div className="no-print text-sm text-center py-4" style={{ color: "var(--color-neutral-500)" }}>
          Đang chờ {profile.display_name} ký.
        </div>
      ) : null}
    </div>
  );
}
