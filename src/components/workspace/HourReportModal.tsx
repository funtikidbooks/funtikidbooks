"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { submitHourReports } from "@/lib/actions/hourReports";
import { vnToday } from "@/lib/constants/attendance";
import type { MeetingChannelPublic } from "@/lib/types";

type EntryRow = { id: string; workDate: string; hours: string; note: string };

function newRow(): EntryRow {
  return { id: crypto.randomUUID(), workDate: vnToday(), hours: "", note: "" };
}

// Quick structured alternative to typing a free-text hour report straight
// into the composer — still posts into whichever room this was opened from
// (almost always "Chung") so nothing changes about how the feed reads, but
// also saves a row per day a PM can filter/tally on the "Báo cáo giờ" admin
// page. Several rows ("+ Thêm ngày") for someone catching up a few days at
// once go out as one combined chat message, same as writing it by hand.
// The posted message shows up on its own via the room's existing realtime
// subscription — same path a message sent from another tab/device takes —
// so there's no optimistic-insert plumbing needed here.
export function HourReportModal({
  channels,
  postChannelId,
  onClose,
}: {
  channels: MeetingChannelPublic[];
  postChannelId: string;
  onClose: () => void;
}) {
  const projects = channels.filter((c) => !c.is_general && !c.is_food_room);
  const [projectChannelId, setProjectChannelId] = useState(projects[0]?.id ?? "");
  const [rows, setRows] = useState<EntryRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const project = projects.find((p) => p.id === projectChannelId);
    if (!project) {
      setError("Chọn một dự án.");
      return;
    }

    const entries: { workDate: string; hours: number; note: string }[] = [];
    for (const r of rows) {
      const parsedHours = Number(r.hours.replace(",", "."));
      if (!(parsedHours > 0 && parsedHours <= 24)) {
        setError(`Nhập số giờ hợp lệ (0 – 24) cho ngày ${r.workDate}.`);
        return;
      }
      entries.push({ workDate: r.workDate, hours: parsedHours, note: r.note });
    }

    setSaving(true);
    setError(null);
    try {
      await submitHourReports({
        postChannelId,
        projectChannelId: project.id,
        projectName: project.name,
        entries,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg">📊 Báo cáo giờ</h2>
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Gửi vào khung chat này, kèm lưu lại để PM lọc/tổng hợp. Báo nhiều ngày cùng lúc thì bấm &quot;+ Thêm ngày&quot;.
          </p>
        </div>

        {projects.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Chưa có phòng dự án nào để chọn.
          </p>
        ) : (
          <div className="field">
            <label htmlFor="hr-project">Dự án</label>
            <select id="hr-project" className="input" value={projectChannelId} onChange={(e) => setProjectChannelId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <div key={r.id} className="flex flex-col gap-2 p-3 rounded-[8px]" style={{ background: "var(--color-surface)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold" style={{ color: "var(--color-neutral-500)" }}>
                  NGÀY {i + 1}
                </span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((row) => row.id !== r.id))}
                    className="text-[11px] font-semibold underline"
                    style={{ color: "var(--color-neutral-500)" }}
                  >
                    Bỏ ngày này
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <div className="field flex-1">
                  <label htmlFor={`hr-date-${r.id}`}>Ngày</label>
                  <input
                    id={`hr-date-${r.id}`}
                    type="date"
                    className="input"
                    value={r.workDate}
                    onChange={(e) => updateRow(r.id, { workDate: e.target.value })}
                    max={vnToday()}
                  />
                </div>
                <div className="field" style={{ width: 110 }}>
                  <label htmlFor={`hr-hours-${r.id}`}>Số giờ</label>
                  <input
                    id={`hr-hours-${r.id}`}
                    className="input"
                    inputMode="decimal"
                    placeholder="vd. 5.5"
                    value={r.hours}
                    onChange={(e) => updateRow(r.id, { hours: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor={`hr-note-${r.id}`}>Nội dung công việc</label>
                <input
                  id={`hr-note-${r.id}`}
                  className="input"
                  placeholder="vd. sketch chapter 9 (tranh 1,2,4)"
                  value={r.note}
                  onChange={(e) => updateRow(r.id, { note: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, newRow()])}
          className="btn btn-ghost btn-sm w-fit"
        >
          + Thêm ngày
        </button>

        {error && (
          <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || projects.length === 0}>
            {saving ? "Đang gửi…" : rows.length > 1 ? `Gửi báo cáo (${rows.length} ngày)` : "Gửi báo cáo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
