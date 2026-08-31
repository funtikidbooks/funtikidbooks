"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { upsertFinanceEntry } from "@/lib/actions/finance";
import { MONTH_LABELS } from "@/lib/constants/attendance";
import type { FinanceEntry, FinanceEntryType } from "@/lib/types";

const TYPE_LABELS: Record<FinanceEntryType, string> = {
  revenue: "Doanh thu",
  fixed_cost: "Định phí",
  variable_cost: "Biến phí",
};

// Free-text suggestions, not a fixed enum — director can always type
// something else. Just saves re-typing the categories that come up most.
const CATEGORY_SUGGESTIONS: Record<FinanceEntryType, string[]> = {
  revenue: ["Doanh thu dự án sách", "Doanh thu thiết kế nhân vật", "Doanh thu dịch vụ khác"],
  fixed_cost: ["Thuê văn phòng", "Phần mềm & công cụ", "Internet & điện thoại", "Bảo hiểm / thuế cố định", "Marketing cố định", "Khấu hao thiết bị"],
  variable_cost: ["Thuê ngoài / freelancer", "In ấn / nguyên vật liệu", "Hoa hồng", "Phí giao dịch / thanh toán", "Vận chuyển"],
};

export function FinanceEntryModal({
  entryMonth,
  entry,
  defaultType,
  onClose,
  onSaved,
}: {
  entryMonth: string;
  entry: FinanceEntry | undefined;
  defaultType: FinanceEntryType;
  onClose: () => void;
  onSaved: (entry: FinanceEntry) => void;
}) {
  const [type, setType] = useState<FinanceEntryType>(entry?.type ?? defaultType);
  const [category, setCategory] = useState(entry?.category ?? "");
  const [amount, setAmount] = useState<number | "">(entry?.amount ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category.trim()) {
      setError("Cần nhập tên khoản mục.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertFinanceEntry({
        id: entry?.id,
        entryMonth,
        type,
        category,
        amount: Number(amount) || 0,
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

  const d = new Date(`${entryMonth}T00:00:00`);
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;

  return (
    <Modal onClose={onClose} maxWidth={440}>
      <form onSubmit={submit} className="flex flex-col">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <div className="flex-1">
            <h2 className="text-lg">{entry ? "Sửa khoản" : "Thêm khoản"}</h2>
            <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
              {monthLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6">
          <div className="field">
            <label>Loại khoản</label>
            <div className="flex gap-2 mt-1">
              {(Object.keys(TYPE_LABELS) as FinanceEntryType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="px-3 py-1.5 rounded-full text-sm font-semibold"
                  style={{
                    background: type === t ? "var(--color-accent-500)" : "var(--color-surface)",
                    color: type === t ? "#fff" : "var(--color-text)",
                    border: `1.5px solid ${type === t ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
                  }}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="fe-category">Khoản mục</label>
            <input
              id="fe-category"
              className="input"
              list="fe-category-suggestions"
              placeholder="VD: Thuê văn phòng"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              autoFocus
            />
            <datalist id="fe-category-suggestions">
              {CATEGORY_SUGGESTIONS[type].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="fe-amount">Số tiền (VNĐ)</label>
            <input
              id="fe-amount"
              type="number"
              min={0}
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div className="field">
            <label htmlFor="fe-note">Ghi chú (không bắt buộc)</label>
            <input id="fe-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
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
