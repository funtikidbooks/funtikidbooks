"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getMonthAttendance, listOffDates } from "@/lib/actions/attendance";
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
  initialOffDates,
  staff,
}: {
  initialEntries: AttendanceEntry[];
  initialOffDates: string[];
  staff: Profile[];
}) {
  const offDateSet = useMemo(() => new Set(initialOffDates), [initialOffDates]);
  // Rows the realtime subscription below has seen since mount, keyed by id
  // (null = deleted) — merged over initialEntries at render time rather than
  // mirrored into its own useState, so a router.refresh() bringing fresher
  // server data is never fought by a stale copy sitting in state.
  const [liveOverlay, setLiveOverlay] = useState<Map<string, AttendanceEntry | null>>(new Map());
  const entries = useMemo(() => {
    if (liveOverlay.size === 0) return initialEntries;
    const byId = new Map(initialEntries.map((e) => [e.id, e]));
    for (const [id, row] of liveOverlay) {
      if (row) byId.set(id, row);
      else byId.delete(id);
    }
    return Array.from(byId.values());
  }, [initialEntries, liveOverlay]);
  const [detail, setDetail] = useState<{ profile: Profile; entries: AttendanceEntry[]; offDates: string[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const router = useRouter();

  // initialEntries is a snapshot from the server render — Next.js's client
  // router cache can keep serving that same snapshot when navigating back to
  // this page, so refresh explicitly whenever the page (re)mounts or the tab
  // regains focus — a fallback for whatever the realtime subscription below
  // missed while disconnected, rather than the primary way new check-ins
  // show up now.
  useEffect(() => {
    router.refresh();
    function handleVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
    };
  }, [router]);

  // Attendance is meant to be transparent in real time — a staff member
  // checking in, or another director/PM editing an entry, shows up on this
  // board immediately instead of only after the next focus/visibility
  // refresh. This week's board only ever shows the current week, so any
  // row for a date outside it is simply ignored.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("attendance-board-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, (payload) => {
        const isDelete = payload.eventType === "DELETE";
        const row = (isDelete ? payload.old : payload.new) as AttendanceEntry;
        setLiveOverlay((prev) => new Map(prev).set(row.id, isDelete ? null : row));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const today = vnToday();

  const todayByProfile = useMemo(() => {
    const map = new Map<string, AttendanceEntry>();
    for (const e of entries) if (e.work_date === today) map.set(e.profile_id, e);
    return map;
  }, [entries, today]);

  async function openDetail(profile: Profile) {
    setDetailLoading(profile.id);
    try {
      const [monthEntries, monthOffDates] = await Promise.all([
        getMonthAttendance(profile.id, firstOfMonth(vnToday())),
        listOffDates(firstOfMonth(vnToday())),
      ]);
      setDetail({ profile, entries: monthEntries, offDates: monthOffDates });
    } catch {
      setDetail({ profile, entries: [], offDates: [] });
    } finally {
      setDetailLoading(null);
    }
  }

  const weekday = isMonToFri(today) && !offDateSet.has(today);

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
            if (entry?.status === "off") {
              statusNode = (
                <span className="text-xs" style={{ color: "var(--color-neutral-400)" }}>
                  Ngày nghỉ
                </span>
              );
            } else if (entry?.status === "paid_leave") {
              statusNode = (
                <span className="text-xs font-bold" style={{ color: "var(--status-blue)" }}>
                  Nghỉ có lương
                </span>
              );
            } else if (entry?.status === "leave") {
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
              const late = isLateCheckIn(entry.check_in_at);
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
                className="card elev-sm fk-staff-card flex flex-col items-center gap-2 p-4 text-center"
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
          initialOffDates={detail.offDates}
          initialMonthStart={firstOfMonth(vnToday())}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
