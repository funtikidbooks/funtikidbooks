"use client";

import { useMemo, useState } from "react";
import { getMonthAttendance } from "@/lib/actions/attendance";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { AttendanceMonthDetail } from "@/components/admin/AttendanceMonthDetail";
import {
  WORK_HOURS_LABEL,
  firstOfMonth,
  formatCheckInTime,
  isLateCheckIn,
  isMonToFri,
  vnToday,
} from "@/lib/constants/attendance";
import type { AttendanceEntry, Profile } from "@/lib/types";

export function AttendanceBoard({
  initialEntries,
  staff,
}: {
  initialEntries: AttendanceEntry[];
  staff: Profile[];
}) {
  const [entries] = useState(initialEntries);
  const [detail, setDetail] = useState<{ profile: Profile; entries: AttendanceEntry[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const today = vnToday();

  const todayByProfile = useMemo(() => {
    const map = new Map<string, AttendanceEntry>();
    for (const e of entries) if (e.work_date === today) map.set(e.profile_id, e);
    return map;
  }, [entries, today]);

  async function openDetail(profile: Profile) {
    setDetailLoading(profile.id);
    try {
      const monthEntries = await getMonthAttendance(profile.id, firstOfMonth(vnToday()));
      setDetail({ profile, entries: monthEntries });
    } catch {
      setDetail({ profile, entries: [] });
    } finally {
      setDetailLoading(null);
    }
  }

  const weekday = isMonToFri(today);

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Chấm công</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Giờ vào làm ghi nhận tự động theo lần đăng nhập đầu tiên trong ngày của từng nhân viên. Giờ làm việc: {WORK_HOURS_LABEL}. Bấm vào một thẻ để xem chi tiết theo tháng.
        </p>
      </div>

      {staff.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
          Chưa có nhân viên nào.
        </p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {staff.map((p) => {
            const entry = todayByProfile.get(p.id);
            let statusNode: React.ReactNode;
            if (entry?.status === "leave") {
              statusNode = (
                <span className="text-xs font-bold" style={{ color: "var(--color-neutral-500)" }}>
                  Nghỉ phép
                </span>
              );
            } else if (entry?.status === "absent") {
              statusNode = (
                <span className="text-xs font-bold" style={{ color: "var(--status-red)" }}>
                  Vắng
                </span>
              );
            } else if (entry?.check_in_at) {
              const late = weekday && isLateCheckIn(entry.check_in_at);
              statusNode = (
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-bold">🕐 {formatCheckInTime(entry.check_in_at)}</span>
                  <span className="text-[11px] font-bold" style={{ color: late ? "var(--status-yellow)" : "var(--status-green)" }}>
                    {late ? "Trễ" : "Đúng giờ"}
                  </span>
                </span>
              );
            } else if (!weekday) {
              statusNode = (
                <span className="text-xs" style={{ color: "var(--color-neutral-400)" }}>
                  Ngày nghỉ
                </span>
              );
            } else {
              statusNode = (
                <span className="text-xs font-bold" style={{ color: "var(--color-neutral-400)" }}>
                  Chưa vào làm
                </span>
              );
            }

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => openDetail(p)}
                className="card elev-sm flex flex-col items-center gap-2 p-4 text-center"
              >
                <AttendanceAvatar profile={p} size={44} />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-sm truncate max-w-[160px]">{p.display_name}</span>
                  <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                    {p.role || (p.access_role === "admin" ? "Admin" : "Nhân viên")}
                  </span>
                </div>
                {detailLoading === p.id ? (
                  <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                    Đang tải…
                  </span>
                ) : (
                  statusNode
                )}
              </button>
            );
          })}
        </div>
      )}

      {detail && (
        <AttendanceMonthDetail
          profile={detail.profile}
          initialEntries={detail.entries}
          initialMonthStart={firstOfMonth(vnToday())}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
