"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { upsertPersonalDebt } from "@/lib/actions/finance";
import { formatVnd } from "@/lib/financeSummary";
import type { FinanceEntry, PersonalDebt } from "@/lib/types";

export function DebtEditModal({
  debt,
  monthStart,
  onClose,
  onSaved,
}: {
  debt: PersonalDebt;
  // Which month a repayment entered here gets filed under in Biến phí —
  // the month currently open on the Tài chính page, not necessarily
  // today's real month (the director may be back-filling an earlier one).
  monthStart: string;
  onClose: () => void;
  onSaved: (debt: PersonalDebt, addedEntry: FinanceEntry | null) => void;
}) {
  const [totalAmount, setTotalAmount] = useState<number | "">(debt.total_amount ?? "");
  const [remainingAmount, setRemainingAmount] = useState<number | "">(debt.remaining_amount ?? "");
  const [repayment, setRepayment] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Typing a repayment here subtracts it from what "Còn nợ" was when the
  // modal opened — not from whatever's currently in that field — so typing
  // then correcting the repayment amount doesn't stack subtractions on top
  // of each other. "Còn nợ" stays directly editable too, for a manual
  // correction that has nothing to do with a payment just made.
  function applyRepayment(value: number | "") {
    setRepayment(value);
    const opening = debt.remaining_amount ?? 0;
    setRemainingAmount(value === "" ? opening : Math.max(0, opening - Number(value)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (totalAmount !== "" && remainingAmount !== "" && Number(remainingAmount) > Number(totalAmount)) {
      setError("Còn nợ không thể lớn hơn tổng nợ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { debt: saved, addedEntry } = await upsertPersonalDebt({
        id: debt.id,
        label: debt.label,
        totalAmount: totalAmount === "" ? null : Number(totalAmount),
        remainingAmount: remainingAmount === "" ? null : Number(remainingAmount),
        repayment: repayment !== "" && Number(repayment) > 0 ? { amount: Number(repayment), month: monthStart } : undefined,
      });
      onSaved(saved, addedEntry);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={400}>
      <form onSubmit={submit} className="flex flex-col">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <h2 className="text-lg flex-1">{debt.label}</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6">
          <div className="field">
            <label htmlFor="debt-repayment">Vừa trả nợ (VNĐ)</label>
            <input
              id="debt-repayment"
              type="number"
              min={0}
              className="input"
              placeholder="Nhập số tiền vừa trả — tự trừ vào Còn nợ bên dưới"
              value={repayment}
              onChange={(e) => applyRepayment(e.target.value === "" ? "" : Number(e.target.value))}
              autoFocus
            />
            {repayment !== "" && Number(repayment) > 0 && (
              <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
                Số tiền này sẽ tự cộng vào Biến phí của tháng đang xem trên Tài chính.
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="debt-total">Tổng nợ (VNĐ)</label>
            <input
              id="debt-total"
              type="number"
              min={0}
              className="input"
              placeholder="Chưa nhập"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div className="field">
            <label htmlFor="debt-remaining">Còn nợ (VNĐ)</label>
            <input
              id="debt-remaining"
              type="number"
              min={0}
              className="input"
              placeholder="Chưa nhập"
              value={remainingAmount}
              onChange={(e) => setRemainingAmount(e.target.value === "" ? "" : Number(e.target.value))}
            />
            {repayment !== "" && (
              <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
                {formatVnd(debt.remaining_amount ?? 0)} − {formatVnd(Number(repayment))} = {formatVnd(remainingAmount === "" ? 0 : remainingAmount)}
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={saving}>
            Huỷ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
