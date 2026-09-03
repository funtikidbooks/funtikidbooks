"use client";

import Link from "next/link";
import Image from "next/image";
import { MONTH_LABELS } from "@/lib/constants/attendance";
import type { PayrollRecord, Profile } from "@/lib/types";

const COMPANY = {
  name: "Công ty TNHH Funti Kidbooks",
  taxCode: "0319688648",
  address: "40A-40B Út Tịch, Phường Tân Sơn Nhất, Tân Bình, TP.HCM",
  phone: "0978 346 851",
  email: "funtikidbooks.studio@gmail.com",
};

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

export function PayrollPrintView({ record, profile }: { record: PayrollRecord; profile: Profile }) {
  // record.month is a plain calendar date with no time-of-day meaning —
  // parsed and read back both as UTC so the round-trip stays consistent
  // regardless of the runtime's own local timezone; "today" gets an
  // explicit timeZone for the same reason. See MeetingHub.tsx's own
  // comment on this same root cause elsewhere in the app.
  const d = new Date(`${record.month}T00:00:00Z`);
  const monthLabel = `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const itemsTotal = record.items.reduce((sum, it) => sum + it.amount, 0);
  const total = record.base_salary + itemsTotal;
  const today = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  return (
    <div className="flex-1 flex flex-col items-center py-8 px-4" style={{ background: "var(--color-surface)" }}>
      <div className="no-print flex items-center justify-between w-full max-w-[700px] mb-4">
        <Link href="/quan-tri/bang-luong" className="text-sm font-bold" style={{ color: "var(--color-accent-600)" }}>
          ← Quay lại bảng lương
        </Link>
        <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
          🖨 In / Xuất PDF
        </button>
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
            <h1 className="text-2xl font-heading font-bold" style={{ color: "#e26b1f" }}>
              PHIẾU LƯƠNG
            </h1>
            <div className="text-sm font-bold">{monthLabel}</div>
            <div className="text-xs mt-1" style={{ color: "#6b6560" }}>
              Trạng thái: {record.status === "paid" ? "Đã trả" : "Nháp"}
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs font-bold tracking-[0.08em] mb-1.5" style={{ color: "#6b6560" }}>
              NHÂN VIÊN
            </div>
            <div className="text-sm font-bold">{profile.display_name}</div>
            {profile.role && <div className="text-sm">{profile.role}</div>}
            {profile.address && <div className="text-sm">{profile.address}</div>}
            {profile.phone && <div className="text-sm">SĐT: {profile.phone}</div>}
            <div className="text-sm">{profile.email}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-sm">
              <span style={{ color: "#6b6560" }}>Ngày lập: </span>
              {today}
            </div>
            {record.work_days !== null && (
              <div className="text-sm">
                <span style={{ color: "#6b6560" }}>Ngày công: </span>
                {record.work_days}
              </div>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1.5px solid #141211" }}>
              <th className="text-left py-2">Khoản mục</th>
              <th className="text-right py-2" style={{ width: 140 }}>
                Số tiền
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #e5e0d8" }}>
              <td className="py-2">
                Lương theo ngày công{record.work_days !== null && ` (${record.work_days} ngày)`}
              </td>
              <td className="py-2 text-right">{formatVnd(record.base_salary)}</td>
            </tr>
            {record.items.map((it, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e5e0d8" }}>
                <td className="py-2">{it.label}</td>
                <td className="py-2 text-right" style={{ color: it.amount < 0 ? "#c0524f" : undefined }}>
                  {it.amount < 0 ? "-" : "+"}
                  {formatVnd(Math.abs(it.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="flex flex-col gap-1 text-sm" style={{ minWidth: 220 }}>
            <div className="flex justify-between text-base font-bold pt-1" style={{ borderTop: "1.5px solid #141211" }}>
              <span>Thực nhận</span>
              <span>{formatVnd(total)}</span>
            </div>
          </div>
        </div>

        {record.note && (
          <div>
            <div className="text-xs font-bold tracking-[0.08em] mb-1" style={{ color: "#6b6560" }}>
              GHI CHÚ
            </div>
            <p className="text-sm whitespace-pre-wrap">{record.note}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mt-6 text-center text-sm">
          <div className="flex flex-col gap-16">
            <span className="font-bold">Người lập bảng lương</span>
            <span style={{ color: "#9a938a" }}>(Ký, ghi rõ họ tên)</span>
          </div>
          <div className="flex flex-col gap-16">
            <span className="font-bold">Người nhận lương</span>
            <span style={{ color: "#9a938a" }}>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
