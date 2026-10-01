"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { decideAdvance, listAdvancesForManagers, type AdvancesForManagers } from "@/lib/actions/salaryAdvances";
import { formatVnd } from "@/lib/financeSummary";
import { addMonths } from "@/lib/constants/attendance";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { AdvanceStatusChip } from "@/components/workspace/SalaryAdvancePanel";
import { advancePaid, groupDigits, parseMoney, payMonthLabel, shortDate, shortTime } from "@/lib/salaryAdvance";
import type { Profile, SalaryAdvance } from "@/lib/types";

// Quản trị → Chấm công: staff's Ứng tiền trước requests waiting on a
// Giám đốc, then the ones already decided. Approving picks how much (what
// they asked for, unless changed) and which month's payslip it comes off —
// this month unless that payslip is already paid. A PM sees the same list
// but can't decide (decide_salary_advance() refuses anyone else anyway).
export function SalaryAdvanceApprovals({
  initial,
  profiles,
  currentMonth,
  currentUserId,
  canDecide,
}: {
  initial: AdvancesForManagers;
  profiles: Profile[];
  currentMonth: string;
  currentUserId: string;
  canDecide: boolean;
}) {
  const [data, setData] = useState(initial);
  const [showHistory, setShowHistory] = useState(false);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const profileOf = (id: string): Profile =>
    byId.get(id) ?? { id, email: "", display_name: "Nhân viên", avatar_url: null, role: null, joined_at: null, phone: null, address: null, access_role: "staff", theme: null, created_at: "" };

  // A new request (or one withdrawn) shows up without reloading the page.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel("salary-advances-managers")
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_advances" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          listAdvancesForManagers().then(setData, () => {});
        }, 300);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const { requests, paidMonths } = data;
  const pending = requests.filter((r) => r.status === "pending").sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const decided = requests.filter((r) => r.status !== "pending");
  const approvedThisMonth = requests.filter((r) => r.status === "approved" && r.deduct_month === currentMonth);
  const approvedTotal = approvedThisMonth.reduce((s, r) => s + advancePaid(r), 0);
  const takenBy = (profileId: string) => approvedThisMonth.filter((r) => r.profile_id === profileId).reduce((s, r) => s + advancePaid(r), 0);

  function applyDecision(saved: SalaryAdvance) {
    setData((prev) => ({ ...prev, requests: prev.requests.map((r) => (r.id === saved.id ? saved : r)) }));
  }

  return (
    <section className="card elev-sm flex flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <h2 className="text-sm font-bold flex items-center gap-2">💸 Yêu cầu ứng tiền</h2>
        {pending.length > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: "rgba(214,160,40,.15)", color: "var(--status-yellow)" }}>
            {pending.length} chờ duyệt
          </span>
        )}
        <span className="text-[12.5px] sm:ml-auto tabular-nums" style={{ color: "var(--color-neutral-500)" }}>
          Đã duyệt trừ lương {payMonthLabel(currentMonth)}: <strong style={{ color: "var(--color-text)" }}>{formatVnd(approvedTotal)}</strong>
          {approvedThisMonth.length > 0 && ` · ${new Set(approvedThisMonth.map((r) => r.profile_id)).size} người`}
        </span>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4 pt-3" style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
        {pending.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
            Không có yêu cầu nào đang chờ duyệt.
          </p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
            {pending.map((r) => (
              <PendingCard
                key={r.id}
                request={r}
                profile={profileOf(r.profile_id)}
                takenThisMonth={takenBy(r.profile_id)}
                monthOptions={[currentMonth, addMonths(currentMonth, 1)].filter((m) => !(paidMonths[r.profile_id] ?? []).includes(m))}
                canDecide={canDecide}
                isOwn={r.profile_id === currentUserId}
                onDecided={applyDecision}
              />
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
              {showHistory ? "▲ Ẩn" : "▼ Xem"} {decided.length} yêu cầu đã xử lý
            </button>
            {showHistory && (
              <div className="overflow-x-auto rounded-[10px]" style={{ border: "1px solid var(--color-neutral-100)" }}>
                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse", minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: "var(--color-surface)" }}>
                      {["Nhân viên", "Đề xuất", "Được duyệt", "Ngày gửi", "Kết quả", "Trừ lương", "Ghi chú"].map((h) => (
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
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatVnd(r.amount)}</td>
                          <td className="px-3 py-2 font-bold tabular-nums whitespace-nowrap">{r.status === "approved" ? formatVnd(advancePaid(r)) : "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{shortDate(r.requested_at)}</td>
                          <td className="px-3 py-2">
                            <AdvanceStatusChip status={r.status} />
                          </td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                            {r.status === "approved" && r.deduct_month ? payMonthLabel(r.deduct_month) : "—"}
                          </td>
                          <td className="px-3 py-2" style={{ color: "var(--color-neutral-600)" }}>
                            {[r.reason, r.decision_note && `GĐ: ${r.decision_note}`].filter(Boolean).join(" · ")}
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

function PendingCard({
  request: r,
  profile,
  takenThisMonth,
  monthOptions,
  canDecide,
  isOwn,
  onDecided,
}: {
  request: SalaryAdvance;
  profile: Profile;
  takenThisMonth: number;
  monthOptions: string[];
  canDecide: boolean;
  // The viewer's own request — another Giám đốc decides it.
  isOwn: boolean;
  onDecided: (saved: SalaryAdvance) => void;
}) {
  const [amount, setAmount] = useState(r.amount);
  const [deductMonth, setDeductMonth] = useState(monthOptions[0] ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    const question = approve
      ? `Duyệt ứng ${formatVnd(amount)} cho ${profile.display_name}, trừ vào lương ${payMonthLabel(deductMonth)}?`
      : `Không duyệt yêu cầu ứng ${formatVnd(r.amount)} của ${profile.display_name}?`;
    if (!window.confirm(question)) return;
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      onDecided(await decideAdvance(r.id, { approve, amount, month: deductMonth, note }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa lưu được, thử lại nhé.");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-[12px] p-3.5 flex flex-col gap-3" style={{ background: "var(--color-surface)" }}>
      <div className="flex items-start gap-3">
        <AttendanceAvatar profile={profile} size={38} />
        <div className="flex-1 min-w-0 flex flex-col">
          <span className="font-semibold text-sm truncate">{profile.display_name}</span>
          <span className="text-[11.5px] truncate" style={{ color: "var(--color-neutral-500)" }}>
            Gửi {shortTime(r.requested_at)} · {shortDate(r.requested_at)}
          </span>
        </div>
        <span className="text-lg font-bold tabular-nums whitespace-nowrap">{formatVnd(r.amount)}</span>
      </div>

      {r.reason && <p className="text-[13px] leading-snug">“{r.reason}”</p>}

      <p className="text-[12px] tabular-nums" style={{ color: "var(--color-neutral-600)" }}>
        {takenThisMonth > 0 ? `Đã ứng trừ lương tháng này: ${formatVnd(takenThisMonth)}` : "Tháng này chưa ứng lần nào"}
      </p>

      {isOwn ? (
        <p className="text-[12px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
          Yêu cầu của bạn — chờ Giám đốc khác duyệt.
        </p>
      ) : canDecide ? (
        monthOptions.length === 0 ? (
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--status-red)" }}>
            Bảng lương tháng này và tháng sau của bạn ấy đều đã trả — chưa có tháng nào để trừ.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11.5px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
                Số tiền duyệt
                <input
                  className="input tabular-nums"
                  inputMode="numeric"
                  value={amount ? groupDigits(amount) : ""}
                  onChange={(e) => setAmount(parseMoney(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
                Trừ vào lương
                <select className="input" value={deductMonth} onChange={(e) => setDeductMonth(e.target.value)}>
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {payMonthLabel(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input className="input" maxLength={300} placeholder="Nhắn riêng cho bạn ấy (nếu có)" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && (
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--status-red)" }}>
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary flex-1" disabled={busy !== null || amount <= 0 || !deductMonth} onClick={() => decide(true)}>
                {busy === "approve" ? "Đang duyệt…" : "✓ Duyệt"}
              </button>
              <button type="button" className="btn btn-secondary flex-1" disabled={busy !== null} onClick={() => decide(false)}>
                {busy === "reject" ? "Đang lưu…" : "Không duyệt"}
              </button>
            </div>
          </>
        )
      ) : (
        <p className="text-[12px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
          Chờ Giám đốc duyệt.
        </p>
      )}
    </div>
  );
}
