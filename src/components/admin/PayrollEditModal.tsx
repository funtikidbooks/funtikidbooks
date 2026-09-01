"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { getMonthAttendance } from "@/lib/actions/attendance";
import { getStaffBankInfo } from "@/lib/actions/admin";
import {
  getStaffSalary,
  listPayrollFeedback,
  sendPayrollEmail,
  updatePayrollFeedbackStatus,
  upsertPayroll,
  upsertStaffSalary,
} from "@/lib/actions/payroll";
import { MONTH_LABELS, summarizeAttendance } from "@/lib/constants/attendance";
import { bankColor, formatAccountNumber } from "@/lib/bankDisplay";
import type { PayrollFeedback, PayrollFeedbackStatus, PayrollItem, PayrollRecord, PayrollStatus, Profile, StaffBankInfo } from "@/lib/types";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

type ItemDraft = { label: string; kind: "add" | "subtract"; amount: number | "" };

function itemsToDraft(items: PayrollItem[]): ItemDraft[] {
  return items.map((it) => ({
    label: it.label,
    kind: it.amount < 0 ? "subtract" : "add",
    amount: Math.abs(it.amount),
  }));
}

export function PayrollEditModal({
  profile,
  month,
  record,
  onClose,
  onSaved,
}: {
  profile: Profile;
  month: string;
  record: PayrollRecord | undefined;
  onClose: () => void;
  onSaved: (record: PayrollRecord) => void;
}) {
  const [workDays, setWorkDays] = useState<number | "">(record?.work_days ?? "");
  const [items, setItems] = useState<ItemDraft[]>(record ? itemsToDraft(record.items) : []);
  const [status, setStatus] = useState<PayrollStatus>(record?.status ?? "draft");
  const [note, setNote] = useState(record?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0, leave: 0 });
  const [lateRate, setLateRate] = useState<number | "">("");

  const [salaryLoading, setSalaryLoading] = useState(true);
  const [monthlySalary, setMonthlySalary] = useState<number | "">("");
  const [standardWorkDays, setStandardWorkDays] = useState<number | "">(24);
  const [savingSalary, setSavingSalary] = useState(false);
  const [workDaysTouched, setWorkDaysTouched] = useState(false);

  const [feedback, setFeedback] = useState<PayrollFeedback[]>([]);
  const [resolvingFeedbackId, setResolvingFeedbackId] = useState<string | null>(null);

  const [bankInfo, setBankInfo] = useState<StaffBankInfo | null>(null);

  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function handleSendEmail() {
    if (!record || sendingEmail) return;
    setSendingEmail(true);
    setError(null);
    try {
      await sendPayrollEmail(record.id);
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi email.");
    } finally {
      setSendingEmail(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const info = await getStaffBankInfo(profile.id).catch(() => null);
      if (!cancelled) setBankInfo(info);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  useEffect(() => {
    if (!record) return;
    let cancelled = false;
    listPayrollFeedback(record.id)
      .then((items) => !cancelled && setFeedback(items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [record]);

  async function handleResolveFeedback(feedbackId: string, nextStatus: PayrollFeedbackStatus) {
    setResolvingFeedbackId(feedbackId);
    try {
      const updated = await updatePayrollFeedbackStatus(feedbackId, nextStatus);
      setFeedback((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch {
      // best effort — the button staying clickable is enough of a signal to retry
    } finally {
      setResolvingFeedbackId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getMonthAttendance(profile.id, month)
      .then((entries) => !cancelled && setStats(summarizeAttendance(entries)))
      .catch(() => {})
      .finally(() => !cancelled && setStatsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [profile.id, month]);

  // Keeps "CHẤM CÔNG THÁNG NÀY" (and, through it, "Số ngày đi làm" below)
  // live while the modal is open — an auto check-in landing, or another
  // admin session editing this same employee's attendance, shows up here
  // immediately instead of only on the next time this modal is reopened.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`payroll-modal-attendance-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `profile_id=eq.${profile.id}` },
        () => {
          getMonthAttendance(profile.id, month)
            .then((entries) => setStats(summarizeAttendance(entries)))
            .catch(() => {});
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id, month]);

  useEffect(() => {
    let cancelled = false;
    getStaffSalary(profile.id)
      .then((salary) => {
        if (cancelled) return;
        if (salary) {
          setMonthlySalary(salary.monthly_salary);
          setStandardWorkDays(salary.standard_work_days);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setSalaryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  // Lương/ngày = lương tháng ÷ số ngày công chuẩn, làm tròn đến đồng gần
  // nhất — VNĐ không có đơn vị lẻ hơn đồng, nên đây là mức chính xác nhất
  // có thể, không làm tròn thô đến nghìn đồng như trước (làm lệch tổng
  // lương tính ra tới vài trăm đồng mỗi ngày công, nhân lên cả tháng).
  const dailyRate = useMemo(() => {
    const salary = Number(monthlySalary) || 0;
    const days = Number(standardWorkDays) || 0;
    if (!salary || !days) return 0;
    return Math.round(salary / days);
  }, [monthlySalary, standardWorkDays]);

  // "Số ngày đi làm" tracks the live attendance count — including after
  // the modal is already open, so it stays right if attendance changes
  // while it's up — right up until the director actually types a
  // different value themselves in this session; that override then
  // sticks. Deferred a frame rather than set synchronously here, so this
  // stays a "reacting to an external system" update, not a render
  // triggered straight from the effect body.
  useEffect(() => {
    if (workDaysTouched || statsLoading) return;
    const frame = requestAnimationFrame(() => setWorkDays(stats.present));
    return () => cancelAnimationFrame(frame);
  }, [workDaysTouched, statsLoading, stats.present]);

  async function saveSalarySettings() {
    setSavingSalary(true);
    try {
      await upsertStaffSalary(profile.id, Number(monthlySalary) || 0, Number(standardWorkDays) || 24);
    } catch {
      // best effort — the fields keep whatever the director typed either way
    } finally {
      setSavingSalary(false);
    }
  }

  // Base pay is derived, not typed — lương/ngày × số ngày đi làm — so it
  // can never silently drift from what the director actually entered for
  // rate and days.
  const computedBase = useMemo(() => dailyRate * (Number(workDays) || 0), [dailyRate, workDays]);

  const total = useMemo(() => {
    const itemsTotal = items.reduce((sum, it) => {
      const amt = Number(it.amount) || 0;
      return sum + (it.kind === "subtract" ? -amt : amt);
    }, 0);
    return computedBase + itemsTotal;
  }, [computedBase, items]);

  function updateItem(i: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function applyLateDeduction() {
    if (stats.late === 0 || Number(lateRate) <= 0) return;
    setItems((prev) => [...prev, { label: `Đi trễ ${stats.late} lần`, kind: "subtract", amount: Number(lateRate) * stats.late }]);
    setLateRate("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanItems: PayrollItem[] = items
      .filter((it) => it.label.trim())
      .map((it) => ({
        label: it.label.trim(),
        amount: (it.kind === "subtract" ? -1 : 1) * (Number(it.amount) || 0),
      }));

    setSaving(true);
    setError(null);
    try {
      const saved = await upsertPayroll({
        profileId: profile.id,
        month,
        baseSalary: computedBase,
        workDays: workDays === "" ? null : Number(workDays),
        items: cleanItems,
        status,
        note,
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  const d = new Date(`${month}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;

  return (
    <Modal onClose={onClose} maxWidth={640}>
      <form onSubmit={submit} className="flex flex-col">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <AttendanceAvatar profile={profile} size={36} />
          <div className="flex-1">
            <h2 className="text-lg">{profile.display_name}</h2>
            <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
              Bảng lương {monthLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 px-6 py-6 max-h-[70vh] overflow-y-auto">
          {bankInfo && (bankInfo.bank_name || bankInfo.account_number) && (
            <div className="rounded-[10px] p-3 flex items-center gap-3" style={{ background: bankColor(bankInfo.bank_name) }}>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[11px] font-bold text-white/90">{bankInfo.bank_name || "Ngân hàng"}</span>
                <span className="text-sm font-bold text-white font-mono tracking-wide">
                  {bankInfo.account_number ? formatAccountNumber(bankInfo.account_number) : "—"}
                </span>
                {bankInfo.account_holder && <span className="text-[11px] text-white/80">{bankInfo.account_holder}</span>}
              </div>
              {bankInfo.qr_image_url && (
                <a href={bankInfo.qr_image_url} target="_blank" rel="noreferrer" className="flex-none" title="Xem mã QR cỡ lớn">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bankInfo.qr_image_url}
                    alt="Mã QR chuyển khoản"
                    className="rounded-[8px] object-cover"
                    style={{ width: 84, height: 84, background: "#fff" }}
                  />
                </a>
              )}
            </div>
          )}

          {feedback.length > 0 && (
            <div className="card p-3 flex flex-col gap-2.5" style={{ background: "rgba(192,82,79,0.08)", border: "1px solid rgba(192,82,79,0.3)" }}>
              <span className="text-xs font-bold" style={{ color: "var(--status-red)" }}>
                PHẢN HỒI TỪ {profile.display_name.toUpperCase()}
              </span>
              {feedback.map((f) => (
                <div key={f.id} className="flex flex-col gap-1.5">
                  <p className="text-sm whitespace-pre-wrap">{f.message}</p>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                      {new Date(f.created_at).toLocaleString("vi-VN")}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleResolveFeedback(f.id, "approved")}
                        disabled={resolvingFeedbackId === f.id}
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                        style={{
                          background: f.status === "approved" ? "var(--status-green)" : "var(--color-panel)",
                          color: f.status === "approved" ? "#fff" : "var(--color-text)",
                          border: `1px solid ${f.status === "approved" ? "var(--status-green)" : "var(--color-neutral-200)"}`,
                        }}
                      >
                        ✓ Duyệt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveFeedback(f.id, "rejected")}
                        disabled={resolvingFeedbackId === f.id}
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                        style={{
                          background: f.status === "rejected" ? "var(--status-red)" : "var(--color-panel)",
                          color: f.status === "rejected" ? "#fff" : "var(--color-text)",
                          border: `1px solid ${f.status === "rejected" ? "var(--status-red)" : "var(--color-neutral-200)"}`,
                        }}
                      >
                        ✕ Từ chối
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card p-3 flex flex-col gap-2" style={{ background: "var(--color-accent-100)" }}>
            <span className="text-xs font-bold" style={{ color: "var(--color-accent-700)" }}>
              LƯƠNG CỐ ĐỊNH / THÁNG
            </span>
            <div className="flex flex-wrap items-end gap-2">
              <div className="field" style={{ maxWidth: 170 }}>
                <label className="text-[11px]">Lương / tháng</label>
                <input
                  type="number"
                  min={0}
                  className="input"
                  style={{ padding: "5px 8px", fontSize: 12 }}
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ maxWidth: 150 }}>
                <label className="text-[11px]">Số ngày công chuẩn</label>
                <input
                  type="number"
                  min={1}
                  className="input"
                  style={{ padding: "5px 8px", fontSize: 12 }}
                  value={standardWorkDays}
                  onChange={(e) => setStandardWorkDays(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <button type="button" onClick={saveSalarySettings} className="btn btn-secondary btn-sm" disabled={savingSalary || salaryLoading}>
                {savingSalary ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
            {dailyRate > 0 && (
              <span className="text-xs" style={{ color: "var(--color-accent-700)" }}>
                ≈ {formatVnd(dailyRate)} / ngày ({Number(standardWorkDays) || 24} ngày công/tháng)
              </span>
            )}
          </div>

          <div className="card p-3 flex flex-col gap-2" style={{ background: "var(--color-surface)" }}>
            <span className="text-xs font-bold" style={{ color: "var(--color-neutral-500)" }}>
              CHẤM CÔNG THÁNG NÀY
            </span>
            {statsLoading ? (
              <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                Đang tải…
              </span>
            ) : (
              <>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>
                    Ngày công: <strong>{stats.present}</strong>
                  </span>
                  <span style={{ color: "var(--status-yellow)" }}>
                    Trễ: <strong>{stats.late}</strong>
                  </span>
                  <span style={{ color: "var(--status-red)" }}>
                    Vắng: <strong>{stats.absent}</strong>
                  </span>
                  <span style={{ color: "var(--color-neutral-600)" }}>
                    Nghỉ phép: <strong>{stats.leave}</strong>
                  </span>
                </div>
                {stats.late > 0 && (
                  <div className="flex flex-wrap items-end gap-2 mt-1">
                    <div className="field" style={{ maxWidth: 160 }}>
                      <label className="text-[11px]">Trừ / lần trễ</label>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        style={{ padding: "5px 8px", fontSize: 12 }}
                        value={lateRate}
                        onChange={(e) => setLateRate(e.target.value === "" ? "" : Number(e.target.value))}
                      />
                    </div>
                    <button type="button" onClick={applyLateDeduction} className="btn btn-secondary btn-sm">
                      + Thêm khấu trừ đi trễ
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card p-3 flex flex-col gap-2" style={{ background: "var(--color-accent-2-100)" }}>
            <span className="text-xs font-bold" style={{ color: "var(--color-accent-2-800)" }}>
              LƯƠNG THEO NGÀY CÔNG
            </span>
            <div className="field" style={{ maxWidth: 170 }}>
              <label className="text-[11px]">Số ngày đi làm trong tháng</label>
              <input
                type="number"
                min={0}
                step={0.5}
                className="input"
                style={{ padding: "5px 8px", fontSize: 12 }}
                value={workDays}
                onChange={(e) => {
                  setWorkDaysTouched(true);
                  setWorkDays(e.target.value === "" ? "" : Number(e.target.value));
                }}
              />
            </div>
            <span className="text-sm" style={{ color: "var(--color-accent-2-800)" }}>
              {formatVnd(dailyRate)} × {Number(workDays) || 0} ngày ={" "}
              <strong className="text-base">{formatVnd(computedBase)}</strong>
            </span>
          </div>

          <div className="field">
            <label>Phụ cấp / thưởng / khấu trừ</label>
            <div className="flex flex-col gap-2 mt-1">
              {items.map((it, i) => (
                <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: "1fr 90px 140px 32px" }}>
                  <input
                    className="input"
                    placeholder="VD: Phụ cấp xăng xe"
                    value={it.label}
                    onChange={(e) => updateItem(i, { label: e.target.value })}
                  />
                  <select
                    className="input"
                    style={{ padding: "6px 8px" }}
                    value={it.kind}
                    onChange={(e) => updateItem(i, { kind: e.target.value as "add" | "subtract" })}
                  >
                    <option value="add">Cộng</option>
                    <option value="subtract">Trừ</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={it.amount}
                    onChange={(e) => updateItem(i, { amount: e.target.value === "" ? "" : Number(e.target.value) })}
                  />
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                    className="btn-icon"
                    style={{ width: 32, height: 32, padding: 0 }}
                    aria-label="Xoá dòng"
                  >
                    🗑
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, { label: "", kind: "add", amount: "" }])}
                className="btn btn-ghost btn-sm w-fit"
              >
                + Thêm dòng
              </button>
            </div>
          </div>

          <div className="field">
            <label>Trạng thái</label>
            <div className="flex gap-2 mt-1">
              {([
                { value: "draft", label: "Nháp" },
                { value: "paid", label: "Đã trả" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className="px-3 py-1.5 rounded-full text-sm font-semibold"
                  style={{
                    background: status === opt.value ? "var(--color-accent-500)" : "var(--color-surface)",
                    color: status === opt.value ? "#fff" : "var(--color-text)",
                    border: `1.5px solid ${status === opt.value ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="pr-note">Ghi chú</label>
            <input id="pr-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex justify-end text-base font-bold">Thực nhận: {formatVnd(total)}</div>

          {error && (
            <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          {record ? (
            <div className="flex items-center gap-2">
              <Link href={`/quan-tri/bang-luong/${record.id}`} target="_blank" className="btn btn-ghost btn-sm">
                🖨 In / Tải PDF
              </Link>
              <button type="button" onClick={handleSendEmail} className="btn btn-ghost btn-sm" disabled={sendingEmail}>
                {sendingEmail ? "Đang gửi…" : emailSent ? "✓ Đã gửi email" : "📧 Gửi email"}
              </button>
            </div>
          ) : (
            <span className="text-xs" style={{ color: "var(--color-neutral-400)" }}>
              Lưu lần đầu để có thể in phiếu lương
            </span>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>
              Huỷ
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
