"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { saveJsonSetting } from "@/lib/actions/admin";
import { PRICING_SETTING_KEY } from "@/lib/pricing";
import type { PricingFeatureRow, PricingTable, PricingTier } from "@/lib/types";

function newId() {
  return crypto.randomUUID();
}

export function PricingEditDialog({
  table,
  onClose,
  onSaved,
}: {
  table: PricingTable;
  onClose: () => void;
  onSaved: (next: PricingTable) => void;
}) {
  const [tiers, setTiers] = useState<PricingTier[]>(table.tiers);
  const [rows, setRows] = useState<PricingFeatureRow[]>(table.rows);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTier(id: string, patch: Partial<PricingTier>) {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addTier() {
    setTiers((prev) => [...prev, { id: newId(), name: "Gói mới", priceVnd: null, priceUsd: null, delivery: "", description: "", featured: false }]);
    setRows((prev) => prev.map((r) => ({ ...r, values: [...r.values, "-"] })));
  }

  function setFeatured(id: string) {
    // Only one tier can be the standout at a time.
    setTiers((prev) => prev.map((t) => ({ ...t, featured: t.id === id ? !t.featured : false })));
  }

  function removeTier(index: number) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
    setRows((prev) => prev.map((r) => ({ ...r, values: r.values.filter((_, i) => i !== index) })));
  }

  function updateRow(id: string, patch: Partial<PricingFeatureRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updateRowValue(id: string, valueIndex: number, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, values: r.values.map((v, i) => (i === valueIndex ? value : v)) } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { id: newId(), label: "Mục mới", values: tiers.map(() => "-") }]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const next: PricingTable = { tiers, rows };
    try {
      await saveJsonSetting(PRICING_SETTING_KEY, next, ["/dich-vu"]);
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={960}>
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <div>
            <h2 className="text-xl">Chỉnh sửa bảng giá</h2>
            <p className="text-xs mt-1" style={{ color: "var(--color-neutral-500)" }}>
              Hiển thị trên trang Dịch vụ công khai
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon flex-none" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 max-h-[70vh] overflow-y-auto">
          <section className="flex flex-col gap-4">
            <SectionHeading step="01" title="Các gói dịch vụ" />
            <div className="overflow-x-auto">
              <div className="flex gap-4" style={{ minWidth: tiers.length * 220 }}>
                {tiers.map((tier, index) => (
                  <div key={tier.id} className="flex flex-col gap-3 p-4 rounded-[var(--radius-md)]" style={{ background: "var(--color-surface)", width: 220, flex: "none" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold" style={{ color: "var(--color-neutral-500)" }}>
                        Gói {index + 1}
                      </span>
                      {tiers.length > 1 && (
                        <button type="button" className="btn-icon" aria-label="Xoá gói" onClick={() => removeTier(index)}>
                          🗑
                        </button>
                      )}
                    </div>
                    <div className="field">
                      <label>Tên gói</label>
                      <input className="input" value={tier.name} onChange={(e) => updateTier(tier.id, { name: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Giá (VNĐ)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="Để trống = liên hệ"
                        value={tier.priceVnd ?? ""}
                        onChange={(e) => updateTier(tier.id, { priceVnd: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Giá (USD)</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="Để trống = liên hệ"
                        value={tier.priceUsd ?? ""}
                        onChange={(e) => updateTier(tier.id, { priceUsd: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Thời gian giao</label>
                      <input className="input" placeholder="VD: 1-3 ngày" value={tier.delivery} onChange={(e) => updateTier(tier.id, { delivery: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Mô tả ngắn</label>
                      <input className="input" value={tier.description} onChange={(e) => updateTier(tier.id, { description: e.target.value })} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFeatured(tier.id)}
                      className="text-xs font-bold px-3 py-1.5 rounded-full"
                      style={{
                        background: tier.featured ? "var(--color-accent-600)" : "var(--color-panel)",
                        color: tier.featured ? "#fff" : "var(--color-neutral-600)",
                        border: `1.5px solid ${tier.featured ? "var(--color-accent-600)" : "var(--color-neutral-300)"}`,
                      }}
                    >
                      ⭐ {tier.featured ? "Đang nổi bật" : "Đặt làm nổi bật"}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addTier}
                  className="flex-none flex flex-col items-center justify-center gap-1 rounded-[var(--radius-md)]"
                  style={{ width: 100, border: "2px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)" }}
                >
                  <span className="text-xl leading-none">+</span>
                  <span className="text-xs font-bold">Thêm gói</span>
                </button>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading step="02" title="Bảng so sánh tính năng" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 220 + tiers.length * 140, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th className="text-left font-semibold px-2 py-1.5" style={{ width: 220 }}>
                      Mục
                    </th>
                    {tiers.map((t) => (
                      <th key={t.id} className="text-left font-semibold px-2 py-1.5">
                        {t.name || "—"}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} style={{ borderTop: "1px solid var(--color-neutral-100)" }}>
                      <td className="px-2 py-1.5">
                        <input className="input" value={row.label} onChange={(e) => updateRow(row.id, { label: e.target.value })} />
                      </td>
                      {tiers.map((_, i) => {
                        const value = row.values[i] ?? "-";
                        return (
                          <td key={i} className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                className="input"
                                value={value}
                                onChange={(e) => updateRowValue(row.id, i, e.target.value)}
                                placeholder="- hoặc ✓ hoặc số"
                                style={{ width: 72 }}
                              />
                              <button
                                type="button"
                                title="Có (✓)"
                                onClick={() => updateRowValue(row.id, i, "✓")}
                                className="btn-icon flex-none"
                                style={{
                                  color: value === "✓" ? "var(--status-green)" : "var(--color-neutral-400)",
                                  background: value === "✓" ? "var(--color-accent-100)" : undefined,
                                }}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                title="Không (-)"
                                onClick={() => updateRowValue(row.id, i, "-")}
                                className="btn-icon flex-none"
                                style={{
                                  color: value === "-" ? "var(--status-red)" : "var(--color-neutral-400)",
                                  background: value === "-" ? "var(--color-accent-100)" : undefined,
                                }}
                              >
                                –
                              </button>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5">
                        <button type="button" className="btn-icon" aria-label="Xoá dòng" onClick={() => removeRow(row.id)}>
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addRow} className="btn btn-secondary btn-sm w-fit">
              + Thêm dòng
            </button>
          </section>

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
          <button type="button" onClick={save} className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : "💾 Lưu bảng giá"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
