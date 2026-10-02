"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { listMyMonthAttendance, listOffDates } from "@/lib/actions/attendance";
import { MyPayrollPanel } from "@/components/workspace/MyPayrollPanel";
import { OvertimeBadge } from "@/components/admin/AttendanceEditCellModal";
import { LeaveCard, LeaveRequestModal } from "@/components/workspace/LeaveRequests";
import { cancelMyLeave } from "@/lib/actions/leave";
import { LEAVE_SELECT, datesBetween } from "@/lib/leave";
import {
  isCalendarOffFor,
  MONTH_LABELS,
  WEEKDAYS_SHORT,
  WORK_HOURS_LABEL,
  addMonths,
  firstOfMonth,
  formatCheckInTime,
  isDefaultWorkDay,
  isLateCheckIn,
  isSameMonth,
  monthGridDates,
  summarizeAttendance,
  vnToday,
} from "@/lib/constants/attendance";
import type { AttendanceEntry, LeaveRequest } from "@/lib/types";

export function MyAttendance({
  initialEntries,
  initialOffDates,
  currentUserId,
  initialLeaveRequests,
  aside,
}: {
  initialEntries: AttendanceEntry[];
  initialOffDates: string[];
  currentUserId: string;
  // Đơn xin nghỉ (lib/actions/leave.ts) — their requests; the calendar's
  // days from today on become tappable to ask for one.
  initialLeaveRequests?: LeaveRequest[];
  // A column beside the calendar on wide screens (Xin nghỉ, Ứng tiền
  // trước); under the payslip on phones and iPad.
  aside?: React.ReactNode;
}) {
  const leaveOn = initialLeaveRequests !== undefined;
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(initialLeaveRequests ?? []);
  const [leaveDraft, setLeaveDraft] = useState<string | null>(null);
  // A Giám đốc/PM decision (or a request from another device) shows up here.
  useEffect(() => {
    if (!leaveOn) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`leave-requests-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests", filter: `profile_id=eq.${currentUserId}` }, async () => {
        const { data } = await supabase
          .from("leave_requests")
          .select(LEAVE_SELECT)
          .eq("profile_id", currentUserId)
          .order("start_date", { ascending: false })
          .limit(50);
        if (data) setLeaveRequests(data as LeaveRequest[]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leaveOn, currentUserId]);
  // Days with a request still waiting — marked on the calendar.
  const pendingLeaveDays = useMemo(() => {
    const days = new Set<string>();
    for (const r of leaveRequests) if (r.status === "pending") datesBetween(r.start_date, r.end_date).forEach((d) => days.add(d));
    return days;
  }, [leaveRequests]);
  async function cancelLeave(id: string) {
    if (!window.confirm("Huỷ đơn xin nghỉ này?")) return;
    try {
      const saved = await cancelMyLeave(id);
      setLeaveRequests((prev) => prev.map((r) => (r.id === id ? saved : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chưa huỷ được, thử lại nhé.");
    }
  }
  const hasSide = leaveOn || !!aside;
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(vnToday()));
  const [offDates, setOffDates] = useState(initialOffDates);
  const offDateSet = useMemo(() => new Set(offDates), [offDates]);
  // Rows the realtime subscription below has seen since mount for the
  // current month, keyed by id (null = deleted) — merged over initialEntries
  // at render time rather than mirrored into its own useState, so a
  // router.refresh() bringing fresher server data is never fought by a
  // stale copy sitting in state.
  const [liveOverlay, setLiveOverlay] = useState<Map<string, AttendanceEntry | null>>(new Map());
  const currentMonthEntries = useMemo(() => {
    if (liveOverlay.size === 0) return initialEntries;
    const byId = new Map(initialEntries.map((e) => [e.id, e]));
    for (const [id, row] of liveOverlay) {
      if (row) byId.set(id, row);
      else byId.delete(id);
    }
    return Array.from(byId.values());
  }, [initialEntries, liveOverlay]);
  const [otherMonthEntries, setOtherMonthEntries] = useState<AttendanceEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"calendar" | "table">("calendar");
  const router = useRouter();
  const isCurrentMonth = monthStart === firstOfMonth(vnToday());
  const entries = useMemo(
    () => (isCurrentMonth ? currentMonthEntries : (otherMonthEntries ?? [])),
    [isCurrentMonth, currentMonthEntries, otherMonthEntries],
  );

  // The client router cache can keep serving the same server-rendered
  // snapshot when navigating back to this page, so refresh explicitly
  // whenever it (re)mounts or the tab regains focus — a fallback for
  // whatever the realtime subscription below missed while disconnected,
  // rather than the primary way new check-ins show up now.
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

  // A check-in (from this device or another) or a director/PM edit to this
  // month's attendance shows up immediately instead of waiting for the next
  // focus/visibility-triggered router.refresh() — attendance is meant to be
  // transparent in real time, not just eventually consistent.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`attendance-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `profile_id=eq.${currentUserId}` },
        (payload) => {
          const isDelete = payload.eventType === "DELETE";
          const row = (isDelete ? payload.old : payload.new) as AttendanceEntry;
          const monthOfRow = firstOfMonth(row.work_date);
          if (monthOfRow === firstOfMonth(vnToday())) {
            setLiveOverlay((prev) => new Map(prev).set(row.id, isDelete ? null : row));
          }
          if (monthOfRow === monthStart) {
            setOtherMonthEntries((prev) => {
              if (!prev) return prev;
              if (isDelete) return prev.filter((e) => e.id !== row.id);
              return prev.some((e) => e.id === row.id) ? prev.map((e) => (e.id === row.id ? row : e)) : [...prev, row];
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, monthStart]);

  const today = vnToday();
  const byDate = useMemo(() => new Map(entries.map((e) => [e.work_date, e])), [entries]);
  const stats = useMemo(() => summarizeAttendance(entries), [entries]);

  async function goToMonth(newStart: string) {
    setMonthStart(newStart);
    if (newStart === firstOfMonth(vnToday())) {
      setOtherMonthEntries(null);
      setOffDates(initialOffDates);
      return;
    }
    setLoading(true);
    try {
      const [monthEntries, monthOffDates] = await Promise.all([listMyMonthAttendance(newStart), listOffDates(newStart)]);
      setOtherMonthEntries(monthEntries);
      setOffDates(monthOffDates);
    } catch {
      setOtherMonthEntries([]);
      setOffDates([]);
    } finally {
      setLoading(false);
    }
  }

  const d = new Date(`${monthStart}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  const dates = monthGridDates(monthStart);

  // Shared between the calendar grid and the table view below — one badge
  // per day, computed once instead of duplicating this same status-priority
  // chain (off > paid leave > half day > leave > absent > checked in >
  // not-yet-checked-in > weekend) in two places that could quietly drift
  // apart from each other.
  function dayBadge(date: string, entry: AttendanceEntry | undefined, inMonth: boolean) {
    const isFuture = date > today;
    const weekday = isDefaultWorkDay(date) && !offDateSet.has(date);
    // A PM/director declaring a day off on the shared calendar should win
    // over whatever's already in `entry` — most often a stale "present"
    // from someone who logged in (and got auto-checked-in) before that day
    // got marked off — instead of quietly showing a check-in time on a
    // day that's now supposed to read as a holiday.
    // …except a day a director/PM marked as tăng ca: that person really came in.
    if (entry?.overtime) return <OvertimeBadge entry={entry} />;
    if (isCalendarOffFor(date, entry, offDateSet)) return <span style={{ color: "var(--color-neutral-400)" }}>Ngày nghỉ</span>;
    if (entry?.status === "off") return <span style={{ color: "var(--color-neutral-400)" }}>Ngày nghỉ</span>;
    if (entry?.status === "paid_leave") return <span style={{ color: "var(--status-blue)" }}>Nghỉ có lương</span>;
    if (entry?.status === "half_day") return <span style={{ color: "var(--status-purple)" }}>Nửa công</span>;
    if (entry?.status === "leave") return <span style={{ color: "var(--color-neutral-500)" }}>Nghỉ</span>;
    if (entry?.status === "absent") return <span style={{ color: "var(--status-red)" }}>Vắng</span>;
    if (entry?.check_in_at) {
      const late = isLateCheckIn(entry.check_in_at);
      return (
        <>
          <span style={{ color: late ? "var(--status-yellow)" : "var(--status-green)" }}>{formatCheckInTime(entry.check_in_at)}</span>
          {entry.check_out_at && (
            <span className="block" style={{ color: "var(--color-neutral-500)" }} title="Giờ về">
              →{formatCheckInTime(entry.check_out_at)}
            </span>
          )}
        </>
      );
    }
    if (inMonth && !isFuture && weekday) return <span style={{ color: "var(--color-neutral-400)" }}>Chưa vào làm</span>;
    if (inMonth && !weekday) return <span style={{ color: "var(--color-neutral-400)" }}>Ngày nghỉ</span>;
    return null;
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Chấm công</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Giờ vào làm được tự động ghi nhận theo lần đăng nhập đầu tiên trong ngày. Giờ làm việc: {WORK_HOURS_LABEL}.
        </p>
      </div>

      <div
        className={
          hasSide
            ? "grid gap-5 items-start [grid-template-areas:'stats'_'pay'_'aside'_'cal'] xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:grid-rows-[auto_auto_1fr] xl:[grid-template-areas:'stats_aside'_'pay_aside'_'cal_aside']"
            : "flex flex-col gap-5"
        }
      >
      <div className="grid grid-cols-4 gap-3 [grid-area:stats]" style={{ maxWidth: 520 }}>
        <div className="card p-3 flex flex-col items-center gap-0.5" style={{ background: "var(--color-surface)" }}>
          <span className="text-xl font-bold" style={{ color: "var(--status-green)" }}>{stats.present}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>Ngày công</span>
        </div>
        <div className="card p-3 flex flex-col items-center gap-0.5" style={{ background: "var(--color-surface)" }}>
          <span className="text-xl font-bold" style={{ color: "var(--status-yellow)" }}>{stats.late}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>Đi trễ</span>
        </div>
        <div className="card p-3 flex flex-col items-center gap-0.5" style={{ background: "var(--color-surface)" }}>
          <span className="text-xl font-bold" style={{ color: "var(--status-red)" }}>{stats.absent}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>Vắng</span>
        </div>
        <div className="card p-3 flex flex-col items-center gap-0.5" style={{ background: "var(--color-surface)" }}>
          <span className="text-xl font-bold" style={{ color: "var(--color-neutral-600)" }}>{stats.leave}</span>
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>Nghỉ phép</span>
        </div>
      </div>

      <div className="[grid-area:pay]">
        <MyPayrollPanel monthStart={monthStart} />
      </div>

      {hasSide && (
        <div className="[grid-area:aside] min-w-0 flex flex-col gap-5">
          {leaveOn && <LeaveCard requests={leaveRequests} onNew={() => setLeaveDraft(vnToday())} onCancel={cancelLeave} />}
          {aside}
        </div>
      )}
      {leaveDraft && (
        <LeaveRequestModal
          initialStart={leaveDraft}
          offDates={offDates}
          onClose={() => setLeaveDraft(null)}
          onSaved={(saved) => {
            setLeaveRequests((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
            setLeaveDraft(null);
          }}
        />
      )}

      <div className="flex flex-col gap-5 [grid-area:cal] min-w-0">
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
        <div className="flex items-center gap-1 ml-auto rounded-[8px] p-0.5" style={{ background: "var(--color-surface)" }}>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className="btn-sm rounded-[6px]"
            style={{
              padding: "4px 10px",
              background: view === "calendar" ? "var(--color-panel)" : "transparent",
              fontWeight: view === "calendar" ? 700 : 500,
            }}
          >
            Lịch
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className="btn-sm rounded-[6px]"
            style={{
              padding: "4px 10px",
              background: view === "table" ? "var(--color-panel)" : "transparent",
              fontWeight: view === "table" ? 700 : 500,
            }}
          >
            Bảng
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <div className="card elev-sm p-4" style={{ opacity: loading ? 0.6 : 1, maxWidth: hasSide ? undefined : 720 }}>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS_SHORT.map((w) => (
              <div key={w} className="text-center text-[11px] font-bold py-1" style={{ color: "var(--color-neutral-500)" }}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dates.map((date) => {
              const inMonth = isSameMonth(date, monthStart);
              const entry = byDate.get(date);
              const isToday = date === today;
              const waitingLeave = pendingLeaveDays.has(date) && !entry;
              const canAskLeave =
                leaveOn && inMonth && date >= today && isDefaultWorkDay(date) && !offDateSet.has(date) && !entry && !waitingLeave;
              return (
                <div
                  key={date}
                  title={canAskLeave ? "Bấm để xin nghỉ ngày này" : (entry?.note ?? undefined)}
                  role={canAskLeave ? "button" : undefined}
                  tabIndex={canAskLeave ? 0 : undefined}
                  onClick={canAskLeave ? () => setLeaveDraft(date) : undefined}
                  onKeyDown={canAskLeave ? (e) => e.key === "Enter" && setLeaveDraft(date) : undefined}
                  className={`flex flex-col items-center justify-center rounded-[8px] py-2 gap-0.5 ${canAskLeave ? "cursor-pointer hover:bg-[var(--color-surface)]" : ""}`}
                  style={{
                    background: isToday ? "var(--color-accent-100)" : waitingLeave ? "rgba(214,160,40,.12)" : undefined,
                    opacity: inMonth ? 1 : 0.3,
                    minHeight: 54,
                  }}
                >
                  <span className="text-[11px] font-semibold">{Number(date.slice(8, 10))}</span>
                  <span className="text-[10px] font-bold text-center" style={{ lineHeight: 1.3 }}>
                    {waitingLeave ? <span style={{ color: "var(--status-yellow)" }}>Chờ duyệt</span> : dayBadge(date, entry, inMonth)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card elev-sm overflow-x-auto" style={{ opacity: loading ? 0.6 : 1, maxWidth: hasSide ? undefined : 720 }}>
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                <th className="text-left font-bold px-3 py-2" style={{ color: "var(--color-neutral-500)" }}>Ngày</th>
                <th className="text-left font-bold px-3 py-2" style={{ color: "var(--color-neutral-500)" }}>Trạng thái</th>
                <th className="text-left font-bold px-3 py-2" style={{ color: "var(--color-neutral-500)" }}>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {dates
                .filter((date) => isSameMonth(date, monthStart))
                .map((date) => {
                  const entry = byDate.get(date);
                  const isToday = date === today;
                  const dow = new Date(`${date}T00:00:00`).getDay();
                  return (
                    <tr
                      key={date}
                      style={{
                        borderBottom: "1px solid var(--color-neutral-100)",
                        background: isToday ? "var(--color-accent-100)" : undefined,
                      }}
                    >
                      <td className="px-3 py-1.5 font-semibold">
                        {Number(date.slice(8, 10))}/{Number(date.slice(5, 7))} · {WEEKDAYS_SHORT[dow]}
                      </td>
                      <td className="px-3 py-1.5 font-bold">{dayBadge(date, entry, true)}</td>
                      <td className="px-3 py-1.5 truncate" style={{ color: "var(--color-neutral-500)", maxWidth: 240 }}>
                        {entry?.note ?? ""}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--color-neutral-200)" }}>
                <td className="px-3 py-2 font-bold" colSpan={3}>
                  Tổng {stats.present} ngày công · {stats.late} ngày trễ · {stats.absent} ngày vắng · {stats.leave} ngày nghỉ phép
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
