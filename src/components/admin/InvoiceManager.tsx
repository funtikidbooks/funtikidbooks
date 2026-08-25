"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createInvoice, deleteInvoice, updateInvoiceStatus } from "@/lib/actions/invoices";
import { Modal } from "@/components/ui/Modal";
import type { Invoice, InvoiceItem, InvoiceStatus } from "@/lib/types";

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Nháp",
  issued: "Đã xuất",
  paid: "Đã thanh toán",
  cancelled: "Đã huỷ",
};

const STATUS_COLORS: Record<InvoiceStatus, { bg: string; fg: string }> = {
  draft: { bg: "var(--color-neutral-200)", fg: "var(--color-neutral-700)" },
  issued: { bg: "var(--color-accent-2-100)", fg: "var(--color-accent-2-800)" },
  paid: { bg: "#dcfce7", fg: "var(--status-green)" },
  cancelled: { bg: "#fee2e2", fg: "var(--status-red)" },
};

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN");
}

function invoiceTotal(inv: Pick<Invoice, "items" | "tax_rate">) {
  const subtotal = inv.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  return subtotal + subtotal * (inv.tax_rate / 100);
}

function emptyItem(): InvoiceItem {
  return { description: "", quantity: 1, unit_price: 0 };
}

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (inv: Invoice) => void }) {
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientTaxCode, setClientTaxCode] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [taxRate, setTaxRate] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(() => items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0), [items]);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  function updateItem(i: number, patch: Partial<InvoiceItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanItems = items
      .map((it) => ({ ...it, description: it.description.trim() }))
      .filter((it) => it.description);
    if (!clientName.trim() || cleanItems.length === 0) {
      setError("Cần tên khách hàng và ít nhất 1 mục có mô tả");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const inv = await createInvoice({
        clientName,
        clientAddress,
        clientTaxCode,
        clientEmail,
        issueDate,
        dueDate,
        items: cleanItems,
        taxRate,
        note,
      });
      onCreated(inv);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={720}>
      <form onSubmit={submit} className="flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <h2 className="text-xl">Tạo hoá đơn mới</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 px-6 py-6 max-h-[70vh] overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="inv-client">Tên khách hàng *</label>
              <input id="inv-client" className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="inv-tax-code">Mã số thuế</label>
              <input id="inv-tax-code" className="input" value={clientTaxCode} onChange={(e) => setClientTaxCode(e.target.value)} />
            </div>
            <div className="field sm:col-span-2">
              <label htmlFor="inv-address">Địa chỉ</label>
              <input id="inv-address" className="input" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="inv-email">Email</label>
              <input id="inv-email" type="email" className="input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="inv-issue">Ngày lập</label>
              <input id="inv-issue" type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="inv-due">Hạn thanh toán</label>
              <input id="inv-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="inv-tax-rate">Thuế VAT (%)</label>
              <input
                id="inv-tax-rate"
                type="number"
                min={0}
                max={100}
                className="input"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="field">
            <label>Nội dung *</label>
            <div className="flex flex-col gap-2 mt-1">
              <div className="hidden sm:grid gap-2 text-[11px] font-bold px-1" style={{ gridTemplateColumns: "1fr 90px 130px 32px", color: "var(--color-neutral-500)" }}>
                <span>Mô tả</span>
                <span>Số lượng</span>
                <span>Đơn giá</span>
                <span />
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid gap-2" style={{ gridTemplateColumns: "1fr 90px 130px 32px" }}>
                  <input
                    className="input"
                    placeholder="VD: Minh hoạ bìa sách"
                    value={it.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={it.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })}
                  />
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={it.unit_price}
                    onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) || 0 })}
                  />
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                    className="btn-icon"
                    style={{ width: 32, height: 32, padding: 0 }}
                    disabled={items.length === 1}
                    aria-label="Xoá dòng"
                  >
                    🗑
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                className="btn btn-ghost btn-sm w-fit"
              >
                + Thêm dòng
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="inv-note">Ghi chú</label>
            <textarea id="inv-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1 items-end text-sm" style={{ color: "var(--color-neutral-700)" }}>
            <span>Tạm tính: {formatVnd(subtotal)}</span>
            <span>Thuế ({taxRate}%): {formatVnd(taxAmount)}</span>
            <span className="text-base font-bold" style={{ color: "var(--color-text)" }}>Tổng cộng: {formatVnd(total)}</span>
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
            {saving ? "Đang tạo…" : "Tạo hoá đơn"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function InvoiceManager({ initialInvoices }: { initialInvoices: Invoice[] }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [showCreate, setShowCreate] = useState(false);

  async function handleStatusChange(id: string, status: InvoiceStatus) {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await updateInvoiceStatus(id, status);
    } catch {
      // best effort — a page refresh will reconcile if this failed
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xoá hoá đơn này?")) return;
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    await deleteInvoice(id).catch(() => {});
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl">Hoá đơn</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-neutral-500)" }}>
            Tạo và quản lý hoá đơn/báo giá gửi khách hàng.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn btn-primary">
          + Tạo hoá đơn
        </button>
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm mt-6" style={{ color: "var(--color-neutral-500)" }}>
          Chưa có hoá đơn nào.
        </p>
      ) : (
        <div className="card elev-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                <th className="text-left px-4 py-3 font-bold">Số HĐ</th>
                <th className="text-left px-4 py-3 font-bold">Khách hàng</th>
                <th className="text-left px-4 py-3 font-bold">Ngày lập</th>
                <th className="text-right px-4 py-3 font-bold">Tổng tiền</th>
                <th className="text-left px-4 py-3 font-bold">Trạng thái</th>
                <th className="text-right px-4 py-3 font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.client_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(inv.issue_date)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatVnd(invoiceTotal(inv))}</td>
                  <td className="px-4 py-3">
                    <select
                      className="text-xs font-bold rounded-full px-2.5 py-1 border-none"
                      value={inv.status}
                      onChange={(e) => handleStatusChange(inv.id, e.target.value as InvoiceStatus)}
                      style={{ background: STATUS_COLORS[inv.status].bg, color: STATUS_COLORS[inv.status].fg }}
                    >
                      {(Object.keys(STATUS_LABELS) as InvoiceStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/quan-tri/hoa-don/${inv.id}`} className="text-xs font-bold mr-3" style={{ color: "var(--color-accent-600)" }}>
                      Xem / In
                    </Link>
                    <button type="button" onClick={() => handleDelete(inv.id)} className="text-xs font-bold" style={{ color: "var(--status-red)" }}>
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateInvoiceModal onClose={() => setShowCreate(false)} onCreated={(inv) => setInvoices((prev) => [inv, ...prev])} />
      )}
    </div>
  );
}
