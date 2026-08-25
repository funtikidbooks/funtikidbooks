"use client";

import { useMemo, useState } from "react";
import { listPayrollForMonth } from "@/lib/actions/payroll";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { PayrollEditModal } from "@/components/admin/PayrollEditModal";
import { MONTH_LABELS, addMonths, firstOfMonth, vnToday } from "@/lib/constants/attendance";
import type { PayrollRecord, Profile } from "@/lib/types";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function netTotal(r: PayrollRecord) {
  return r.base_salary + r.items.reduce((sum, it) => sum + it.amount, 0);
}

export function PayrollBoard({ initialRecords, staff }: { initialRecords: PayrollRecord[]; staff: Profile[] }) {
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(vnToday()));
  const [records, setRecords] = useState(initialRecords);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const byProfile = useMemo(() => new Map(records.map((r) => [r.profile_id, r])), [records]);

  async function goToMonth(newStart: string) {
    setMonthStart(newStart);
    setLoading(true);
    try {
      setRecords(await listPayrollForMonth(newStart));
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
                  <span className="font-semibold text-sm truncate max-w-[160px]">{p.display_name}</span>
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
