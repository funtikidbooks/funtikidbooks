"use client";

import { useMemo, useState } from "react";
import { listHourReports } from "@/lib/actions/hourReports";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { MONTH_LABELS, addMonths, firstOfMonth, formatDayLabel, vnToday } from "@/lib/constants/attendance";
import type { HourReport, MeetingChannelPublic, Profile } from "@/lib/types";

export function HourReportsAdmin({
  initialReports,
  channels,
  staff,
}: {
  initialReports: HourReport[];
  channels: MeetingChannelPublic[];
  staff: Profile[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [monthStart, setMonthStart] = useState(firstOfMonth(vnToday()));
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
    setLoading(true);
    try {
      setReports(await listHourReports({ monthStart: newStart }));
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
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
          Tổng hợp từ nút &quot;📊 Báo cáo giờ&quot; trong khung chat — lọc theo dự án/nhân viên để xem tổng giờ.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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

      <div className="card p-4 flex flex-col gap-1 w-fit" style={{ background: "var(--color-accent-2-100)" }}>
        <span className="text-[11px] font-bold" style={{ color: "var(--color-accent-2-800)" }}>
          TỔNG GIỜ
        </span>
        <span className="text-xl font-bold" style={{ color: "var(--color-accent-2-800)" }}>
          {totalHours} tiếng
        </span>
      </div>

      <div style={{ opacity: loading ? 0.6 : 1 }} className="card overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              {["Ngày", "Nhân viên", "Dự án", "Giờ", "Ghi chú"].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color: "var(--color-neutral-500)" }}>
                  Chưa có báo cáo giờ nào trong tháng này.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const person = staffById.get(r.profile_id);
                const project = r.project_channel_id ? projectById.get(r.project_channel_id) : null;
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--color-neutral-100)" }}>
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
