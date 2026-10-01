"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cancelMyAdvance, requestAdvance } from "@/lib/actions/salaryAdvances";
import { formatVnd } from "@/lib/financeSummary";
import {
  ADVANCE_MIN,
  ADVANCE_STATUS,
  SALARY_ADVANCE_SELECT,
  advancePaid,
  groupDigits,
  parseMoney,
  payMonthLabel,
  shortDate,
  toSalaryAdvance,
} from "@/lib/salaryAdvance";
import type { SalaryAdvance, SalaryAdvanceStatus } from "@/lib/types";

// Ứng tiền trước on a staff member's own Chấm công page: ask for part of
// the month's pay early; a Giám đốc approves it in Quản trị → Chấm công
// and it comes off that month's payslip as an "Ứng lương" line.
//
// Money is private: amounts stay hidden ("••••") until the person taps the
// eye — this page is often open in the office — and nobody but them and
// a Giám đốc ever sees these requests (not a PM either).

export function AdvanceStatusChip({ status }: { status: SalaryAdvanceStatus }) {
  const st = ADVANCE_STATUS[status];
  return (
    <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap" style={{ background: st.bg, color: st.color }}>
      {st.label}
    </span>
  );
}

const QUICK = [1_000_000, 2_000_000, 3_000_000, 5_000_000];
const SHOW_KEY = "funti-advance-show-amounts";

