"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { saveUpworkSop } from "@/lib/actions/upwork";
import type { SopStep, UpworkSop } from "@/lib/upworkSop";

// The deck's own palette (sampled from the SOP-01 slides), so the page reads
// as the same document — navy for structure, then orange/teal/rose/gold to
// tell parallel items apart.
const NAVY = "#1B3A5C";
const BLUE = "#2A5A82";
const ORANGE = "#E07A3A";
const TEAL = "#2A8A82";
const ROSE = "#C2607A";
const GOLD = "#D9A242";
const TONES = [BLUE, TEAL, ORANGE, ROSE, GOLD, NAVY];
const tone = (i: number) => TONES[i % TONES.length];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type SectionKey = "cover" | "overview" | "classify" | "criteria" | "realName" | "timing" | "coverLetter" | "decision" | "closing";

const PARTS: { key: Exclude<SectionKey, "cover" | "overview" | "closing">; anchor: string }[] = [
  { key: "classify", anchor: "sop-classify" },
  { key: "criteria", anchor: "sop-criteria" },
  { key: "realName", anchor: "sop-real-name" },
  { key: "timing", anchor: "sop-timing" },
  { key: "coverLetter", anchor: "sop-cover-letter" },
  { key: "decision", anchor: "sop-decision" },
];

// Text that turns into an input in place while its section is being edited
// — same spot, same typography, dashed outline — so editing happens on the
// layout itself rather than in a separate form.
function Field({
  value,
  onChange,
  editing,
  multiline,
  className = "",
  style,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  multiline?: boolean;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
}) {
  if (!editing) {
    return value ? (
      <span className={`whitespace-pre-line ${className}`} style={style}>
        {value}
      </span>
    ) : null;
  }
  if (multiline) {
    const rows = Math.max(2, value.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 55)), 0));
    return (
      <textarea
        className={`fk-sop-edit ${className}`}
        style={style}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input className={`fk-sop-edit ${className}`} style={style} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute flex items-center justify-center rounded-full font-bold"
      style={{ top: -9, right: -9, width: 22, height: 22, fontSize: 12, background: "var(--status-red)", color: "#fff", zIndex: 2 }}
    >
      ✕
    </button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[10px] px-3 py-2 text-xs font-semibold"
      style={{ border: "1.5px dashed var(--color-neutral-300)", color: "var(--color-neutral-600)" }}
    >
      + {label}
    </button>
  );
}

const setAt = <T,>(list: T[], i: number, patch: Partial<T>) => list.map((x, k) => (k === i ? { ...x, ...patch } : x));
const removeAt = <T,>(list: T[], i: number) => list.filter((_, k) => k !== i);

function Badge({ children, color, size = 30 }: { children: ReactNode; color: string; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold flex-none"
      style={{ width: size, height: size, background: color, color: "#fff", fontSize: size * 0.42 }}
    >
      {children}
    </span>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  intro,
  editing,
  locked,
  saving,
  error,
  onEdit,
  onSave,
  onCancel,
  onTitle,
  onIntro,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  editing: boolean;
  locked: boolean;
  saving: boolean;
  error: string | null;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onTitle?: (v: string) => void;
  onIntro?: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="card elev-sm p-5 sm:p-7 flex flex-col gap-5 scroll-mt-4"
      style={editing ? { boxShadow: `0 0 0 2px ${ORANGE}` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          {eyebrow && (
            <span className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: ORANGE }}>
              {eyebrow}
            </span>
          )}
          {title !== undefined &&
            (onTitle ? (
              <Field value={title} onChange={onTitle} editing={editing} className="font-heading text-xl sm:text-2xl font-bold leading-tight" />
            ) : (
              <span className="font-heading text-xl sm:text-2xl font-bold leading-tight">{title}</span>
            ))}
          {intro !== undefined && onIntro && (
            <Field value={intro} onChange={onIntro} editing={editing} multiline className="text-sm" style={{ color: "var(--color-neutral-500)" }} />
          )}
        </div>
        {editing ? (
          <div className="flex gap-2 flex-none">
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onSave}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onCancel}>
              Huỷ
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm flex-none"
            disabled={locked}
            onClick={onEdit}
            title={locked ? "Đang sửa một phần khác" : "Sửa phần này"}
          >
            ✏️ Sửa
          </button>
        )}
      </div>
      {error && editing && (
        <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
      {children}
    </section>
  );
}

