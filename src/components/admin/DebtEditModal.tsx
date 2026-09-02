"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { upsertPersonalDebt } from "@/lib/actions/finance";
import type { PersonalDebt } from "@/lib/types";

export function DebtEditModal({
  debt,
  onClose,
  onSaved,
}: {
  debt: PersonalDebt;
  onClose: () => void;
  onSaved: (debt: PersonalDebt) => void;
}) {
  const [totalAmount, setTotalAmount] = useState<number | "">(debt.total_amount ?? "");
  const [remainingAmount, setRemainingAmount] = useState<number | "">(debt.remaining_amount ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (totalAmount !== "" && remainingAmount !== "" && Number(remainingAmount) > Number(totalAmount)) {
      setError("Còn nợ không thể lớn hơn tổng nợ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertPersonalDebt({
        id: debt.id,
        label: debt.label,
        totalAmount: totalAmount === "" ? null : Number(totalAmount),
        remainingAmount: remainingAmount === "" ? null : Number(remainingAmount),
      });
      onSaved(saved);
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
            <label htmlFor="debt-total">Tổng nợ (VNĐ)</label>
            <input
              id="debt-total"
              type="number"
              min={0}
              className="input"
              placeholder="Chưa nhập"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value === "" ? "" : Number(e.target.value))}
              autoFocus
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
