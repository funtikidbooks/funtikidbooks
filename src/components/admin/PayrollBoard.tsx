"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listPayrollConfirmations, listPayrollForMonth } from "@/lib/actions/payroll";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { PayrollEditModal } from "@/components/admin/PayrollEditModal";
import { MONTH_LABELS, addMonths, firstOfMonth, vnToday } from "@/lib/constants/attendance";
import type { PayrollConfirmation, PayrollRecord, Profile } from "@/lib/types";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function netTotal(r: PayrollRecord) {
  return r.base_salary + r.items.reduce((sum, it) => sum + it.amount, 0);
}

export function PayrollBoard({
  initialRecords,
  initialConfirmedIds,
  staff,
}: {
  initialRecords: PayrollRecord[];
  initialConfirmedIds: string[];
  staff: Profile[];
}) {
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(vnToday()));
  const [records, setRecords] = useState(initialRecords);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(() => new Set(initialConfirmedIds));
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const byProfile = useMemo(() => new Map(records.map((r) => [r.profile_id, r])), [records]);

  // A confirmation landing for a payslip that isn't this month's doesn't
  // hurt anything — nothing currently rendered ever looks it up — so this
  // subscribes broadly rather than trying to filter by the current month
  // server-side (postgres_changes filters can't express "id in this list").
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("payroll-confirmations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll_confirmations" }, (payload) => {
        const isDelete = payload.eventType === "DELETE";
        const row = (isDelete ? payload.old : payload.new) as PayrollConfirmation;
        setConfirmedIds((prev) => {
          const next = new Set(prev);
          if (isDelete) next.delete(row.payroll_record_id);
          else next.add(row.payroll_record_id);
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function goToMonth(newStart: string) {
    setMonthStart(newStart);
    setLoading(true);
    try {
      const monthRecords = await listPayrollForMonth(newStart);
      setRecords(monthRecords);
      const confirmations = await listPayrollConfirmations(monthRecords.map((r) => r.id));
      setConfirmedIds(new Set(confirmations.map((c) => c.payroll_record_id)));
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSaved(record: PayrollRecord) {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.profile_id === record.profile_id);
      if (idx === -1) return [...prev, record];
      return prev.map((r, i) => (i === idx ? record : r));
    });
    // The save just cleared this record's confirmation server-side (any
    // director edit invalidates a prior sign-off) — drop it locally too
    // instead of waiting for the realtime DELETE to round-trip back.
    setConfirmedIds((prev) => {
      if (!prev.has(record.id)) return prev;
      const next = new Set(prev);
      next.delete(record.id);
      return next;
    });
  }

  const d = new Date(`${monthStart}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Bảng lương</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Chỉ Giám đốc xem được. Bấm vào một thẻ để lập/sửa lương — có thể áp dụng khấu trừ gợi ý từ dữ liệu chấm công.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => goToMonth(addMonths(monthStart, -1))} className="btn-icon" aria-label="Tháng trước">
          ←
        </button>
        <span className="text-sm font-bold">{monthLabel}</span>
        <button type="button" onClick={() => goToMonth(addMonths(monthStart, 1))} className="btn-icon" aria-label="Tháng sau">
          →
        </button>
        {monthStart !== firstOfMonth(vnToday()) && (
          <button type="button" onClick={() => goToMonth(firstOfMonth(vnToday()))} className="btn btn-ghost btn-sm">
            Tháng này
          </button>
        )}
      </div>

      {staff.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
          Chưa có nhân viên nào.
        </p>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", opacity: loading ? 0.6 : 1 }}
        >
          {staff.map((p) => {
            const record = byProfile.get(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditing(p)}
                className="card elev-sm fk-staff-card flex flex-col items-center gap-2 p-4 text-center"
              >
                <AttendanceAvatar profile={p} size={44} />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-sm truncate max-w-[160px] flex items-center justify-center gap-1">
                    {p.display_name}
                    {record && confirmedIds.has(record.id) && (
                      <span title="Nhân viên đã xác nhận bảng lương" style={{ color: "var(--status-green)" }}>
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                    {p.role || "Nhân viên"}
                  </span>
                </div>
                {record ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-bold">{formatVnd(netTotal(record))}</span>
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: record.status === "paid" ? "var(--status-green)" : "var(--color-neutral-500)" }}
                    >
                      {record.status === "paid" ? "Đã trả" : "Nháp"}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-bold" style={{ color: "var(--color-neutral-400)" }}>
                    Chưa lập bảng lương
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {editing && (
        <PayrollEditModal
          profile={editing}
          month={monthStart}
          record={byProfile.get(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
