"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { submitHourReport } from "@/lib/actions/hourReports";
import { vnToday } from "@/lib/constants/attendance";
import type { MeetingChannelPublic } from "@/lib/types";

// Quick structured alternative to typing a free-text hour report straight
// into the composer — still posts into whichever room this was opened from
// (almost always "Chung") so nothing changes about how the feed reads, but
// also saves a row a PM can filter/tally on the "Báo cáo giờ" admin page.
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
  const [workDate, setWorkDate] = useState(vnToday());
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const project = projects.find((p) => p.id === projectChannelId);
    if (!project) {
      setError("Chọn một dự án.");
      return;
    }
    const parsedHours = Number(hours.replace(",", "."));
    if (!(parsedHours > 0 && parsedHours <= 24)) {
      setError("Nhập số giờ hợp lệ (0 – 24).");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await submitHourReport({
        postChannelId,
        projectChannelId: project.id,
        projectName: project.name,
        workDate,
        hours: parsedHours,
        note,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={380}>
      <form onSubmit={submit} className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg">📊 Báo cáo giờ</h2>
          <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
            Gửi vào khung chat này, kèm lưu lại để PM lọc/tổng hợp.
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

        <div className="flex gap-3">
          <div className="field flex-1">
            <label htmlFor="hr-date">Ngày</label>
            <input id="hr-date" type="date" className="input" value={workDate} onChange={(e) => setWorkDate(e.target.value)} max={vnToday()} />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label htmlFor="hr-hours">Số giờ</label>
            <input
              id="hr-hours"
              className="input"
              inputMode="decimal"
              placeholder="vd. 5.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="hr-note">Nội dung công việc</label>
          <textarea
            id="hr-note"
            className="input resize-none"
            rows={3}
            placeholder="vd. sketch chapter 9 (tranh 1,2,4)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

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
            {saving ? "Đang gửi…" : "Gửi báo cáo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
