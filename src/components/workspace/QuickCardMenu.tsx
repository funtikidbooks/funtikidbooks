"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BoardColumn, BoardLabel, Profile, TaskWithAssignee } from "@/lib/types";
import { taskLink } from "@/lib/boardTools";

// Trello's quick card editor (✎ on a card, right-click, or E over a card):
// the everyday changes without opening the card. Sub-lists (labels,
// members, move) replace the main list in place, so it also fits a phone.
type View = "main" | "labels" | "members" | "move";

export function QuickCardMenu({
  task,
  at,
  columns,
  boardLabels,
  profiles,
  onOpen,
  onToggleLabel,
  onToggleMember,
  onMove,
  onToggleDue,
  onCopy,
  onArchive,
  onClose,
}: {
  task: TaskWithAssignee;
  at: { x: number; y: number };
  columns: BoardColumn[];
  boardLabels: BoardLabel[];
  profiles: Profile[];
  onOpen: () => void;
  onToggleLabel: (labelId: string) => void;
  onToggleMember: (profile: Profile) => void;
  onMove: (columnId: string) => void;
  onToggleDue: () => void;
  onCopy: () => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("main");
  const [linkCopied, setLinkCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });

  // Keep the whole menu on screen, whichever corner it was opened from.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pad = 8;
    setPos({
      left: Math.max(pad, Math.min(at.x - (at.x + w > window.innerWidth - pad ? w : 0), window.innerWidth - w - pad)),
      top: Math.max(pad, Math.min(at.y, window.innerHeight - h - pad)),
    });
  }, [at.x, at.y, view]);

  const item = "ws-nav-link text-left text-[13px] font-semibold px-2.5 py-2 rounded-[6px] flex items-center gap-2";
  const back = (label: string) => (
    <button type="button" className={item} style={{ color: "var(--color-neutral-500)" }} onClick={() => setView("main")}>
      ← {label}
    </button>
  );

  async function copyLink() {
    const url = taskLink(window.location.origin, task.code);
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(onClose, 700);
    } catch {
      prompt("Sao chép liên kết thẻ:", url);
      onClose();
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div
        ref={boxRef}
        className="card elev-md fixed z-[71] flex flex-col p-1 overflow-y-auto"
        style={{ left: pos.left, top: pos.top, width: 248, maxHeight: "min(70vh, 460px)" }}
        role="menu"
        aria-label={`Sửa nhanh thẻ ${task.code}`}
      >
        {view === "main" && (
          <>
            <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] truncate" style={{ color: "var(--color-neutral-500)" }} title={task.title}>
              {task.code} · {task.title}
            </div>
            <button type="button" className={item} onClick={() => (onClose(), onOpen())}>
              ↗ Mở thẻ
            </button>
            <button type="button" className={item} onClick={() => setView("labels")}>
              🏷 Nhãn…
            </button>
            <button type="button" className={item} onClick={() => setView("members")}>
              👤 Thành viên…
            </button>
            <button type="button" className={item} onClick={() => setView("move")}>
              ➜ Chuyển sang danh sách…
            </button>
            {task.due_date && (
              <button type="button" className={item} onClick={() => (onToggleDue(), onClose())}>
                {task.due_complete ? "↺ Bỏ dấu hoàn tất hạn" : "☑ Đánh dấu hoàn tất hạn"}
              </button>
            )}
            <div className="my-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }} />
            <button type="button" className={item} onClick={copyLink}>
              {linkCopied ? "✓ Đã chép liên kết" : "🔗 Sao chép liên kết"}
            </button>
            <button type="button" className={item} onClick={() => (onCopy(), onClose())}>
              ⧉ Sao chép thẻ
            </button>
            <button type="button" className={item} onClick={() => (onArchive(), onClose())}>
              📦 Lưu trữ thẻ
            </button>
          </>
        )}

        {view === "labels" && (
          <>
            {back("Nhãn")}
            {boardLabels.length === 0 && (
              <p className="px-2.5 py-2 text-[12.5px]" style={{ color: "var(--color-neutral-500)" }}>
                Bảng chưa có nhãn — mở thẻ để tạo nhãn.
              </p>
            )}
            {boardLabels.map((l) => (
              <button key={l.id} type="button" className={item} onClick={() => onToggleLabel(l.id)}>
                <span className="flex-1 min-w-0 rounded-[4px] px-2 py-1 text-[12px] font-bold truncate" style={{ background: l.color, color: "#fff" }}>
                  {l.name || " "}
                </span>
                <span className="w-4 text-center flex-none" aria-hidden>
                  {task.labels.includes(l.id) ? "✓" : ""}
                </span>
              </button>
            ))}
          </>
        )}

        {view === "members" && (
          <>
            {back("Thành viên")}
            {profiles.map((p) => (
              <button key={p.id} type="button" className={item} onClick={() => onToggleMember(p)}>
                <span
                  className="flex items-center justify-center rounded-full font-bold flex-none"
                  style={{ width: 22, height: 22, fontSize: 10, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
                >
                  {p.display_name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{p.display_name}</span>
                <span className="w-4 text-center flex-none" aria-hidden>
                  {task.assignees.some((a) => a.id === p.id) ? "✓" : ""}
                </span>
              </button>
            ))}
          </>
        )}

        {view === "move" && (
          <>
            {back("Chuyển sang (lên đầu danh sách)")}
            {columns.map((c) => (
              <button
                key={c.id}
                type="button"
                className={item}
                disabled={c.id === task.column_id}
                style={c.id === task.column_id ? { opacity: 0.5 } : undefined}
                onClick={() => (onMove(c.id), onClose())}
              >
                <span className="flex-1 truncate">{c.title}</span>
                {c.id === task.column_id && <span className="text-[11px] font-normal">đang ở đây</span>}
              </button>
            ))}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
