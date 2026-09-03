"use client";

import Link from "next/link";
import Image from "next/image";
import type { Invoice, PageType } from "@/lib/types";

const PAGE_TYPE_LABELS: Record<PageType, string> = {
  single: "Trang đơn",
  double: "Trang đôi",
};

const COMPANY = {
  name: "Công ty TNHH Funti Kidbooks",
  taxCode: "0319688648",
  address: "40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM",
  phone: "0978 346 851",
  email: "funtikidbooks.studio@gmail.com",
};

const STATUS_LABELS: Record<Invoice["status"], string> = {
  draft: "Nháp",
  issued: "Đã xuất",
  paid: "Đã thanh toán",
  cancelled: "Đã huỷ",
};

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

// issue_date/due_date are plain calendar dates with no time-of-day
// meaning — parsed and read back both as UTC so the round-trip stays
// consistent regardless of the runtime's own local timezone. See
// MeetingHub.tsx's own comment on this same root cause elsewhere in the app.
function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("vi-VN", { timeZone: "UTC" });
}

export function InvoicePrintView({ invoice }: { invoice: Invoice }) {
  const subtotal = invoice.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  const taxAmount = subtotal * (invoice.tax_rate / 100);
  const total = subtotal + taxAmount;

  return (
    <div className="flex-1 flex flex-col items-center py-8 px-4" style={{ background: "var(--color-surface)" }}>
      <div className="no-print flex items-center justify-between w-full max-w-[800px] mb-4">
        <Link href="/quan-tri/hoa-don" className="text-sm font-bold" style={{ color: "var(--color-accent-600)" }}>
          ← Quay lại danh sách
        </Link>
        <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
          🖨 In / Xuất PDF
        </button>
      </div>

      <div className="card elev-sm w-full max-w-[800px] p-10 flex flex-col gap-8" style={{ background: "#fff", color: "#141211" }}>
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
            <h1 className="text-2xl font-heading font-bold" style={{ color: "#e26b1f" }}>
              HOÁ ĐƠN
            </h1>
            <div className="text-sm font-bold">{invoice.invoice_number}</div>
            <div className="text-xs mt-1" style={{ color: "#6b6560" }}>
              Trạng thái: {STATUS_LABELS[invoice.status]}
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs font-bold tracking-[0.08em] mb-1.5" style={{ color: "#6b6560" }}>
              KHÁCH HÀNG
            </div>
            <div className="text-sm font-bold">{invoice.client_name}</div>
            {invoice.client_address && <div className="text-sm">{invoice.client_address}</div>}
            {invoice.client_tax_code && <div className="text-sm">MST: {invoice.client_tax_code}</div>}
            {invoice.client_email && <div className="text-sm">{invoice.client_email}</div>}
          </div>
          <div className="sm:text-right">
            <div className="text-sm">
              <span style={{ color: "#6b6560" }}>Ngày lập: </span>
              {formatDate(invoice.issue_date)}
            </div>
            {invoice.due_date && (
              <div className="text-sm">
                <span style={{ color: "#6b6560" }}>Hạn thanh toán: </span>
                {formatDate(invoice.due_date)}
              </div>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1.5px solid #141211" }}>
              <th className="text-left py-2">Mô tả</th>
              <th className="text-right py-2" style={{ width: 70 }}>SL trang</th>
              <th className="text-right py-2" style={{ width: 90 }}>Kiểu trang</th>
              <th className="text-right py-2" style={{ width: 120 }}>Đơn giá</th>
              <th className="text-right py-2" style={{ width: 130 }}>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e5e0d8" }}>
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right">{it.quantity}</td>
                <td className="py-2 text-right">{PAGE_TYPE_LABELS[it.page_type ?? "single"]}</td>
                <td className="py-2 text-right">{formatVnd(it.unit_price)}</td>
                <td className="py-2 text-right">{formatVnd(it.quantity * it.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="flex flex-col gap-1 text-sm" style={{ minWidth: 220 }}>
            <div className="flex justify-between">
              <span style={{ color: "#6b6560" }}>Tạm tính</span>
              <span>{formatVnd(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "#6b6560" }}>Thuế VAT ({invoice.tax_rate}%)</span>
              <span>{formatVnd(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-1" style={{ borderTop: "1.5px solid #141211" }}>
              <span>Tổng cộng</span>
              <span>{formatVnd(total)}</span>
            </div>
          </div>
        </div>

        {invoice.note && (
          <div>
            <div className="text-xs font-bold tracking-[0.08em] mb-1" style={{ color: "#6b6560" }}>
              GHI CHÚ
            </div>
            <p className="text-sm whitespace-pre-wrap">{invoice.note}</p>
          </div>
        )}

        <p className="text-xs text-center mt-4" style={{ color: "#9a938a" }}>
          Cảm ơn quý khách đã tin tưởng và hợp tác cùng {COMPANY.name}.
        </p>
      </div>
    </div>
  );
}
