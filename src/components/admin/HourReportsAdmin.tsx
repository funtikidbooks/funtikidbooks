"use client";

import { useMemo, useState } from "react";
import { listHourReports, listUnreviewedHourReports, markHourReportReviewed } from "@/lib/actions/hourReports";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { MONTH_LABELS, addMonths, firstOfMonth, formatDayLabel, vnToday } from "@/lib/constants/attendance";
import type { HourReport, MeetingChannelPublic, Profile } from "@/lib/types";

export function HourReportsAdmin({
  initialReports,
  initialUnreviewedCount,
  channels,
  staff,
}: {
  initialReports: HourReport[];
  initialUnreviewedCount: number;
  channels: MeetingChannelPublic[];
  staff: Profile[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [unreviewedCount, setUnreviewedCount] = useState(initialUnreviewedCount);
  const [monthStart, setMonthStart] = useState(firstOfMonth(vnToday()));
  const [viewMode, setViewMode] = useState<"month" | "unreviewed">("month");
  const [loading, setLoading] = useState(false);
  const [projectFilter, setProjectFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");

  const d = new Date(`${monthStart}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
  const isCurrentMonth = monthStart === firstOfMonth(vnToday());

  const projects = channels.filter((c) => !c.is_general && !c.is_food_room);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const staffById = useMemo(() => new Map(staff.map((p) => [p.id, p])), [staff]);

  async function goToMonth(newStart: string) {
    setMonthStart(newStart);
    setViewMode("month");
    setLoading(true);
    try {
      setReports(await listHourReports({ monthStart: newStart }));
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  async function showUnreviewedOnly() {
    setViewMode("unreviewed");
    setLoading(true);
    try {
      setReports(await listUnreviewedHourReports());
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleReviewed(report: HourReport, reviewed: boolean) {
    // Optimistic — a director checking a box expects it to flip
    // immediately, not wait on a round-trip.
    setReports((prev) =>
      viewMode === "unreviewed" && reviewed
        ? prev.filter((r) => r.id !== report.id)
        : prev.map((r) => (r.id === report.id ? { ...r, reviewed_at: reviewed ? new Date().toISOString() : null } : r)),
    );
    setUnreviewedCount((prev) => Math.max(0, prev + (reviewed ? -1 : 1)));
    try {
      await markHourReportReviewed(report.id, reviewed);
    } catch {
      // Revert on failure — same shape as FinanceBoard's handleToggleInstallment.
      setReports((prev) => {
        const stillThere = prev.some((r) => r.id === report.id);
        if (stillThere) return prev.map((r) => (r.id === report.id ? { ...r, reviewed_at: report.reviewed_at } : r));
        return [...prev, report];
      });
      setUnreviewedCount((prev) => Math.max(0, prev + (reviewed ? 1 : -1)));
    }
  }

  const filtered = reports.filter(
    (r) =>
      (projectFilter === "all" || r.project_channel_id === projectFilter) &&
      (staffFilter === "all" || r.profile_id === staffFilter),
  );
  const totalHours = filtered.reduce((sum, r) => sum + r.hours, 0);

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
      <div>
        <h1 className="text-xl">Báo cáo giờ</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
          Tổng hợp từ nút &quot;📊 Báo cáo giờ&quot; trong khung chat — tick &quot;Đã xem&quot; sau khi kiểm tra để không bị sót.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => goToMonth(monthStart)}
          className="btn btn-sm"
          style={{
            background: viewMode === "month" ? "var(--color-accent-500)" : "var(--color-surface)",
            color: viewMode === "month" ? "#fff" : "var(--color-text)",
          }}
        >
          Theo tháng
        </button>
        <button
          type="button"
          onClick={showUnreviewedOnly}
          className="btn btn-sm flex items-center gap-1.5"
          style={{
            background: viewMode === "unreviewed" ? "var(--color-accent-500)" : "var(--color-surface)",
            color: viewMode === "unreviewed" ? "#fff" : "var(--color-text)",
          }}
        >
          Chưa xem
          {unreviewedCount > 0 && (
            <span
              className="rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                background: viewMode === "unreviewed" ? "#fff" : "var(--status-red)",
                color: viewMode === "unreviewed" ? "var(--color-accent-700)" : "#fff",
              }}
            >
              {unreviewedCount}
            </span>
          )}
        </button>

        {viewMode === "month" && (
          <>
            <span className="w-px h-5" style={{ background: "var(--color-neutral-200)" }} />
            <button type="button" onClick={() => goToMonth(addMonths(monthStart, -1))} className="btn-icon" aria-label="Tháng trước">
              ←
            </button>
            <span className="text-sm font-bold">{monthLabel}</span>
            <button type="button" onClick={() => goToMonth(addMonths(monthStart, 1))} className="btn-icon" aria-label="Tháng sau">
              →
            </button>
            {!isCurrentMonth && (
              <button type="button" onClick={() => goToMonth(firstOfMonth(vnToday()))} className="btn btn-ghost btn-sm">
                Tháng này
              </button>
            )}
          </>
        )}

        <select className="input text-sm" style={{ width: "auto" }} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">Tất cả dự án</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>

        <select className="input text-sm" style={{ width: "auto" }} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
          <option value="all">Tất cả nhân viên</option>
          {staff.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
      </div>

      {viewMode === "month" && (
        <div className="card p-4 flex flex-col gap-1 w-fit" style={{ background: "var(--color-accent-2-100)" }}>
          <span className="text-[11px] font-bold" style={{ color: "var(--color-accent-2-800)" }}>
            TỔNG GIỜ
          </span>
          <span className="text-xl font-bold" style={{ color: "var(--color-accent-2-800)" }}>
            {totalHours} tiếng
          </span>
        </div>
      )}

      <div style={{ opacity: loading ? 0.6 : 1 }} className="card overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              {["Đã xem", "Ngày", "Nhân viên", "Dự án", "Giờ", "Ghi chú"].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
                  {viewMode === "unreviewed" ? "Đã xem hết, không sót cái nào." : "Chưa có báo cáo giờ nào trong tháng này."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const person = staffById.get(r.profile_id);
                const project = r.project_channel_id ? projectById.get(r.project_channel_id) : null;
                const reviewed = !!r.reviewed_at;
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: "1px solid var(--color-neutral-100)",
                      background: reviewed ? "transparent" : "var(--color-accent-100)",
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(e) => toggleReviewed(r, e.target.checked)}
                        aria-label="Đã xem"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDayLabel(r.work_date)}</td>
                    <td className="px-3 py-2">
                      {person ? (
                        <span className="flex items-center gap-2">
                          <AttendanceAvatar profile={person} size={22} />
                          <span className="truncate max-w-[140px]">{person.display_name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 truncate max-w-[160px]">{project ? `${project.icon} ${project.name}` : "—"}</td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap">{r.hours}</td>
                    <td className="px-3 py-2" style={{ color: "var(--color-neutral-600)" }}>
                      {r.note || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
