"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signStaffDocument, voidStaffDocument, deleteStaffDocument } from "@/lib/actions/documents";
import { SignaturePad, type SignaturePadHandle } from "@/components/workspace/SignaturePad";
import type { Profile, StaffDocument, StaffDocumentType } from "@/lib/types";

const COMPANY = {
  name: "Công ty TNHH Funti Kidbooks",
  taxCode: "0319688648",
  address: "40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM",
  phone: "0978 346 851",
  email: "funtikidbooks.studio@gmail.com",
};

const TYPE_LABELS: Record<StaffDocumentType, string> = {
  labor_contract: "Hợp đồng lao động",
  nda: "Thoả thuận bảo mật (NDA)",
  other: "Chứng từ khác",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN");
}

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
      setError("Vui lòng ký vào khung chữ ký trước.");
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
    <div className="flex-1 flex flex-col items-center py-8 px-4" style={{ background: "var(--color-surface)" }}>
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
          {document.status === "signed" && (
            <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
              🖨 In / Xuất PDF
            </button>
          )}
        </div>
      </div>

      <div className="card elev-sm w-full max-w-[700px] p-10 flex flex-col gap-7" style={{ background: "#fff", color: "#141211" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Image src="/brand/funti-logo.jpg" alt="" width={48} height={48} className="rounded-full object-cover flex-none" />
            <div>
              <div className="font-heading font-bold text-base">{COMPANY.name}</div>
              <div className="text-xs" style={{ color: "#6b6560" }}>
                {COMPANY.address}
              </div>
              <div className="text-xs" style={{ color: "#6b6560" }}>
                MST: {COMPANY.taxCode} · {COMPANY.phone} · {COMPANY.email}
              </div>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-heading font-bold" style={{ color: "#e26b1f" }}>
              {document.title}
            </h1>
            <div className="text-xs mt-1" style={{ color: "#6b6560" }}>
              {TYPE_LABELS[document.type]}
            </div>
            <div className="text-xs mt-1" style={{ color: "#6b6560" }}>
              Trạng thái:{" "}
              {document.status === "signed" ? "Đã ký" : document.status === "voided" ? "Đã huỷ" : "Chờ ký"}
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs font-bold tracking-[0.08em] mb-1.5" style={{ color: "#6b6560" }}>
              GỬI CHO
            </div>
            <div className="text-sm font-bold">{profile.display_name}</div>
            {profile.role && <div className="text-sm">{profile.role}</div>}
            <div className="text-sm">{profile.email}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-sm">
              <span style={{ color: "#6b6560" }}>Ngày tạo: </span>
              {formatDateTime(document.created_at)}
            </div>
            {document.signed_at && (
              <div className="text-sm">
                <span style={{ color: "#6b6560" }}>Ngày ký: </span>
                {formatDateTime(document.signed_at)}
              </div>
            )}
          </div>
        </div>

        <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ borderTop: "1px solid #e5e0d8", borderBottom: "1px solid #e5e0d8", padding: "20px 0" }}>
          {document.content}
        </div>

        {document.status === "signed" ? (
          <div className="grid grid-cols-2 gap-6 mt-2 text-center text-sm">
            <div className="flex flex-col items-center gap-2">
              <span className="font-bold">Đại diện công ty</span>
              <span style={{ color: "#9a938a" }}>(Ký, ghi rõ họ tên)</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="font-bold">{profile.display_name}</span>
              {document.signature_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={document.signature_image_url} alt="Chữ ký" style={{ height: 70, objectFit: "contain" }} />
              )}
              <span className="text-xs" style={{ color: "#9a938a" }}>
                {document.signed_name} · {document.signed_at && formatDateTime(document.signed_at)}
              </span>
            </div>
          </div>
        ) : document.status === "voided" ? (
          <div className="no-print text-sm text-center py-2" style={{ color: "var(--status-red)" }}>
            Văn bản này đã bị huỷ.
          </div>
        ) : canSign ? (
          <div className="no-print flex flex-col gap-3">
            <div className="text-xs font-bold tracking-[0.08em]" style={{ color: "#6b6560" }}>
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
        ) : (
          <div className="no-print text-sm text-center py-2" style={{ color: "#9a938a" }}>
            Đang chờ {profile.display_name} ký.
          </div>
        )}
      </div>
    </div>
  );
}
