"use client";

import { useEffect, useState } from "react";
import {
  addMyPayrollFeedback,
  confirmMyPayroll,
  getMyBankInfo,
  getMyPayroll,
  getMyPayrollConfirmation,
  getMyStaffSalary,
  listMyPayrollFeedback,
} from "@/lib/actions/payroll";
import { bankColor, formatAccountNumber } from "@/lib/bankDisplay";
import { ImageLightbox } from "@/components/workspace/ImageLightbox";
import type { PayrollConfirmation, PayrollFeedback, PayrollRecord, StaffBankInfo, StaffSalary } from "@/lib/types";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

// Collapsed by default on the workspace Chấm công page — a quiet link to
// "what did I actually get paid this month", not something that competes
// with the attendance calendar for attention.
export function MyPayrollPanel({ monthStart }: { monthStart: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<PayrollRecord | null>(null);
  const [salary, setSalary] = useState<StaffSalary | null>(null);
  const [bankInfo, setBankInfo] = useState<StaffBankInfo | null>(null);
  const [qrLightboxOpen, setQrLightboxOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<PayrollConfirmation | null>(null);
  const [feedback, setFeedback] = useState<PayrollFeedback[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loads (and reloads on month nav) only while the panel is actually
  // open — no point fetching a payslip nobody's looking at yet.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [rec, mySalary, myBankInfo] = await Promise.all([getMyPayroll(monthStart), getMyStaffSalary(), getMyBankInfo()]);
        if (cancelled) return;
        setRecord(rec);
        setSalary(mySalary);
        setBankInfo(myBankInfo);
        if (rec) {
          const [feedbackList, myConfirmation] = await Promise.all([
            listMyPayrollFeedback(rec.id),
            getMyPayrollConfirmation(rec.id),
          ]);
          if (cancelled) return;
          setFeedback(feedbackList);
          setConfirmation(myConfirmation);
        } else {
          setFeedback([]);
          setConfirmation(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không thể tải bảng lương");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, monthStart]);

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!record || !message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const saved = await addMyPayrollFeedback(record.id, message);
      setFeedback((prev) => [...prev, saved]);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm() {
    if (!record || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      setConfirmation(await confirmMyPayroll(record.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setConfirming(false);
    }
  }

  const itemsTotal = record?.items.reduce((sum, it) => sum + it.amount, 0) ?? 0;
  const total = (record?.base_salary ?? 0) + itemsTotal;

  return (
    <div className="card elev-sm" style={{ maxWidth: 480 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-bold flex items-center gap-2">💰 Bảng lương tháng này</span>
        <span aria-hidden style={{ color: "var(--color-neutral-400)" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 px-4 pb-4" style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
          {bankInfo && (bankInfo.bank_name || bankInfo.account_number) && (
            <div className="rounded-[10px] p-3 flex items-center gap-2 mt-3" style={{ background: bankColor(bankInfo.bank_name) }}>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-white/90">{bankInfo.bank_name || "Ngân hàng"}</span>
                <span className="text-sm font-bold text-white font-mono tracking-wide">
                  {bankInfo.account_number ? formatAccountNumber(bankInfo.account_number) : "—"}
                </span>
                {bankInfo.account_holder && <span className="text-[11px] text-white/80">{bankInfo.account_holder}</span>}
              </div>
              {bankInfo.qr_image_url && (
                <button
                  type="button"
                  onClick={() => setQrLightboxOpen(true)}
                  className="flex-none"
                  title="Xem mã QR cỡ lớn"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bankInfo.qr_image_url}
                    alt="Mã QR chuyển khoản"
                    className="rounded-[6px] object-cover"
                    style={{ width: 44, height: 44, background: "#fff" }}
                  />
                </button>
              )}
            </div>
          )}
          {bankInfo?.qr_image_url && qrLightboxOpen && (
            <ImageLightbox
              url={bankInfo.qr_image_url}
              filename="Mã QR chuyển khoản"
              onClose={() => setQrLightboxOpen(false)}
            />
          )}

          {loading ? (
            <p className="text-xs pt-3" style={{ color: "var(--color-neutral-500)" }}>
              Đang tải…
            </p>
          ) : !record ? (
            <p className="text-xs pt-3" style={{ color: "var(--color-neutral-500)" }}>
              Chưa có bảng lương cho tháng này.
            </p>
          ) : (
            <>
              {salary && (
                <div className="flex gap-4 pt-3 text-xs" style={{ color: "var(--color-neutral-500)" }}>
                  <span>
                    Lương cứng: <strong style={{ color: "var(--color-text)" }}>{formatVnd(salary.monthly_salary)}</strong>
                  </span>
                  <span>
                    Mỗi ngày công:{" "}
                    <strong style={{ color: "var(--color-text)" }}>
                      {formatVnd(salary.standard_work_days > 0 ? salary.monthly_salary / salary.standard_work_days : 0)}
                    </strong>
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1 text-sm" style={{ paddingTop: salary ? 0 : 12 }}>
                <div className="flex justify-between gap-3">
                  <span style={{ color: "var(--color-neutral-500)" }}>
                    Lương theo ngày công{record.work_days !== null && ` (${record.work_days} ngày)`}
                  </span>
                  <span className="flex-none">{formatVnd(record.base_salary)}</span>
                </div>
                {record.items.map((it, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span style={{ color: "var(--color-neutral-500)" }}>{it.label}</span>
                    <span className="flex-none" style={{ color: it.amount < 0 ? "var(--status-red)" : undefined }}>
                      {it.amount < 0 ? "-" : "+"}
                      {formatVnd(Math.abs(it.amount))}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 text-base font-bold pt-1.5 mt-0.5" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
                  <span>Thực nhận</span>
                  <span>{formatVnd(total)}</span>
                </div>
                <span className="text-[11px]" style={{ color: record.status === "paid" ? "var(--status-green)" : "var(--color-neutral-500)" }}>
                  {record.status === "paid" ? "Đã trả" : "Nháp — số liệu có thể còn điều chỉnh"}
                </span>
              </div>

              {confirmation ? (
                <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--status-green)" }}>
                  ✓ Đã xác nhận lúc {new Date(confirmation.confirmed_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                </div>
              ) : (
                <button type="button" onClick={handleConfirm} className="btn btn-secondary btn-sm w-fit" disabled={confirming}>
                  {confirming ? "Đang xác nhận…" : "✓ Xác nhận số liệu đã đúng"}
                </button>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold tracking-[0.06em]" style={{ color: "var(--color-neutral-500)" }}>
                  PHẢN HỒI CỦA BẠN
                </span>
                {feedback.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {feedback.map((f) => (
                      <div key={f.id} className="text-xs p-2 rounded-[8px]" style={{ background: "var(--color-surface)" }}>
                        <p className="whitespace-pre-wrap">{f.message}</p>
                        <span style={{ color: "var(--color-neutral-400)" }}>{new Date(f.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span>
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={submitFeedback} className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    style={{ padding: "6px 10px", fontSize: 13 }}
                    placeholder="Có gì thiếu sót? Nhắn cho quản lý…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary btn-sm flex-none" disabled={sending || !message.trim()}>
                    {sending ? "…" : "Gửi"}
                  </button>
                </form>
              </div>
            </>
          )}

          {error && (
            <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
