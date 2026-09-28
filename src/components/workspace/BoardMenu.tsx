"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { BOARD_BACKGROUNDS, backgroundKey, boardBackground } from "@/lib/boardBackgrounds";
import { getBoardActivity, type BoardActivityItem } from "@/lib/actions/board";

// Trello's board menu (⋯ on the board bar): activity, background, archived
// cards, label names, shortcuts — in one place instead of a row of icons.
export function BoardMenu({
  boardColor,
  archivedCount,
  showLabelNames,
  onOpenActivity,
  onOpenArchive,
  onPickBackground,
  onToggleLabelNames,
  onOpenShortcuts,
  onClose,
}: {
  boardColor: string;
  archivedCount: number;
  showLabelNames: boolean;
  onOpenActivity: () => void;
  onOpenArchive: () => void;
  onPickBackground: (key: string) => void;
  onToggleLabelNames: () => void;
  onOpenShortcuts: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"main" | "background">("main");
  const current = boardBackground(boardColor).id;
  const item = "ws-nav-link text-left text-[13.5px] font-semibold px-3 py-2.5 rounded-[8px] flex items-center gap-2.5";
  const close = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="card elev-md fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[320px] z-40 flex flex-col p-1.5 overflow-y-auto"
        style={{ maxHeight: "75vh", color: "var(--color-text)" }}
        role="menu"
        aria-label="Menu bảng"
      >
        {view === "main" ? (
          <>
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-sm font-bold">Menu</span>
              <button type="button" className="btn-icon" style={{ width: 28, height: 28, padding: 0 }} onClick={onClose} aria-label="Đóng">
                ✕
              </button>
            </div>
            <button type="button" className={item} onClick={close(onOpenActivity)}>
              <span aria-hidden>≣</span> Hoạt động
            </button>
            <button type="button" className={item} onClick={close(onOpenArchive)}>
              <span aria-hidden>📦</span> Thẻ đã lưu trữ
              {archivedCount > 0 && (
                <span className="ml-auto text-[12px] font-normal tabular-nums" style={{ color: "var(--color-neutral-500)" }}>
                  {archivedCount}
                </span>
              )}
            </button>
            <button type="button" className={item} onClick={() => setView("background")}>
              <span
                className="inline-block rounded-[4px] flex-none"
                style={{ width: 22, height: 16, background: boardBackground(boardColor).css, border: "1px solid var(--color-neutral-300)" }}
                aria-hidden
              />
              Đổi hình nền
            </button>
            <button type="button" className={item} onClick={onToggleLabelNames}>
              <span aria-hidden>🏷</span> {showLabelNames ? "Thu gọn nhãn (chỉ hiện màu)" : "Hiện tên nhãn trên thẻ"}
            </button>
            <button type="button" className={`${item} hidden lg:flex`} onClick={close(onOpenShortcuts)}>
              <span aria-hidden>⌨</span> Phím tắt
            </button>
          </>
        ) : (
          <>
            <button type="button" className={item} style={{ color: "var(--color-neutral-500)" }} onClick={() => setView("main")}>
              ← Đổi hình nền
            </button>
            <div className="grid grid-cols-2 gap-2 p-2">
              {BOARD_BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onPickBackground(backgroundKey(b.id))}
                  className="relative rounded-[8px] h-16 flex items-end p-1.5 text-[12px] font-bold"
                  style={{
                    background: b.css,
                    color: b.plain ? "var(--color-text)" : "#fff",
                    border: b.plain ? "1px solid var(--color-neutral-300)" : "none",
                    outline: current === b.id ? "2.5px solid var(--color-accent-500)" : "none",
                    outlineOffset: 2,
                  }}
                  aria-pressed={current === b.id}
                >
                  <span style={b.plain ? undefined : { textShadow: "0 1px 2px rgba(0,0,0,.45)" }}>{b.name}</span>
                  {current === b.id && (
                    <span className="absolute top-1.5 right-2" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="px-3 pb-2 text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
              Cả nhóm đều thấy hình nền này.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
}

function describe(a: BoardActivityItem) {
  const m = a.metadata ?? {};
  switch (a.type) {
    case "created":
      return "đã tạo thẻ";
    case "moved":
      return `đã chuyển thẻ từ ${m.from ?? "?"} sang ${m.to ?? "?"}`;
    case "assigned":
      return `đã giao thẻ cho ${m.name ?? ""}`;
    case "attached":
      return `đã đính kèm "${m.filename ?? ""}" vào`;
    case "link_added":
      return `đã thêm liên kết "${m.label ?? ""}" vào`;
    case "due_complete":
      return "đã đánh dấu hoàn thành";
    case "due_incomplete":
      return "đã bỏ dấu hoàn thành ở";
    default:
      return "đã cập nhật";
  }
}

// "Hoạt động" of the whole board: moves, files, completions and comments on
// every card, newest first; tap one to open its card.
export function BoardActivityPanel({
  boardId,
  onOpenTask,
  onClose,
}: {
  boardId: string;
  onOpenTask: (taskId: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<BoardActivityItem[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getBoardActivity(boardId)
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  return (
    <Modal onClose={onClose} maxWidth={560} sheetOnPhone>
      <div className="flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-5 pb-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <h2 className="text-lg flex-1">≣ Hoạt động của bảng</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="flex flex-col px-5 py-3">
          {error ? (
            <p className="text-sm py-4" style={{ color: "var(--color-neutral-500)" }}>
              Không tải được hoạt động. Thử lại sau.
            </p>
          ) : items === null ? (
            <p className="text-sm py-4" style={{ color: "var(--color-neutral-500)" }}>
              Đang tải…
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm py-4" style={{ color: "var(--color-neutral-500)" }}>
              Chưa có hoạt động nào.
            </p>
          ) : (
            items.map((a) => (
              <button
                key={`${a.kind}-${a.id}`}
                type="button"
                onClick={() => onOpenTask(a.task.id)}
                className="ws-nav-link text-left flex gap-3 py-2.5 px-2 -mx-2 rounded-[8px]"
              >
                <span
                  className="flex items-center justify-center rounded-full font-bold flex-none"
                  style={{ width: 30, height: 30, fontSize: 12, background: "var(--color-accent-100)", color: "var(--color-accent-700)" }}
                >
                  {a.actor.charAt(0).toUpperCase()}
                </span>
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-[13.5px] leading-snug">
                    <b>{a.actor}</b> {a.kind === "comment" ? "đã bình luận ở" : describe(a)} <b>{a.task.title}</b>
                  </span>
                  {a.kind === "comment" && a.text && (
                    <span
                      className="text-[13px] rounded-[8px] px-2.5 py-1.5 line-clamp-3"
                      style={{ background: "var(--color-surface)", color: "var(--color-neutral-700)" }}
                    >
                      {a.text}
                    </span>
                  )}
                  <span className="text-[11.5px]" style={{ color: "var(--color-neutral-500)" }}>
                    {ago(a.created_at)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
