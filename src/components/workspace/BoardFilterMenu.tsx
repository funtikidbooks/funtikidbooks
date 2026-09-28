"use client";

import type { BoardLabel, Profile } from "@/lib/types";
import { EMPTY_FILTER, type BoardFilter, type DueFilter } from "@/lib/boardTools";

// Trello's "Lọc thẻ" panel: members, labels, due date. The search text
// lives in the board bar; everything here combines with it.

const DUE_OPTIONS: { id: DueFilter; label: string }[] = [
  { id: "any", label: "Tất cả" },
  { id: "overdue", label: "🔴 Quá hạn" },
  { id: "week", label: "🟠 Tới hạn trong 7 ngày" },
  { id: "none", label: "Chưa có hạn chót" },
  { id: "complete", label: "✓ Đã hoàn thành" },
  { id: "incomplete", label: "Chưa hoàn thành" },
];

export function BoardFilterMenu({
  filter,
  onChange,
  profiles,
  labels,
  currentUserId,
  onClose,
}: {
  filter: BoardFilter;
  onChange: (f: BoardFilter) => void;
  profiles: Profile[];
  labels: BoardLabel[];
  currentUserId: string;
  onClose: () => void;
}) {
  const toggle = (key: "members" | "labels", id: string) =>
    onChange({ ...filter, [key]: filter[key].includes(id) ? filter[key].filter((x) => x !== id) : [...filter[key], id] });

  const row = "flex items-center gap-2.5 px-2 py-1.5 rounded-[6px] text-[13px] cursor-pointer ws-nav-link";
  const head = "text-[11px] font-bold tracking-[0.06em] uppercase px-2 pt-2 pb-1";

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        // Phone: a sheet pinned 12px from both edges under the bar;
        // sm and up: a dropdown under the button.
        className="card elev-md fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[320px] z-40 flex flex-col p-2 overflow-y-auto"
        style={{ maxHeight: "70vh" }}
        role="dialog"
        aria-label="Lọc thẻ"
      >
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-sm font-bold">Lọc thẻ</span>
          <button type="button" className="btn-icon" style={{ width: 28, height: 28, padding: 0 }} onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className={head} style={{ color: "var(--color-neutral-500)" }}>
          Thành viên
        </div>
        <label className={row}>
          <input type="checkbox" checked={filter.members.includes(currentUserId)} onChange={() => toggle("members", currentUserId)} />
          <span className="font-semibold">👤 Thẻ của tôi</span>
          <span className="ml-auto text-[11px]" style={{ color: "var(--color-neutral-400)" }}>
            phím Q
          </span>
        </label>
        <label className={row}>
          <input type="checkbox" checked={filter.members.includes("none")} onChange={() => toggle("members", "none")} />
          <span style={{ color: "var(--color-neutral-600)" }}>Chưa giao cho ai</span>
        </label>
        {profiles.filter((p) => p.id !== currentUserId).map((p) => (
          <label key={p.id} className={row}>
            <input type="checkbox" checked={filter.members.includes(p.id)} onChange={() => toggle("members", p.id)} />
            <span
              className="flex items-center justify-center rounded-full font-bold flex-none"
              style={{ width: 22, height: 22, fontSize: 10, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
            >
              {p.display_name.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{p.display_name}</span>
          </label>
        ))}

        {labels.length > 0 && (
          <>
            <div className={head} style={{ color: "var(--color-neutral-500)" }}>
              Nhãn
            </div>
            {labels.map((l) => (
              <label key={l.id} className={row}>
                <input type="checkbox" checked={filter.labels.includes(l.id)} onChange={() => toggle("labels", l.id)} />
                <span className="rounded-[4px] px-2 py-0.5 text-[12px] font-bold truncate" style={{ background: l.color, color: "#fff" }}>
                  {l.name}
                </span>
              </label>
            ))}
          </>
        )}

        <div className={head} style={{ color: "var(--color-neutral-500)" }}>
          Hạn chót · hoàn thành
        </div>
        {DUE_OPTIONS.map((o) => (
          <label key={o.id} className={row}>
            <input type="radio" name="due-filter" checked={filter.due === o.id} onChange={() => onChange({ ...filter, due: o.id })} />
            <span>{o.label}</span>
          </label>
        ))}

        <button type="button" className="btn btn-ghost btn-sm mt-2 self-start" onClick={() => onChange(EMPTY_FILTER)}>
          Xoá bộ lọc
        </button>
      </div>
    </>
  );
}
