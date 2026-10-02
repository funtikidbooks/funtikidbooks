"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { requestLeave } from "@/lib/actions/leave";
import { vnToday } from "@/lib/constants/attendance";
import { LEAVE_STATUS, leaveOutcome, leaveRangeLabel, leaveWorkDays } from "@/lib/leave";
import type { LeaveRequest, LeaveRequestStatus } from "@/lib/types";

// Đơn xin nghỉ on a staff member's own Chấm công page: a card beside the
// calendar listing their requests, and the form a tap on a future day (or
// "+ Xin nghỉ") opens. A Giám đốc or PM decides from the "Chờ duyệt"
// inbox on the workspace top bar (LeaveTopBar) or Quản trị → Chấm công.

export function LeaveStatusChip({ status }: { status: LeaveRequestStatus }) {
  const st = LEAVE_STATUS[status];
  return (
    <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap" style={{ background: st.bg, color: st.color }}>
      {st.label}
    </span>
  );
}

export function LeaveCard({
  requests,
  onNew,
  onCancel,
}: {
  requests: LeaveRequest[];
  onNew: () => void;
  onCancel: (id: string) => void;
}) {
  const today = vnToday();
  // Upcoming and waiting first; past ones only for a couple of weeks.
  const shown = requests
    .filter((r) => r.status === "pending" || r.end_date >= addDaysIso(today, -14))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 12);

  return (
    <section className="card elev-sm min-w-0 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-bold flex items-center gap-2">🗓 Xin nghỉ</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
          + Xin nghỉ
        </button>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4 pt-3" style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--color-neutral-600)" }}>
          Bấm vào một ngày trên lịch (từ hôm nay trở đi) để xin nghỉ ngày đó. Giám đốc hoặc PM duyệt xong, ngày nghỉ tự được chấm công.
        </p>
        {shown.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có đơn xin nghỉ nào.
          </p>
        ) : (
          <LeaveList requests={shown} onCancel={onCancel} />
        )}
      </div>
    </section>
  );
}

// One row per request — here and in the top bar's "Đơn xin nghỉ của bạn" (LeaveTopBar).
export function LeaveList({ requests, onCancel }: { requests: LeaveRequest[]; onCancel: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {requests.map((r) => (
        <li key={r.id} className="rounded-[10px] px-3 py-2.5 flex flex-col gap-1" style={{ background: "var(--color-surface)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] font-bold">{leaveRangeLabel(r)}</span>
            <LeaveStatusChip status={r.status} />
          </div>
          {r.start_date !== r.end_date && (
            <span className="text-[12px]" style={{ color: "var(--color-neutral-600)" }}>
              {leaveWorkDays(r.start_date, r.end_date).length} ngày làm việc
            </span>
          )}
          {r.reason && (
            <span className="text-[12.5px]" style={{ color: "var(--color-neutral-600)" }}>
              {r.reason}
            </span>
          )}
          {r.status === "approved" && (
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--status-green)" }}>
              {leaveOutcome(r)}
            </span>
          )}
          {r.decision_note && (
            <span className="text-[12.5px]" style={{ color: "var(--color-neutral-600)" }}>
              Quản lý nhắn: {r.decision_note}
            </span>
          )}
          {r.status === "pending" && (
            <button
              type="button"
              className="text-[12.5px] font-semibold w-fit hover:underline"
              style={{ color: "var(--color-neutral-500)" }}
              onClick={() => onCancel(r.id)}
            >
              Huỷ đơn
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function addDaysIso(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function LeaveRequestModal({
  initialStart,
  offDates,
  onClose,
  onSaved,
}: {
  initialStart: string;
  // The company's days off in the month on screen — left out of the count.
  offDates: string[];
  onClose: () => void;
  onSaved: (saved: LeaveRequest) => void;
}) {
  const today = vnToday();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialStart);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const singleDay = start === end;
  const days = end >= start ? leaveWorkDays(start, end, offDates) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await requestLeave({ start, end, halfDay: singleDay && halfDay, reason }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa gửi được đơn, bạn thử lại nhé.");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <form onSubmit={submit} className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">🗓 Xin nghỉ</h2>
            <p className="text-[12.5px] mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
              Giám đốc hoặc PM sẽ nhận thông báo và duyệt đơn.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" style={{ width: 32, height: 32, padding: 0 }} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
          <div className="field">
            <label htmlFor="leave-start">Từ ngày</label>
            <input
              id="leave-start"
              type="date"
              className="input"
              min={today}
              value={start}
              onChange={(e) => {
                const v = e.target.value;
                setStart(v);
                if (end < v) setEnd(v);
              }}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="leave-end">Đến ngày</label>
            <input id="leave-end" type="date" className="input" min={start} value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>

        {singleDay ? (
          <div className="flex gap-2">
            {[
              { v: false, label: "Cả ngày" },
              { v: true, label: "Nửa ngày" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setHalfDay(o.v)}
                className="flex-1 rounded-[10px] py-2 text-[13px] font-semibold"
                style={{
                  background: halfDay === o.v ? "var(--color-accent-500)" : "var(--color-surface)",
                  color: halfDay === o.v ? "#fff" : "var(--color-text)",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[13px] font-semibold" style={{ color: days.length ? "var(--color-text)" : "var(--status-red)" }}>
            {days.length ? `${days.length} ngày làm việc (không tính Chủ nhật và ngày nghỉ chung)` : "Khoảng này toàn ngày nghỉ sẵn rồi."}
          </p>
        )}

        <div className="field">
          <label htmlFor="leave-reason">Lý do (không bắt buộc)</label>
          <input
            id="leave-reason"
            className="input"
            maxLength={300}
            autoComplete="off"
            placeholder="Chỉ bạn và quản lý thấy"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={busy || days.length === 0 || start < today}>
          {busy ? "Đang gửi…" : "Gửi đơn xin nghỉ"}
        </button>
      </form>
    </Modal>
  );
}
