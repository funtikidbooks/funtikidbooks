"use client";

import { useEffect, useState } from "react";
import { addMyPayrollFeedback, getMyPayroll, listMyPayrollFeedback } from "@/lib/actions/payroll";
import type { PayrollFeedback, PayrollRecord } from "@/lib/types";

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
  const [feedback, setFeedback] = useState<PayrollFeedback[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
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
        const rec = await getMyPayroll(monthStart);
        if (cancelled) return;
        setRecord(rec);
        setFeedback(rec ? await listMyPayrollFeedback(rec.id) : []);
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
              <div className="flex flex-col gap-1 pt-3 text-sm">
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

              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold tracking-[0.06em]" style={{ color: "var(--color-neutral-500)" }}>
                  PHẢN HỒI CỦA BẠN
                </span>
                {feedback.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {feedback.map((f) => (
                      <div key={f.id} className="text-xs p-2 rounded-[8px]" style={{ background: "var(--color-surface)" }}>
                        <p className="whitespace-pre-wrap">{f.message}</p>
                        <span style={{ color: "var(--color-neutral-400)" }}>{new Date(f.created_at).toLocaleString("vi-VN")}</span>
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
