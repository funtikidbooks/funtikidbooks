"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { AttendanceAvatar } from "@/components/admin/AttendanceEditCellModal";
import { getMonthAttendance } from "@/lib/actions/attendance";
import { getStaffSalary, upsertPayroll, upsertStaffSalary } from "@/lib/actions/payroll";
import { MONTH_LABELS, summarizeAttendance } from "@/lib/constants/attendance";
import type { PayrollItem, PayrollRecord, PayrollStatus, Profile } from "@/lib/types";

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
  const [autoFilledWorkDays, setAutoFilledWorkDays] = useState(false);

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

  // Lương/ngày = lương tháng ÷ số ngày công chuẩn, làm tròn đến nghìn đồng
  // gần nhất cho gọn số.
  const dailyRate = useMemo(() => {
    const salary = Number(monthlySalary) || 0;
    const days = Number(standardWorkDays) || 0;
    if (!salary || !days) return 0;
    return Math.round(salary / days / 1000) * 1000;
  }, [monthlySalary, standardWorkDays]);

  // Prefills "Số ngày đi làm" from the attendance count once it's loaded —
  // only if the director hasn't already got a saved value (an existing
  // record) or typed one in themselves. Deferred a frame rather than set
  // synchronously here, so this stays a "reacting to an external system"
  // update, not a render triggered straight from the effect body.
  useEffect(() => {
    if (autoFilledWorkDays || statsLoading) return;
    const frame = requestAnimationFrame(() => {
      if (workDays === "") setWorkDays(stats.present);
      setAutoFilledWorkDays(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFilledWorkDays, statsLoading, stats.present, workDays]);

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
                className="input"
                style={{ padding: "5px 8px", fontSize: 12 }}
                value={workDays}
                onChange={(e) => setWorkDays(e.target.value === "" ? "" : Number(e.target.value))}
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
            <Link href={`/quan-tri/bang-luong/${record.id}`} target="_blank" className="btn btn-ghost btn-sm">
              🖨 In / Tải PDF
            </Link>
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