export function SalaryAdvancePanel({
  monthStart,
  currentUserId,
  initialRequests,
}: {
  // The current month — what a new advance comes off by default.
  monthStart: string;
  currentUserId: string;
  initialRequests: SalaryAdvance[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  // Folded on phones/iPad like the payslip above it (the calendar is what
  // people come here for), unless something was decided in the last few
  // days; always open in its own column on a wide screen.
  const [open, setOpen] = useState(() =>
    initialRequests.some((r) => r.decided_at && Date.now() - new Date(r.decided_at).getTime() < 3 * 86400e3),
  );
  const [show, setShow] = useState(false);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a per-device preference after hydration
      setShow(localStorage.getItem(SHOW_KEY) === "1");
    } catch {
      // private mode — stays hidden
    }
  }, []);
  function toggleShow() {
    setShow((v) => {
      try {
        localStorage.setItem(SHOW_KEY, v ? "0" : "1");
      } catch {
        // not remembered, still works
      }
      return !v;
    });
  }

  // A Giám đốc's decision shows up here right away.
  useEffect(() => {
    const supabase = createClient();
    async function reload() {
      const { data } = await supabase
        .from("salary_advances")
        .select(SALARY_ADVANCE_SELECT)
        .eq("profile_id", currentUserId)
        .order("requested_at", { ascending: false })
        .limit(30);
      if (data) setRequests(data.map(toSalaryAdvance));
    }
    const channel = supabase
      .channel(`salary-advances-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_advances", filter: `profile_id=eq.${currentUserId}` }, () => void reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const money = (n: number) => (show ? formatVnd(n) : "•••••• ₫");
  const taken = requests.filter((r) => r.status === "approved" && r.deduct_month === monthStart).reduce((s, r) => s + advancePaid(r), 0);
  const pending = requests.filter((r) => r.status === "pending");
  const waiting = pending.reduce((s, r) => s + r.amount, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount < ADVANCE_MIN) return setError("Số tiền ứng tối thiểu là 1.000.000 ₫.");
    setBusy(true);
    setError(null);
    try {
      const saved = await requestAdvance(amount, reason);
      setRequests((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
      setAmount(0);
      setReason("");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa gửi được yêu cầu, bạn thử lại nhé.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("Huỷ yêu cầu ứng tiền này?")) return;
    try {
      const saved = await cancelMyAdvance(id);
      setRequests((prev) => prev.map((r) => (r.id === id ? saved : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chưa huỷ được, thử lại nhé.");
    }
  }

  return (
    <section className="card elev-sm min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left xl:cursor-default"
        aria-expanded={open}
      >
        <span className="text-sm font-bold flex items-center gap-2">💸 Ứng tiền trước</span>
        <span className="flex items-center gap-2 min-w-0">
          {pending.length > 0 && <AdvanceStatusChip status="pending" />}
          <span aria-hidden className="xl:hidden" style={{ color: "var(--color-neutral-400)" }}>
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>

      <div className={`${open ? "flex" : "hidden"} xl:flex flex-col gap-4 px-4 pb-4 pt-3`} style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--color-neutral-600)" }}>
          Cần ứng trước một phần lương? Bạn cứ gửi số tiền mình cần, Giám đốc sẽ xem và trả lời riêng cho bạn. Khoản được duyệt tự trừ vào bảng lương tháng đó.
        </p>
        <p className="text-[12px] rounded-[10px] px-3 py-2 flex gap-2" style={{ background: "var(--color-surface)", color: "var(--color-neutral-600)" }}>
          <span aria-hidden>🔒</span>
          <span>Riêng tư: chỉ bạn và Giám đốc thấy các yêu cầu này, đồng nghiệp khác không thấy.</span>
        </p>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
              Tháng {Number(monthStart.slice(5, 7))}
            </span>
            <button type="button" onClick={toggleShow} className="text-[12px] font-semibold hover:underline" style={{ color: "var(--color-neutral-600)" }}>
              {show ? "🙈 Ẩn số tiền" : "👁 Hiện số tiền"}
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            {[
              { k: "Đã ứng", v: money(taken), c: "var(--status-green)" },
              { k: "Đang chờ duyệt", v: money(waiting), c: "var(--status-yellow)" },
            ].map((s) => (
              <div key={s.k} className="rounded-[10px] px-3 py-2 flex flex-col gap-0.5 min-w-0" style={{ background: "var(--color-surface)" }}>
                <dt className="text-[11px] font-semibold" style={{ color: "var(--color-neutral-500)" }}>
                  {s.k}
                </dt>
                <dd className="text-[14px] font-bold tabular-nums leading-tight" style={{ color: s.c }}>
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="field">
            <label htmlFor="advance-amount">Số tiền bạn cần ứng</label>
            <input
              id="advance-amount"
              className="input tabular-nums"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Tối thiểu 1.000.000"
              value={amount ? groupDigits(amount) : ""}
              onChange={(e) => {
                setAmount(parseMoney(e.target.value));
                setSent(false);
              }}
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {QUICK.map((q) => {
                const on = amount === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setAmount(q);
                      setSent(false);
                    }}
                    className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                    style={{
                      background: on ? "var(--color-accent-500)" : "var(--color-panel)",
                      color: on ? "#fff" : "var(--color-text)",
                      boxShadow: on ? "none" : "inset 0 0 0 1px var(--color-neutral-200)",
                    }}
                  >
                    {q / 1_000_000} triệu
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field">
            <label htmlFor="advance-reason">Lý do (không bắt buộc)</label>
            <input
              id="advance-reason"
              className="input"
              maxLength={300}
              autoComplete="off"
              placeholder="Ghi nếu bạn muốn"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
          {sent && !error && (
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--status-green)" }}>
              Đã gửi. Có kết quả, bạn sẽ nhận được thông báo.
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={busy || amount === 0}>
            {busy ? "Đang gửi…" : amount >= ADVANCE_MIN ? `Gửi yêu cầu ứng ${formatVnd(amount)}` : "Gửi yêu cầu"}
          </button>
        </form>

        {requests.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-[11.5px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
              Yêu cầu của bạn
            </h3>
            <ul className="flex flex-col gap-2">
              {requests.map((r) => {
                const changed = r.status === "approved" && r.approved_amount != null && r.approved_amount !== r.amount;
                return (
                  <li key={r.id} className="rounded-[10px] px-3 py-2.5 flex flex-col gap-1" style={{ background: "var(--color-surface)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-bold tabular-nums">{money(r.status === "approved" ? advancePaid(r) : r.amount)}</span>
                      <AdvanceStatusChip status={r.status} />
                    </div>
                    <span className="text-[12.5px]" style={{ color: "var(--color-neutral-600)" }}>
                      Gửi {shortDate(r.requested_at)}
                      {changed ? ` · bạn đề xuất ${money(r.amount)}` : ""}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </span>
                    {r.status === "approved" && r.deduct_month && (
                      <span className="text-[12.5px] font-semibold" style={{ color: "var(--status-green)" }}>
                        Trừ vào lương {payMonthLabel(r.deduct_month)}
                        {r.decided_at ? ` · duyệt ${shortDate(r.decided_at)}` : ""}
                      </span>
                    )}
                    {r.decision_note && (
                      <span className="text-[12.5px]" style={{ color: "var(--color-neutral-600)" }}>
                        Giám đốc nhắn: {r.decision_note}
                      </span>
                    )}
                    {r.status === "pending" && (
                      <button
                        type="button"
                        className="text-[12.5px] font-semibold w-fit hover:underline"
                        style={{ color: "var(--color-neutral-500)" }}
                        onClick={() => cancel(r.id)}
                      >
                        Huỷ yêu cầu
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
