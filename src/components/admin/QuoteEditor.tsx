"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteQuote, duplicateQuote, saveQuote } from "@/lib/actions/quotes";
import {
  BOOK_SIZE_SUGGESTIONS,
  DEFAULT_INTRO,
  DEFAULT_TERMS,
  STATUS_LABELS,
  TIER_PRESETS,
  blankItem,
  formatMoney,
  lineTotal,
  parseMoney,
  qtyFor,
  unitPrice,
  quoteAsText,
  resizeTiers,
  tierTotals,
  type Quote,
  type QuoteCurrency,
  type QuoteDraft,
  type QuoteItem,
  type QuoteStatus,
} from "@/lib/quote";
import { QuoteSheet } from "@/components/QuoteSheet";

// Writing a quote: the form on the left, the client's view of it on the
// right (tabs on a phone/iPad), saved on its own a moment after each change.
export function QuoteEditor({ quote }: { quote: Quote }) {
  const router = useRouter();
  const { id, code, created_at } = quote;
  const [draft, setDraft] = useState<QuoteDraft>(() => ({
    title: quote.title,
    client_name: quote.client_name,
    client_contact: quote.client_contact,
    book_size: quote.book_size ?? "",
    language: quote.language,
    currency: quote.currency,
    tier_names: quote.tier_names.length ? quote.tier_names : ["Trọn gói"],
    tier_notes: quote.tier_notes,
    intro: quote.intro,
    items: quote.items,
    terms: quote.terms,
    valid_days: quote.valid_days,
    prepared_by: quote.prepared_by,
    status: quote.status,
  }));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [copied, setCopied] = useState(false);
  const firstRender = useRef(true);
  const latest = useRef(draft);

  const patch = (p: Partial<QuoteDraft>) => setDraft((d) => ({ ...d, ...p }));
  const tiers = draft.tier_names.length;

  // Save a moment after the last change.
  useEffect(() => {
    latest.current = draft;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
     
    setSaveState("saving");
    const t = setTimeout(() => {
      saveQuote(id, latest.current)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 700);
    return () => clearTimeout(t);
  }, [draft, id]);

  async function flush() {
    await saveQuote(id, latest.current).catch(() => setSaveState("error"));
    setSaveState("saved");
  }

  function setItem(itemId: string, p: Partial<QuoteItem>) {
    setDraft((d) => ({ ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, ...p } : it)) }));
  }
  function moveItem(itemId: string, dir: -1 | 1) {
    setDraft((d) => {
      const i = d.items.findIndex((it) => it.id === itemId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.items.length) return d;
      const items = [...d.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...d, items };
    });
  }
  function removeItem(itemId: string) {
    setDraft((d) => ({ ...d, items: d.items.filter((it) => it.id !== itemId) }));
  }
  function addItem(kind: "item" | "section" | "optional") {
    const unit = draft.language === "vi" ? "trang" : "page";
    const item =
      kind === "section"
        ? blankItem(tiers, { kind: "section", qty: 0 })
        : blankItem(tiers, { unit, optional: kind === "optional", flat: kind === "optional" });
    setDraft((d) => ({ ...d, items: [...d.items, item] }));
  }

  async function copyText() {
    const text = quoteAsText({ ...draft, code });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt("Chép báo giá:", text);
    }
  }

  async function openPrint() {
    await flush();
    router.push(`/quan-tri/bao-gia/${id}/in`);
  }

  async function duplicate() {
    await flush();
    const newId = await duplicateQuote(id);
    router.push(`/quan-tri/bao-gia/${newId}`);
  }

  async function remove() {
    if (!confirm(`Xoá báo giá ${code}? Không khôi phục được.`)) return;
    await deleteQuote(id);
    router.push("/quan-tri/bao-gia");
  }

  const totals = tierTotals(draft.items, tiers);
  const money = (n: number) => formatMoney(n, draft.currency);
  const sheet = <QuoteSheet quote={{ ...draft, code, created_at }} />;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Bar: back, code, status, save state, actions */}
      <div
        className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 px-3 sm:px-5 py-2.5"
        style={{ background: "var(--color-bg)", borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <Link href="/quan-tri/bao-gia" className="btn btn-ghost btn-sm" aria-label="Về danh sách báo giá">
          ←<span className="hidden sm:inline"> Báo giá</span>
        </Link>
        <span className="text-sm font-bold tabular-nums">{code}</span>
        <select
          className="input font-normal"
          style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
          value={draft.status}
          onChange={(e) => patch({ status: e.target.value as QuoteStatus })}
          aria-label="Trạng thái"
        >
          {(Object.keys(STATUS_LABELS) as QuoteStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="text-[12px]" style={{ color: saveState === "error" ? "var(--status-red)" : "var(--color-neutral-500)" }}>
          {saveState === "saving" ? "Đang lưu…" : saveState === "error" ? "Chưa lưu được" : "✓ Đã lưu"}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyText} aria-label="Chép báo giá dạng tin nhắn">
          {copied ? "✓" : "💬"}
          <span className="hidden sm:inline">{copied ? " Đã chép" : " Chép tin nhắn"}</span>
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={openPrint} aria-label="In hoặc lưu PDF">
          🖨<span className="hidden sm:inline"> In / PDF</span>
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={duplicate} title="Tạo bản sao để báo giá khách khác">
          ⧉<span className="hidden sm:inline"> Nhân bản</span>
        </button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--status-red)" }} onClick={remove} aria-label="Xoá báo giá">
          🗑
        </button>
      </div>

      {/* Phone / iPad: switch between the form and the finished sheet. */}
      <div className="no-print xl:hidden flex gap-1 px-3 pt-3">
        {(
          [
            ["edit", "✏️ Soạn"],
            ["preview", "👁 Xem trước"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className="flex-1 rounded-[10px] py-2 text-[13.5px] font-bold"
            style={tab === k ? { background: "var(--color-accent-100)", color: "var(--color-accent-800)" } : { background: "var(--color-neutral-100)" }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex gap-6 p-3 sm:p-5 min-w-0">
        <div className={`${tab === "edit" ? "flex" : "hidden"} xl:flex flex-col gap-5 w-full xl:w-[540px] xl:flex-none min-w-0`}>
          <Card title="Khách hàng & dự án">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tên khách">
                <input className="input" value={draft.client_name} onChange={(e) => patch({ client_name: e.target.value })} placeholder="Tên khách hàng" />
              </Field>
              <Field label="Liên hệ (Zalo / email)">
                <input className="input" value={draft.client_contact} onChange={(e) => patch({ client_contact: e.target.value })} />
              </Field>
            </div>
            <Field label="Tên dự án">
              <input className="input" value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="VD: Sách tô màu 40 trang" />
            </Field>
            <Field label="Khổ sách">
              <input
                className="input"
                list="quote-book-sizes"
                value={draft.book_size}
                onChange={(e) => patch({ book_size: e.target.value })}
                placeholder="VD: 21 × 21 cm, 8.5 × 8.5 in — bỏ trống nếu chưa chốt"
              />
              <datalist id="quote-book-sizes">
                {BOOK_SIZE_SUGGESTIONS[draft.language].map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
              <div className="flex flex-wrap gap-1.5">
                {BOOK_SIZE_SUGGESTIONS[draft.language].slice(0, 6).map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => patch({ book_size: x })}
                    className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                    style={
                      draft.book_size === x
                        ? { background: "var(--color-accent-100)", color: "var(--color-accent-800)" }
                        : { background: "var(--color-neutral-100)", color: "var(--color-neutral-700)" }
                    }
                  >
                    {x}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <Field label="Ngôn ngữ">
                <Segmented
                  value={draft.language}
                  options={[
                    ["vi", "Tiếng Việt"],
                    ["en", "English"],
                  ]}
                  onChange={(v) => patch({ language: v })}
                />
              </Field>
              <Field label="Tiền tệ">
                <Segmented
                  value={draft.currency}
                  options={[
                    ["VND", "VNĐ"],
                    ["USD", "USD"],
                  ]}
                  onChange={(v) => patch({ currency: v as QuoteCurrency })}
                />
              </Field>
            </div>
            <button
              type="button"
              className="self-start text-[12.5px] font-semibold"
              style={{ color: "var(--color-accent-700)" }}
              onClick={() =>
                patch({
                  intro: DEFAULT_INTRO[draft.language],
                  terms: DEFAULT_TERMS[draft.language],
                  tier_names: TIER_PRESETS[tiers as 1 | 2 | 3].names.map((n) => n[draft.language]),
                  tier_notes: TIER_PRESETS[tiers as 1 | 2 | 3].notes.map((n) => n[draft.language]),
                })
              }
            >
              ↺ Dùng lời mở đầu, tên mức giá và điều khoản mặc định {draft.language === "vi" ? "tiếng Việt" : "tiếng Anh"}
            </button>
          </Card>

          <Card title="Mức giá">
            <Segmented
              value={String(tiers)}
              options={[
                ["1", "1 mức"],
                ["2", "2 mức"],
                ["3", "3 mức"],
              ]}
              onChange={(v) => patch(resizeTiers(draft, Number(v)))}
            />
            <div className="flex flex-col gap-2.5">
              {draft.tier_names.map((name, t) => (
                <div key={t} className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <input
                    className="input font-semibold"
                    value={name}
                    onChange={(e) => patch({ tier_names: draft.tier_names.map((x, k) => (k === t ? e.target.value : x)) })}
                    aria-label={`Tên mức ${t + 1}`}
                  />
                  <input
                    className="input"
                    value={draft.tier_notes[t] ?? ""}
                    placeholder="Mô tả ngắn mức này (không bắt buộc)"
                    onChange={(e) =>
                      patch({ tier_notes: draft.tier_names.map((_, k) => (k === t ? e.target.value : (draft.tier_notes[k] ?? ""))) })
                    }
                    aria-label={`Mô tả mức ${t + 1}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-[13px]">
              {totals.map((x, t) => (
                <span key={t} className="rounded-full px-3 py-1 tabular-nums" style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>
                  {draft.tier_names[t]}: <b>{money(x.total)}</b>
                </span>
              ))}
            </div>
          </Card>

          <Card title={`Hạng mục · ${draft.items.filter((i) => i.kind === "item").length}`}>
            <div className="flex flex-col gap-3">
              {draft.items.map((it, idx) => (
                <ItemEditor
                  key={it.id}
                  item={it}
                  tierNames={draft.tier_names}
                  currency={draft.currency}
                  first={idx === 0}
                  last={idx === draft.items.length - 1}
                  onChange={(p) => setItem(it.id, p)}
                  onMove={(dir) => moveItem(it.id, dir)}
                  onRemove={() => removeItem(it.id)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addItem("item")}>
                + Hạng mục
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => addItem("optional")} title="Bài test, trang đầu, cuốn sau… — có giá, không cộng vào tổng">
                + Tuỳ chọn thêm
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => addItem("section")}>
                + Tiêu đề nhóm
              </button>
            </div>
          </Card>

          <Card title="Lời mở đầu & điều khoản">
            <Field label="Lời mở đầu">
              <textarea className="input" rows={3} value={draft.intro} onChange={(e) => patch({ intro: e.target.value })} />
            </Field>
            <Field label="Điều khoản (mỗi dòng một ý)">
              <textarea className="input" rows={5} value={draft.terms} onChange={(e) => patch({ terms: e.target.value })} />
            </Field>
            <div className="grid gap-3 grid-cols-2">
              <Field label="Hiệu lực (ngày)">
                <input
                  className="input tabular-nums"
                  inputMode="numeric"
                  value={draft.valid_days}
                  onChange={(e) => patch({ valid_days: Math.max(1, Math.min(365, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
                />
              </Field>
              <Field label="Người báo giá">
                <input className="input" value={draft.prepared_by} onChange={(e) => patch({ prepared_by: e.target.value })} />
              </Field>
            </div>
          </Card>
        </div>

        <div className={`${tab === "preview" ? "block" : "hidden"} xl:block flex-1 min-w-0`}>
          <div className="xl:sticky xl:top-16 rounded-[16px] elev-md overflow-hidden" style={{ border: "1px solid var(--color-neutral-200)" }}>
            {sheet}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card elev-sm p-4 flex flex-col gap-3 min-w-0">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="text-[12.5px] font-bold" style={{ color: "var(--color-neutral-700)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-[10px] p-0.5 self-start" style={{ background: "var(--color-neutral-100)" }} role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className="rounded-[8px] px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap"
          style={value === v ? { background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" } : { color: "var(--color-neutral-600)" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Typed as text so "1.500.000" or "1500,5" read naturally; tidied into
// thousands on leaving the box.
function MoneyInput({ value, currency, onChange, label }: { value: number | null; currency: QuoteCurrency; onChange: (v: number | null) => void; label: string }) {
  const show = (v: number | null) => (v === null ? "" : currency === "VND" ? Math.round(v).toLocaleString("vi-VN") : v.toLocaleString("en-US"));
  const [text, setText] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => {
     
    if (!focused.current) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currency]);
  return (
    <input
      className="input tabular-nums text-right"
      inputMode="decimal"
      placeholder={currency === "VND" ? "0 ₫" : "$0"}
      value={text}
      aria-label={label}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(show(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseMoney(e.target.value, currency));
      }}
    />
  );
}

const toQty = (text: string) => Math.max(0, Number(text.replace(",", ".").replace(/[^\d.]/g, "")) || 0);

function ItemEditor({
  item,
  tierNames,
  currency,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  item: QuoteItem;
  tierNames: string[];
  currency: QuoteCurrency;
  first: boolean;
  last: boolean;
  onChange: (p: Partial<QuoteItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const tools = (
    <div className="flex items-center gap-0.5 flex-none">
      <button type="button" className="btn-icon" style={{ width: 28, height: 28, padding: 0 }} disabled={first} onClick={() => onMove(-1)} aria-label="Lên">
        ↑
      </button>
      <button type="button" className="btn-icon" style={{ width: 28, height: 28, padding: 0 }} disabled={last} onClick={() => onMove(1)} aria-label="Xuống">
        ↓
      </button>
      <button type="button" className="btn-icon" style={{ width: 28, height: 28, padding: 0, color: "var(--status-red)" }} onClick={onRemove} aria-label="Xoá dòng">
        ✕
      </button>
    </div>
  );

  if (item.kind === "section") {
    return (
      <div className="flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: "var(--color-surface)" }}>
        <input
          className="input font-bold uppercase text-[13px]"
          value={item.name}
          placeholder="Tiêu đề nhóm (VD: PHẦN 1 — NHÂN VẬT)"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {tools}
      </div>
    );
  }

  const priceTiers = item.flat || tierNames.length === 1 ? [0] : tierNames.map((_, t) => t);
  return (
    <div
      className="rounded-[12px] p-3 flex flex-col gap-2.5"
      style={{ border: `1px ${item.optional ? "dashed" : "solid"} var(--color-neutral-300)`, background: item.optional ? "var(--color-surface)" : undefined }}
    >
      <div className="flex items-center gap-2">
        {item.optional && (
          <span className="flex-none rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)" }}>
            Tuỳ chọn
          </span>
        )}
        <input className="input font-semibold" value={item.name} placeholder="Tên hạng mục" onChange={(e) => onChange({ name: e.target.value })} />
        {tools}
      </div>
      <textarea
        className="input text-[13px]"
        rows={1}
        style={{ resize: "vertical" }}
        placeholder="Mô tả thêm (không bắt buộc)"
        value={item.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      {item.qtys && tierNames.length > 1 ? (
        // A quantity per tier (the tiers are the client's options).
        <div className="flex flex-col gap-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tierNames.length}, minmax(0, 1fr))` }}>
            {tierNames.map((name, t) => (
              <label key={t} className="flex flex-col gap-1 min-w-0">
                <span className="text-[11.5px] font-semibold truncate" style={{ color: "var(--color-neutral-600)" }}>
                  SL · {name}
                </span>
                <input
                  className="input tabular-nums text-center"
                  inputMode="decimal"
                  value={item.qtys?.[t] ?? item.qty}
                  aria-label={`Số lượng ${name}`}
                  onChange={(e) => {
                    const v = toQty(e.target.value);
                    onChange({ qtys: tierNames.map((_, k) => (k === t ? v : (item.qtys?.[k] ?? item.qty))) });
                  }}
                />
              </label>
            ))}
          </div>
          <input className="input" value={item.unit} placeholder="Đơn vị (trang, spread, bìa, cuốn…)" onChange={(e) => onChange({ unit: e.target.value })} />
        </div>
      ) : (
        <div className="grid gap-2 grid-cols-[88px_minmax(0,1fr)]">
          <input
            className="input tabular-nums text-center"
            inputMode="decimal"
            value={item.qty}
            aria-label="Số lượng"
            onChange={(e) => onChange({ qty: toQty(e.target.value) })}
          />
          <input className="input" value={item.unit} placeholder="Đơn vị (trang, spread, bìa, cuốn…)" onChange={(e) => onChange({ unit: e.target.value })} />
        </div>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${priceTiers.length}, minmax(0, 1fr))` }}>
        {priceTiers.map((t) => (
          <label key={t} className="flex flex-col gap-1 min-w-0">
            <span className="text-[11.5px] font-semibold truncate" style={{ color: "var(--color-neutral-600)" }}>
              {priceTiers.length === 1 ? `Giá mỗi ${item.unit || "đơn vị"}` : tierNames[t]}
            </span>
            <MoneyInput
              value={item.prices[t] ?? null}
              currency={currency}
              label={`Giá ${tierNames[t] ?? ""}`}
              onChange={(v) => onChange({ prices: item.prices.map((p, k) => (k === t ? v : p)) })}
            />
            {item.qtys && priceTiers.length === 1 && tierNames.length > 1 ? (
              // One unit price, a different quantity per tier: each tier's line.
              <span className="text-[11.5px] tabular-nums text-right" style={{ color: "var(--color-neutral-500)" }}>
                {unitPrice(item, 0) === null ? "" : `= ${tierNames.map((_, k) => formatMoney(lineTotal(item, k) as number, currency)).join(" / ")}`}
              </span>
            ) : (
              (item.qtys ? qtyFor(item, t) : item.qty) !== 1 &&
              lineTotal(item, t) !== null && (
                <span className="text-[11.5px] tabular-nums text-right" style={{ color: "var(--color-neutral-500)" }}>
                  = {formatMoney(lineTotal(item, t) as number, currency)}
                </span>
              )
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        {tierNames.length > 1 && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={item.flat} onChange={(e) => onChange({ flat: e.target.checked })} />
            Một giá cho mọi mức
          </label>
        )}
        {tierNames.length > 1 && (
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            title="Khi mỗi mức là một phương án của khách, VD: 16 trang + 6 sticker / 20 trang + 4 sticker"
          >
            <input type="checkbox" checked={!!item.qtys} onChange={(e) => onChange({ qtys: e.target.checked ? tierNames.map(() => item.qty) : null })} />
            Số lượng khác nhau theo mức
          </label>
        )}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={item.optional} onChange={(e) => onChange({ optional: e.target.checked })} />
          Tuỳ chọn thêm (không cộng vào tổng)
        </label>
      </div>
    </div>
  );
}