export function UpworkSopView({ initialSop, saved }: { initialSop: UpworkSop; saved: boolean }) {
  const [sop, setSop] = useState(initialSop);
  const [draft, setDraft] = useState(initialSop);
  const [editingKey, setEditingKey] = useState<SectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(saved);
  const [pending, startTransition] = useTransition();
  const doc = editingKey ? draft : sop;

  function start(key: SectionKey) {
    setDraft(structuredClone(sop));
    setError(null);
    setEditingKey(key);
  }

  function save() {
    startTransition(async () => {
      try {
        const next = await saveUpworkSop(draft);
        setSop(next);
        setSavedOnce(true);
        setEditingKey(null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không thể lưu SOP.");
      }
    });
  }

  function patch<K extends keyof UpworkSop>(key: K, value: Partial<UpworkSop[K]> | UpworkSop[K]) {
    setDraft((d) => ({ ...d, [key]: typeof d[key] === "string" ? value : { ...(d[key] as object), ...(value as object) } }));
  }

  const shell = (key: SectionKey) => ({
    editing: editingKey === key,
    locked: editingKey !== null && editingKey !== key,
    saving: pending,
    error,
    onEdit: () => start(key),
    onSave: save,
    onCancel: () => setEditingKey(null),
  });
  const ed = (key: SectionKey) => editingKey === key;
  const partNo = (key: SectionKey) => String(PARTS.findIndex((p) => p.key === key) + 1).padStart(2, "0");

  const { cover, classify, criteria, realName, timing, coverLetter, decision, closing } = doc;
  const maxScore = criteria.rows.length * 5;

  return (
    <div className="flex flex-col gap-5 max-w-[1100px] w-full mx-auto">
      {!savedOnce && (
        <p className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
          Đang hiển thị bản gốc từ file SOP-01. Bấm &quot;✏️ Sửa&quot; ở từng phần để chỉnh — lần lưu đầu tiên sẽ tạo bản của studio.
        </p>
      )}

      {/* Cover */}
      <section
        className="rounded-[var(--radius-lg)] p-6 sm:p-9 flex flex-col gap-4 relative overflow-hidden"
        style={{ background: NAVY, color: "#fff", boxShadow: ed("cover") ? `0 0 0 2px ${ORANGE}` : undefined }}
      >
        <div className="absolute right-0 top-0 h-full w-2" style={{ background: ORANGE }} aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <Field
            value={cover.eyebrow}
            onChange={(v) => patch("cover", { eyebrow: v })}
            editing={ed("cover")}
            className="text-[11px] font-bold tracking-[0.16em] uppercase"
            style={{ color: GOLD }}
          />
          {ed("cover") ? (
            <div className="flex gap-2 flex-none">
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={save}>
                {pending ? "Đang lưu…" : "Lưu"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => setEditingKey(null)}>
                Huỷ
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm flex-none"
              style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
              disabled={editingKey !== null}
              onClick={() => start("cover")}
            >
              ✏️ Sửa
            </button>
          )}
        </div>
        <Field
          value={cover.title}
          onChange={(v) => patch("cover", { title: v })}
          editing={ed("cover")}
          multiline
          className="font-heading text-2xl sm:text-4xl font-bold leading-tight max-w-[22ch]"
        />
        <div className="h-px w-16" style={{ background: ORANGE }} aria-hidden />
        <div className="flex flex-col gap-1 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
          <Field value={cover.department} onChange={(v) => patch("cover", { department: v })} editing={ed("cover")} />
          <span className="flex flex-col sm:flex-row sm:flex-wrap gap-x-2">
            <Field value={cover.docCode} onChange={(v) => patch("cover", { docCode: v })} editing={ed("cover")} className="font-semibold" />
            {!ed("cover") && (
              <span aria-hidden className="hidden sm:inline">
                |
              </span>
            )}
            <Field value={cover.scope} onChange={(v) => patch("cover", { scope: v })} editing={ed("cover")} />
          </span>
        </div>
        {error && ed("cover") && <p className="text-xs font-semibold">{error}</p>}
      </section>

      {/* Tổng quan */}
      <SectionShell
        eyebrow="Tổng quan"
        title="Nội Dung Quy Trình"
        intro={doc.overviewIntro}
        onIntro={(v) => patch("overviewIntro", v)}
        {...shell("overview")}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PARTS.map((p, i) => {
            const part = doc[p.key];
            const card = (
              <>
                <span className="font-heading text-lg font-bold tabular-nums flex-none" style={{ color: tone(i) }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex flex-col gap-1 min-w-0 flex-1">
                  <Field
                    value={part.title}
                    onChange={(v) => patch(p.key, { title: v })}
                    editing={ed("overview")}
                    className="text-sm font-bold"
                  />
                  <Field
                    value={part.summary}
                    onChange={(v) => patch(p.key, { summary: v })}
                    editing={ed("overview")}
                    multiline
                    className="text-xs"
                    style={{ color: "var(--color-neutral-500)" }}
                  />
                </span>
              </>
            );
            const style = { borderLeft: `3px solid ${tone(i)}`, background: "var(--color-surface)" };
            return ed("overview") ? (
              <div key={p.key} className="flex gap-3 rounded-[10px] p-3" style={style}>
                {card}
              </div>
            ) : (
              <a key={p.key} href={`#${p.anchor}`} className="fk-sop-link flex gap-3 rounded-[10px] p-3" style={style}>
                {card}
              </a>
            );
          })}
        </div>
      </SectionShell>

      {/* 01 Phân loại */}
      <SectionShell
        id="sop-classify"
        eyebrow={`Phần ${partNo("classify")}`}
        title={classify.title}
        onTitle={(v) => patch("classify", { title: v })}
        intro={classify.intro}
        onIntro={(v) => patch("classify", { intro: v })}
        {...shell("classify")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {classify.items.map((item, i) => {
            const color = i % 2 === 0 ? BLUE : ORANGE;
            const set = (v: Partial<typeof item>) => patch("classify", { items: setAt(classify.items, i, v) });
            return (
              <div key={i} className="relative rounded-[12px] overflow-hidden flex flex-col" style={{ border: "1px solid var(--color-neutral-200)" }}>
                {ed("classify") && classify.items.length > 1 && (
                  <RemoveButton label="Xoá loại này" onClick={() => patch("classify", { items: removeAt(classify.items, i) })} />
                )}
                <div className="flex items-center gap-3 px-4 py-3" style={{ background: color, color: "#fff" }}>
                  <Badge color="rgba(255,255,255,0.22)" size={28}>
                    {i + 1}
                  </Badge>
                  <span className="flex flex-col min-w-0 flex-1">
                    <Field value={item.name} onChange={(v) => set({ name: v })} editing={ed("classify")} className="font-bold" />
                    <Field value={item.tagline} onChange={(v) => set({ tagline: v })} editing={ed("classify")} className="text-xs opacity-90" />
                  </span>
                </div>
                <div className="flex flex-col gap-3 p-4 flex-1">
                  <Field value={item.description} onChange={(v) => set({ description: v })} editing={ed("classify")} multiline className="text-sm leading-relaxed" />
                  <div className="mt-auto pt-3 flex flex-col gap-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
                    <span className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
                      Xử lý
                    </span>
                    <Field value={item.action} onChange={(v) => set({ action: v })} editing={ed("classify")} multiline className="text-sm font-semibold" style={{ color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {ed("classify") && (
          <div>
            <AddButton label="Thêm loại khách" onClick={() => patch("classify", { items: [...classify.items, { name: "", tagline: "", description: "", action: "" }] })} />
          </div>
        )}
      </SectionShell>

      {/* 02 Tiêu chí */}
      <SectionShell
        id="sop-criteria"
        eyebrow={`Phần ${partNo("criteria")}`}
        title={criteria.title}
        onTitle={(v) => patch("criteria", { title: v })}
        intro={criteria.intro}
        onIntro={(v) => patch("criteria", { intro: v })}
        {...shell("criteria")}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold"
            style={{ background: `${TEAL}1f`, color: TEAL }}
          >
            Ngưỡng bid: ≥
            {ed("criteria") ? (
              <input
                type="number"
                min={1}
                max={maxScore}
                className="fk-sop-edit w-14 text-center"
                value={criteria.passScore}
                onChange={(e) => patch("criteria", { passScore: Math.max(0, Number(e.target.value) || 0) })}
              />
            ) : (
              <span className="tabular-nums">{criteria.passScore}</span>
            )}
            <span className="tabular-nums">/ {maxScore} điểm</span>
          </span>
          <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            Mỗi tiêu chí chấm 1–5 điểm
          </span>
        </div>

        <div className="overflow-x-auto rounded-[12px]" style={{ border: "1px solid var(--color-neutral-200)" }}>
          <table className="w-full min-w-[560px] text-sm border-collapse">
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                <th className="text-left font-semibold px-4 py-2.5 w-[36%]">Tiêu chí</th>
                <th className="text-left font-semibold px-4 py-2.5">Cách kiểm tra</th>
                <th className="text-center font-semibold px-4 py-2.5 w-20">Điểm</th>
              </tr>
            </thead>
            <tbody>
              {criteria.rows.map((row, i) => {
                const set = (v: Partial<typeof row>) => patch("criteria", { rows: setAt(criteria.rows, i, v) });
                return (
                  <tr key={i} style={{ background: i % 2 ? "var(--color-surface)" : "transparent", borderTop: "1px solid var(--color-neutral-200)" }}>
                    <td className="px-4 py-3 align-top">
                      <span className="flex items-center gap-3">
                        <Badge color={tone(i)} size={26}>
                          {LETTERS[i]}
                        </Badge>
                        <Field value={row.name} onChange={(v) => set({ name: v })} editing={ed("criteria")} className="font-semibold" />
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top" style={{ color: "var(--color-neutral-600)" }}>
                      <Field value={row.howToCheck} onChange={(v) => set({ howToCheck: v })} editing={ed("criteria")} multiline />
                    </td>
                    <td className="px-4 py-3 align-top text-center tabular-nums font-semibold" style={{ color: "var(--color-neutral-500)" }}>
                      <span className="inline-flex items-center gap-2">
                        1–5
                        {ed("criteria") && criteria.rows.length > 1 && (
                          <button
                            type="button"
                            className="text-xs font-bold"
                            style={{ color: "var(--status-red)" }}
                            aria-label="Xoá tiêu chí"
                            title="Xoá tiêu chí"
                            onClick={() => patch("criteria", { rows: removeAt(criteria.rows, i) })}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 text-sm flex gap-1.5" style={{ background: `${TEAL}14`, borderTop: "1px solid var(--color-neutral-200)" }}>
            <span className="font-semibold flex-none" style={{ color: TEAL }}>
              Lưu ý:
            </span>
            <Field value={criteria.note} onChange={(v) => patch("criteria", { note: v })} editing={ed("criteria")} multiline className="flex-1" />
          </div>
        </div>
        {ed("criteria") && (
          <div>
            <AddButton label="Thêm tiêu chí" onClick={() => patch("criteria", { rows: [...criteria.rows, { name: "", howToCheck: "" }] })} />
          </div>
        )}
      </SectionShell>

      {/* 03 Tên thật */}
      <SectionShell
        id="sop-real-name"
        eyebrow={`Phần ${partNo("realName")}`}
        title={realName.title}
        onTitle={(v) => patch("realName", { title: v })}
        intro={realName.intro}
        onIntro={(v) => patch("realName", { intro: v })}
        {...shell("realName")}
      >
        <StepCards
          steps={realName.steps}
          editing={ed("realName")}
          numbered
          onChange={(steps) => patch("realName", { steps })}
          addLabel="Thêm bước"
        />
        <div className="rounded-[12px] p-5 flex flex-col gap-2" style={{ background: NAVY, color: "#fff" }}>
          <Field
            value={realName.calloutTitle}
            onChange={(v) => patch("realName", { calloutTitle: v })}
            editing={ed("realName")}
            className="text-[11px] font-bold tracking-[0.14em] uppercase"
            style={{ color: GOLD }}
          />
          <Field value={realName.callout} onChange={(v) => patch("realName", { callout: v })} editing={ed("realName")} multiline className="text-sm leading-relaxed" />
          <span className="text-sm flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span style={{ color: "rgba(255,255,255,0.7)" }}>Mẫu an toàn:</span>
            <Field
              value={realName.safeGreeting}
              onChange={(v) => patch("realName", { safeGreeting: v })}
              editing={ed("realName")}
              className="font-semibold italic"
            />
          </span>
        </div>
      </SectionShell>

      {/* 04 Khung giờ */}
      <SectionShell
        id="sop-timing"
        eyebrow={`Phần ${partNo("timing")}`}
        title={timing.title}
        onTitle={(v) => patch("timing", { title: v })}
        intro={timing.intro}
        onIntro={(v) => patch("timing", { intro: v })}
        {...shell("timing")}
      >
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {timing.regions.map((r, i) => {
            const home = i === 0;
            const set = (v: Partial<typeof r>) => patch("timing", { regions: setAt(timing.regions, i, v) });
            return (
              <div
                key={i}
                className="relative rounded-[12px] p-3.5 flex flex-col items-center text-center gap-1.5"
                style={home ? { background: NAVY, color: "#fff" } : { border: "1px solid var(--color-neutral-200)" }}
              >
                {ed("timing") && timing.regions.length > 1 && (
                  <RemoveButton label="Xoá khu vực" onClick={() => patch("timing", { regions: removeAt(timing.regions, i) })} />
                )}
                <Badge color={home ? GOLD : tone(i)} size={38}>
                  {ed("timing") ? (
                    <input
                      className="fk-sop-edit w-9 text-center text-xs"
                      value={r.code}
                      maxLength={4}
                      onChange={(e) => set({ code: e.target.value })}
                      style={{ color: "#fff" }}
                    />
                  ) : (
                    <span className="text-xs">{r.code}</span>
                  )}
                </Badge>
                <Field value={r.name} onChange={(v) => set({ name: v })} editing={ed("timing")} className="text-sm font-bold" />
                <Field
                  value={r.role}
                  onChange={(v) => set({ role: v })}
                  editing={ed("timing")}
                  className="text-xs"
                  style={{ color: home ? "rgba(255,255,255,0.75)" : "var(--color-neutral-500)" }}
                />
                {(r.hours || ed("timing")) && (
                  <Field
                    value={r.hours}
                    onChange={(v) => set({ hours: v })}
                    editing={ed("timing")}
                    placeholder="Khung giờ gửi (giờ VN)"
                    className="text-xs font-semibold tabular-nums"
                    style={{ color: home ? GOLD : tone(i) }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {ed("timing") && (
          <div>
            <AddButton label="Thêm khu vực" onClick={() => patch("timing", { regions: [...timing.regions, { code: "", name: "", role: "Khách hàng", hours: "" }] })} />
          </div>
        )}
        <StepCards steps={timing.steps} editing={ed("timing")} onChange={(steps) => patch("timing", { steps })} addLabel="Thêm bước" columns={2} />
      </SectionShell>

      {/* 05 Cover letter */}
      <SectionShell
        id="sop-cover-letter"
        eyebrow={`Phần ${partNo("coverLetter")}`}
        title={coverLetter.title}
        onTitle={(v) => patch("coverLetter", { title: v })}
        intro={coverLetter.intro}
        onIntro={(v) => patch("coverLetter", { intro: v })}
        {...shell("coverLetter")}
      >
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr] items-start">
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {coverLetter.parts.map((part, i) => {
                const set = (v: Partial<SopStep>) => patch("coverLetter", { parts: setAt(coverLetter.parts, i, v) });
                return (
                  <div key={i} className="relative flex gap-3 rounded-[12px] p-4" style={{ border: "1px solid var(--color-neutral-200)" }}>
                    {ed("coverLetter") && coverLetter.parts.length > 1 && (
                      <RemoveButton label="Xoá thành phần" onClick={() => patch("coverLetter", { parts: removeAt(coverLetter.parts, i) })} />
                    )}
                    <Badge color={tone(i)}>{LETTERS[i]}</Badge>
                    <span className="flex flex-col gap-1 min-w-0 flex-1">
                      <Field value={part.title} onChange={(v) => set({ title: v })} editing={ed("coverLetter")} className="text-sm font-bold" />
                      <Field
                        value={part.description}
                        onChange={(v) => set({ description: v })}
                        editing={ed("coverLetter")}
                        multiline
                        className="text-sm"
                        style={{ color: "var(--color-neutral-600)" }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
            {ed("coverLetter") && (
              <div>
                <AddButton label="Thêm thành phần" onClick={() => patch("coverLetter", { parts: [...coverLetter.parts, { title: "", description: "" }] })} />
              </div>
            )}
          </div>
          <div className="rounded-[12px] p-5 flex flex-col gap-3" style={{ background: NAVY, color: "#fff" }}>
            <Field
              value={coverLetter.tipsTitle}
              onChange={(v) => patch("coverLetter", { tipsTitle: v })}
              editing={ed("coverLetter")}
              className="text-[11px] font-bold tracking-[0.14em] uppercase"
              style={{ color: GOLD }}
            />
            <ul className="flex flex-col gap-3">
              {coverLetter.tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed">
                  <span aria-hidden style={{ color: GOLD }}>
                    ●
                  </span>
                  <Field
                    value={tip}
                    onChange={(v) => patch("coverLetter", { tips: coverLetter.tips.map((t, k) => (k === i ? v : t)) })}
                    editing={ed("coverLetter")}
                    multiline
                    className="flex-1"
                  />
                  {ed("coverLetter") && (
                    <button
                      type="button"
                      className="text-xs font-bold flex-none"
                      aria-label="Xoá mẹo"
                      onClick={() => patch("coverLetter", { tips: removeAt(coverLetter.tips, i) })}
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {ed("coverLetter") && (
              <button
                type="button"
                className="text-xs font-semibold text-left"
                style={{ color: GOLD }}
                onClick={() => patch("coverLetter", { tips: [...coverLetter.tips, ""] })}
              >
                + Thêm mẹo
              </button>
            )}
          </div>
        </div>
      </SectionShell>

      {/* 06 Quyết định cuối */}
      <SectionShell
        id="sop-decision"
        eyebrow={`Phần ${partNo("decision")}`}
        title={decision.title}
        onTitle={(v) => patch("decision", { title: v })}
        intro={decision.intro}
        onIntro={(v) => patch("decision", { intro: v })}
        {...shell("decision")}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {decision.conditions.map((c, i) => (
            <div key={i} className="relative rounded-[12px] p-4 flex flex-col gap-2" style={{ border: "1px solid var(--color-neutral-200)" }}>
              {ed("decision") && decision.conditions.length > 1 && (
                <RemoveButton label="Xoá điều kiện" onClick={() => patch("decision", { conditions: removeAt(decision.conditions, i) })} />
              )}
              <span className="flex items-center gap-2">
                <Badge color={TEAL} size={22}>
                  ✓
                </Badge>
                <span className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
                  Điều kiện {i + 1}
                </span>
              </span>
              <Field
                value={c}
                onChange={(v) => patch("decision", { conditions: decision.conditions.map((x, k) => (k === i ? v : x)) })}
                editing={ed("decision")}
                multiline
                className="text-sm font-semibold"
              />
            </div>
          ))}
        </div>
        {ed("decision") && (
          <div>
            <AddButton label="Thêm điều kiện" onClick={() => patch("decision", { conditions: [...decision.conditions, ""] })} />
          </div>
        )}
        <Field
          value={decision.tiersIntro}
          onChange={(v) => patch("decision", { tiersIntro: v })}
          editing={ed("decision")}
          className="text-sm font-semibold"
          style={{ color: "var(--color-neutral-600)" }}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {decision.tiers.map((t, i) => {
            const color = i === 0 ? TEAL : i === 1 ? ORANGE : tone(i);
            const set = (v: Partial<typeof t>) => patch("decision", { tiers: setAt(decision.tiers, i, v) });
            return (
              <div key={i} className="relative rounded-[12px] p-5 flex flex-col gap-2" style={{ background: color, color: "#fff" }}>
                {ed("decision") && decision.tiers.length > 1 && (
                  <RemoveButton label="Xoá mức" onClick={() => patch("decision", { tiers: removeAt(decision.tiers, i) })} />
                )}
                <Field value={t.range} onChange={(v) => set({ range: v })} editing={ed("decision")} className="font-heading text-3xl font-bold leading-none" />
                <span className="text-[10px] font-bold tracking-[0.3em] opacity-80">CONNECTS</span>
                <Field value={t.title} onChange={(v) => set({ title: v })} editing={ed("decision")} className="text-base font-bold mt-1" />
                <Field value={t.description} onChange={(v) => set({ description: v })} editing={ed("decision")} multiline className="text-sm leading-relaxed opacity-95" />
              </div>
            );
          })}
        </div>
        {ed("decision") && (
          <div>
            <AddButton label="Thêm mức connects" onClick={() => patch("decision", { tiers: [...decision.tiers, { range: "", title: "", description: "" }] })} />
          </div>
        )}
      </SectionShell>

      {/* Kết */}
      <SectionShell {...shell("closing")}>
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <Field value={closing.title} onChange={(v) => patch("closing", { title: v })} editing={ed("closing")} className="font-heading text-2xl font-bold" style={{ color: NAVY }} />
          <div className="h-px w-12" style={{ background: ORANGE }} aria-hidden />
          <Field
            value={closing.text}
            onChange={(v) => patch("closing", { text: v })}
            editing={ed("closing")}
            multiline
            className="text-sm max-w-[60ch] leading-relaxed"
            style={{ color: "var(--color-neutral-600)" }}
          />
        </div>
      </SectionShell>
    </div>
  );
}

function StepCards({
  steps,
  editing,
  numbered,
  onChange,
  addLabel,
  columns = 3,
}: {
  steps: SopStep[];
  editing: boolean;
  numbered?: boolean;
  onChange: (steps: SopStep[]) => void;
  addLabel: string;
  columns?: 2 | 3;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`grid gap-3 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {steps.map((s, i) => (
          <div key={i} className="relative rounded-[12px] p-4 flex flex-col gap-2" style={{ border: "1px solid var(--color-neutral-200)" }}>
            {editing && steps.length > 1 && <RemoveButton label="Xoá bước" onClick={() => onChange(removeAt(steps, i))} />}
            <span className="flex items-center gap-2.5">
              {numbered && <Badge color={tone(i)}>{i + 1}</Badge>}
              <Field value={s.title} onChange={(v) => onChange(setAt(steps, i, { title: v }))} editing={editing} className="text-sm font-bold" style={numbered ? undefined : { color: tone(i) }} />
            </span>
            <Field
              value={s.description}
              onChange={(v) => onChange(setAt(steps, i, { description: v }))}
              editing={editing}
              multiline
              className="text-sm leading-relaxed"
              style={{ color: "var(--color-neutral-600)" }}
            />
          </div>
        ))}
      </div>
      {editing && (
        <div>
          <AddButton label={addLabel} onClick={() => onChange([...steps, { title: "", description: "" }])} />
        </div>
      )}
    </div>
  );
}
