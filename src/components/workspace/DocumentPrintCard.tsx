import Image from "next/image";
import type { StaffDocumentType } from "@/lib/types";

const COMPANY = {
  name: "Công ty TNHH Funti Kidbooks",
  taxCode: "0319688648",
  address: "40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM",
  phone: "0978 346 851",
  email: "funtikidbooks.studio@gmail.com",
};

const TYPE_LABELS: Record<StaffDocumentType, string> = {
  labor_contract: "Hợp đồng lao động",
  probation_contract: "Hợp đồng thử việc",
  nda: "Thoả thuận bảo mật (NDA)",
  other: "Chứng từ khác",
};

// Explicit timeZone — without it this reads the *runtime's* local
// timezone, and the server (Vercel, UTC) formats a different clock time
// than a browser in Vietnam (UTC+7) does for the same instant. That's a
// real hydration mismatch on first load, same root cause fixed in
// MeetingHub.tsx/CalendarView.tsx (see their own comments on it).
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

// The actual printable page — company header, the document body, and a
// signature footer. The footer always reserves both signature lines (like
// PayrollPrintView) so a still-unsigned document prints as a normal blank
// paper contract ready for a wet-ink signature, not just a placeholder.
export function DocumentPrintCard({
  title,
  type,
  status,
  content,
  createdAt,
  recipientName,
  recipientRole,
  recipientEmail,
  signedAt,
  signedName,
  signatureImageUrl,
}: {
  title: string;
  type: StaffDocumentType;
  status: "draft" | "pending" | "signed" | "voided";
  content: string;
  createdAt: string;
  recipientName: string;
  recipientRole?: string | null;
  recipientEmail?: string | null;
  signedAt?: string | null;
  signedName?: string | null;
  signatureImageUrl?: string | null;
}) {
  return (
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
            {title}
          </h1>
          <div className="text-xs mt-1" style={{ color: "#6b6560" }}>
            {TYPE_LABELS[type]}
          </div>
          <div className="text-xs mt-1" style={{ color: "#6b6560" }}>
            Trạng thái:{" "}
            {status === "signed" ? "Đã ký" : status === "voided" ? "Đã huỷ" : status === "draft" ? "Nháp" : "Chờ ký"}
          </div>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-xs font-bold tracking-[0.08em] mb-1.5" style={{ color: "#6b6560" }}>
            GỬI CHO
          </div>
          <div className="text-sm font-bold">{recipientName}</div>
          {recipientRole && <div className="text-sm">{recipientRole}</div>}
          {recipientEmail && <div className="text-sm">{recipientEmail}</div>}
        </div>
        <div className="sm:text-right">
          <div className="text-sm">
            <span style={{ color: "#6b6560" }}>Ngày tạo: </span>
            {formatDateTime(createdAt)}
          </div>
          {signedAt && (
            <div className="text-sm">
              <span style={{ color: "#6b6560" }}>Ngày ký: </span>
              {formatDateTime(signedAt)}
            </div>
          )}
        </div>
      </div>

      <div
        className="whitespace-pre-wrap text-sm leading-relaxed"
        style={{ borderTop: "1px solid #e5e0d8", borderBottom: "1px solid #e5e0d8", padding: "20px 0" }}
      >
        {content}
      </div>

      <div className="grid grid-cols-2 gap-6 mt-2 text-center text-sm">
        <div className="flex flex-col items-center gap-2">
          <span className="font-bold">Đại diện công ty</span>
          <span style={{ color: "#9a938a", minHeight: 70 }} className="flex items-end pb-1">
            (Ký, ghi rõ họ tên)
          </span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="font-bold">{recipientName}</span>
          {signatureImageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signatureImageUrl} alt="Chữ ký" style={{ height: 70, objectFit: "contain" }} />
              <span className="text-xs" style={{ color: "#9a938a" }}>
                {signedName} · {signedAt && formatDateTime(signedAt)}
              </span>
            </>
          ) : (
            <span style={{ color: "#9a938a", minHeight: 70 }} className="flex items-end pb-1">
              (Ký, ghi rõ họ tên)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
