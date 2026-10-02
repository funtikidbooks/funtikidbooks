"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decideLeave, listLeaveForManagers } from "@/lib/actions/leave";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { LeaveStatusChip } from "@/components/workspace/LeaveRequests";
import { leaveOutcome, leaveRangeLabel, leaveWorkDays } from "@/lib/leave";
import { vnToday } from "@/lib/constants/attendance";
import type { LeaveRequest, Profile } from "@/lib/types";

const shortDateTime = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} · ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// A request's person, or a stand-in if they've since left.
export function profileLookup(profiles: Profile[]): (id: string) => Profile {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return (id) =>
    byId.get(id) ?? { id, email: "", display_name: "Nhân viên", avatar_url: null, role: null, joined_at: null, phone: null, address: null, access_role: "staff", theme: null, created_at: "" };
}

// Quản trị → Chấm công: đơn xin nghỉ waiting on a Giám đốc or PM, then the
// recent decisions. Approving with or without pay writes those work days
// onto the attendance board (lib/actions/leave.ts).
export function LeaveApprovals({ initial, profiles }: { initial: LeaveRequest[]; profiles: Profile[] }) {
  const [requests, setRequests] = useState(initial);
  const [showHistory, setShowHistory] = useState(false);
  const profileOf = profileLookup(profiles);

  // A new request (or one withdrawn, or decided by the other manager) shows up live.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("leave-requests-managers")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          listLeaveForManagers().then(setRequests, () => {});
        }, 300);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const pending = requests.filter((r) => r.status === "pending").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const today = vnToday();
  const upcomingApproved = requests.filter((r) => r.status === "approved" && r.end_date >= today);
  const decided = requests.filter((r) => r.status !== "pending").sort((a, b) => b.start_date.localeCompare(a.start_date));

  function applyDecision(saved: LeaveRequest) {
    setRequests((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
  }

  return (
    <section className="card elev-sm flex flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <h2 className="text-sm font-bold flex items-center gap-2">🗓 Đơn xin nghỉ</h2>
        {pending.length > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: "rgba(214,160,40,.15)", color: "var(--status-yellow)" }}>
            {pending.length} chờ duyệt
          </span>
        )}
        <span className="text-[12.5px] sm:ml-auto" style={{ color: "var(--color-neutral-500)" }}>
          {upcomingApproved.length > 0 ? `Sắp nghỉ: ${upcomingApproved.map((r) => `${profileOf(r.profile_id).display_name} (${leaveRangeLabel(r)})`).join(", ")}` : "Chưa có ai sắp nghỉ"}
        </span>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4 pt-3" style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
        {pending.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
            Không có đơn nào đang chờ duyệt.
          </p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
            {pending.map((r) => (
              <PendingLeave key={r.id} request={r} profile={profileOf(r.profile_id)} onDecided={applyDecision} />
            ))}
          </div>
        )}

        {decided.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-[12.5px] font-semibold w-fit hover:underline"
              style={{ color: "var(--color-neutral-600)" }}
              aria-expanded={showHistory}
            >
              {showHistory ? "▲ Ẩn" : "▼ Xem"} {decided.length} đơn đã xử lý
            </button>
            {showHistory && (
              <div className="overflow-x-auto rounded-[10px]" style={{ border: "1px solid var(--color-neutral-100)" }}>
                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: "var(--color-surface)" }}>
                      {["Nhân viên", "Ngày nghỉ", "Kết quả", "Chấm công", "Ghi chú"].map((h) => (
                        <th key={h} className="text-left font-bold px-3 py-2 whitespace-nowrap" style={{ color: "var(--color-neutral-500)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {decided.map((r) => {
                      const p = profileOf(r.profile_id);
                      return (
                        <tr key={r.id} style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2 font-semibold whitespace-nowrap">
                              <AttendanceAvatar profile={p} size={22} />
                              {p.display_name}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{leaveRangeLabel(r)}</td>
                          <td className="px-3 py-2">
                            <LeaveStatusChip status={r.status} />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.status === "approved" ? leaveOutcome(r) : "—"}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-neutral-600)" }}>
                            {[r.reason, r.decision_note && `QL: ${r.decision_note}`].filter(Boolean).join(" · ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Also in the workspace top bar's "Chờ duyệt" inbox (LeaveTopBar).
export function PendingLeave({ request: r, profile, onDecided }: { request: LeaveRequest; profile: Profile; onDecided: (saved: LeaveRequest) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = leaveWorkDays(r.start_date, r.end_date).length;

  async function decide(key: string, decision: { approve: boolean; paid?: boolean }, question: string) {
    if (!window.confirm(question)) return;
    setBusy(key);
    setError(null);
    try {
      onDecided(await decideLeave(r.id, { ...decision, note }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa lưu được, thử lại nhé.");
      setBusy(null);
    }
  }

  const who = profile.display_name;
  const when = leaveRangeLabel(r);
  return (
    <div className="rounded-[12px] p-3.5 flex flex-col gap-3" style={{ background: "var(--color-surface)" }}>
      <div className="flex items-start gap-3">
        <AttendanceAvatar profile={profile} size={38} />
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="font-semibold text-sm truncate">{who}</span>
          <span className="text-[11.5px] truncate" style={{ color: "var(--color-neutral-500)" }}>
            Gửi {shortDateTime(r.requested_at)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[16px] font-bold">{when}</span>
        {!r.half_day && (
          <span className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
            {days} ngày làm việc
          </span>
        )}
      </div>

      {r.reason && <p className="text-[13px] leading-snug">“{r.reason}”</p>}

      <input className="input" maxLength={300} placeholder="Nhắn riêng (nếu có)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && (
        <p className="text-[12.5px] font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {r.half_day ? (
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={busy !== null}
            onClick={() => decide("half", { approve: true }, `Duyệt cho ${who} nghỉ nửa ngày ${when}? Ngày đó sẽ chấm "Nửa công".`)}
          >
            {busy === "half" ? "Đang duyệt…" : "✓ Duyệt (nửa công)"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary flex-1 whitespace-nowrap"
              disabled={busy !== null}
              onClick={() => decide("paid", { approve: true, paid: true }, `Duyệt cho ${who} nghỉ ${when} — CÓ lương?`)}
            >
              {busy === "paid" ? "Đang duyệt…" : "✓ Duyệt · có lương"}
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1 whitespace-nowrap"
              style={{ background: "var(--color-accent-2-600)" }}
              disabled={busy !== null}
              onClick={() => decide("unpaid", { approve: true, paid: false }, `Duyệt cho ${who} nghỉ ${when} — KHÔNG lương?`)}
            >
              {busy === "unpaid" ? "Đang duyệt…" : "✓ Duyệt · không lương"}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-secondary flex-1 whitespace-nowrap"
          disabled={busy !== null}
          onClick={() => decide("reject", { approve: false }, `Không duyệt đơn xin nghỉ ${when} của ${who}?`)}
        >
          {busy === "reject" ? "Đang lưu…" : "Không duyệt"}
        </button>
      </div>
    </div>
  );
}
