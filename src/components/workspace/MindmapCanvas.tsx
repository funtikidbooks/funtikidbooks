"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import {
  createMindmapNode,
  deleteMindmapNode,
  getDraftNewsPosts,
  updateMindmapNode,
} from "@/lib/actions/mindmap";
import { updateNewsPost } from "@/lib/actions/admin";
import type { MindmapNode, MindmapProject, NewsPost } from "@/lib/types";

const NODE_W = 176;
const NODE_H = 56;
// Root node is stored at (0,0) — this offset just shifts that origin toward
// the middle of the scrollable canvas so branches have room to grow in
// every direction, not just down-right.
const OFFSET_X = 1300;
const OFFSET_Y = 950;
const CANVAS_W = 2800;
const CANVAS_H = 2000;
// Pulled from the site's own design tokens (globals.css :root) rather than
// picked hex values, so a branch's color always matches something already
// used elsewhere on the site — accent orange, accent-2 blue, and the
// status palette.
const COLORS = ["#FF7A3D", "#4FB3D9", "#3F9E52", "#9146A8", "#D6A400", "#78776F"];

type DraftPost = Pick<NewsPost, "id" | "title" | "excerpt" | "category" | "created_at">;

export function MindmapCanvas({
  project,
  initialNodes,
}: {
  project: MindmapProject;
  initialNodes: MindmapNode[];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPosts, setDraftPosts] = useState<DraftPost[] | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    longPressFired: boolean;
  } | null>(null);
  const draftsLoadedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideAddTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Desktop reveals the "+" (add branch) button on hover — pure CSS, no
  // state needed. Touch has no hover, so a long-press sets this instead;
  // see handlePointerDown/Move/Up below.
  const [touchAddVisibleId, setTouchAddVisibleId] = useState<string | null>(null);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  // The canvas is much bigger than any screen, and the root node sits at
  // the origin (0,0 → OFFSET_X/OFFSET_Y once rendered), not at the
  // scroll container's own (0,0) — without this, opening a project lands
  // on the canvas's empty top-left corner instead of the actual map,
  // especially on phone where there's no zoom-out to spot it by eye.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || nodes.length === 0) return;
    const cx = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length + OFFSET_X;
    const cy = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length + OFFSET_Y;
    el.scrollLeft = Math.max(0, cx - el.clientWidth / 2);
    el.scrollTop = Math.max(0, cy - el.clientHeight / 2);
    // Mount-only — this is a one-time "land on the map" scroll, not meant
    // to yank the view back to center every time a node moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A smooth horizontal S-curve (control points pulled toward the
  // midpoint on the x-axis) reads as a hand-drawn branch, the same
  // organic connector style NotebookLM/Xmind use, instead of a flat
  // ruler-straight line.
  const lines = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return nodes
      .filter((n) => n.parent_id)
      .map((n) => {
        const parent = byId.get(n.parent_id!);
        if (!parent) return null;
        const x1 = parent.x + OFFSET_X + NODE_W / 2;
        const y1 = parent.y + OFFSET_Y + NODE_H / 2;
        const x2 = n.x + OFFSET_X + NODE_W / 2;
        const y2 = n.y + OFFSET_Y + NODE_H / 2;
        const midX = (x1 + x2) / 2;
        return { id: n.id, d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`, color: n.color ?? project.color };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
  }, [nodes, project.color]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, node: MindmapNode) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: node.id, startX: e.clientX, startY: e.clientY, origX: node.x, origY: node.y, moved: false, longPressFired: false };

    if (e.pointerType === "touch") {
      longPressTimerRef.current = setTimeout(() => {
        const drag = dragRef.current;
        if (!drag || drag.id !== node.id || drag.moved) return;
        drag.longPressFired = true;
        setTouchAddVisibleId(node.id);
        if (hideAddTimerRef.current) clearTimeout(hideAddTimerRef.current);
        hideAddTimerRef.current = setTimeout(() => setTouchAddVisibleId((cur) => (cur === node.id ? null : cur)), 3000);
      }, 450);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      if (!drag.moved && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      drag.moved = true;
    }
    if (!drag.moved) return;
    setNodes((prev) => prev.map((n) => (n.id === drag.id ? { ...n, x: drag.origX + dx, y: drag.origY + dy } : n)));
  }, []);

  const openPanel = useCallback((id: string) => {
    setSelectedId(id);
    if (draftsLoadedRef.current) return;
    draftsLoadedRef.current = true;
    getDraftNewsPosts()
      .catch(() => [])
      .then(setDraftPosts);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (!drag) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      if (!drag.moved) {
        // The long-press already revealed the "+" button for this node —
        // this same press releasing shouldn't also open the edit panel.
        if (drag.longPressFired) return;
        openPanel(drag.id);
        return;
      }
      const node = nodes.find((n) => n.id === drag.id);
      if (node) updateMindmapNode(node.id, { x: node.x, y: node.y }).catch(() => {});
    },
    [nodes, openPanel],
  );

  async function addChild(parent: MindmapNode) {
    setTouchAddVisibleId(null);
    if (hideAddTimerRef.current) clearTimeout(hideAddTimerRef.current);
    const siblings = nodes.filter((n) => n.parent_id === parent.id).length;
    const created = await createMindmapNode({
      projectId: project.id,
      parentId: parent.id,
      title: "Nhánh mới",
      x: parent.x + 220,
      y: parent.y + siblings * 90,
    }).catch(() => null);
    if (created) setNodes((prev) => [...prev, created]);
  }

  async function saveNode(id: string, patch: { title?: string; note?: string | null; color?: string }) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    await updateMindmapNode(id, patch).catch(() => {});
  }

  async function linkDraft(id: string, postId: string | null) {
    const post = postId ? draftPosts?.find((p) => p.id === postId) ?? null : null;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, linked_news_post_id: postId, news_post: post ? { ...post, published: false } : null }
          : n,
      ),
    );
    await updateMindmapNode(id, { linkedNewsPostId: postId }).catch(() => {});
  }

  async function approveAndPublish(node: MindmapNode) {
    if (!node.linked_news_post_id) return;
    await updateNewsPost(node.linked_news_post_id, { published: true }).catch(() => {});
    setNodes((prev) =>
      prev.map((n) => (n.id === node.id && n.news_post ? { ...n, news_post: { ...n.news_post, published: true } } : n)),
    );
  }

  async function handleDeleteNode(id: string) {
    setConfirmDeleteId(null);
    setSelectedId(null);
    setNodes((prev) => {
      // Client-side mirror of the DB's on-delete-cascade so descendants
      // disappear immediately instead of lingering until a reload.
      const toRemove = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of prev) {
          if (n.parent_id && toRemove.has(n.parent_id) && !toRemove.has(n.id)) {
            toRemove.add(n.id);
            grew = true;
          }
        }
      }
      return prev.filter((n) => !toRemove.has(n.id));
    });
    await deleteMindmapNode(id).catch(() => {});
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex items-center gap-3 px-4 py-3 flex-none"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <Link href="/workspace/du-an" className="btn-icon flex-none" style={{ width: 30, height: 30, padding: 0 }} aria-label="Quay lại">
          ←
        </Link>
        <span className="font-bold text-base truncate">{project.title}</span>
        <span className="text-xs flex-none hidden sm:inline" style={{ color: "var(--color-neutral-500)" }}>
          {nodes.length} nhánh — kéo để sắp xếp, chạm để sửa, rê chuột/giữ vào một nhánh để thêm nhánh con
        </span>
      </div>

      <div ref={canvasRef} className="flex-1 min-h-0 overflow-auto" style={{ background: "var(--color-surface)" }}>
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
          <svg
            className="absolute inset-0 pointer-events-none"
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ zIndex: 0 }}
          >
            {lines.map((l) => (
              <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeWidth={2.5} strokeOpacity={0.5} strokeLinecap="round" />
            ))}
          </svg>

          {nodes.map((n) => {
            const isRoot = n.parent_id === null;
            const color = n.color ?? project.color;
            return (
              <div
                key={n.id}
                onPointerDown={(e) => handlePointerDown(e, n)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="fk-mindmap-node absolute card elev-sm flex flex-col justify-center gap-1 px-3 cursor-grab active:cursor-grabbing select-none"
                style={{
                  left: n.x + OFFSET_X,
                  top: n.y + OFFSET_Y,
                  width: NODE_W,
                  height: NODE_H,
                  zIndex: 1,
                  touchAction: "none",
                  borderLeft: `4px solid ${color}`,
                  boxShadow: isRoot ? `0 0 0 2px ${color}33` : undefined,
                }}
              >
                <span
                  className="text-[12.5px] leading-tight"
                  style={{
                    fontWeight: isRoot ? 800 : 600,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {n.title}
                </span>
                {(isRoot || n.linked_news_post_id || n.note) && (
                  <div className="flex items-center gap-1">
                    {isRoot && <span className="tag tag-accent" style={{ fontSize: 9, padding: "1px 6px" }}>Gốc</span>}
                    {n.linked_news_post_id && (
                      <span
                        className="tag"
                        style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          background: n.news_post?.published ? "var(--status-green-bg, #e4f4e6)" : "var(--color-neutral-100)",
                          color: n.news_post?.published ? "var(--status-green, #3f9e52)" : "var(--color-neutral-600)",
                        }}
                      >
                        {n.news_post?.published ? "Đã đăng" : "Bài nháp"}
                      </span>
                    )}
                    {n.note && !n.linked_news_post_id && (
                      <span className="tag tag-neutral" style={{ fontSize: 9, padding: "1px 6px" }}>
                        Ghi chú
                      </span>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  aria-label="Thêm nhánh con"
                  title="Thêm nhánh con"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    addChild(n);
                  }}
                  className={"fk-mindmap-node-add absolute flex items-center justify-center rounded-full font-bold" + (touchAddVisibleId === n.id ? " is-visible" : "")}
                  style={{
                    right: -12,
                    bottom: -12,
                    width: 28,
                    height: 28,
                    background: color,
                    color: "#fff",
                    fontSize: 16,
                    boxShadow: "var(--shadow-sm)",
                    zIndex: 2,
                  }}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <Modal onClose={() => setSelectedId(null)} maxWidth="90vw">
          <NodePanel
            key={selected.id}
            node={selected}
            isRoot={selected.parent_id === null}
            draftPosts={draftPosts ?? []}
            onSave={(patch) => saveNode(selected.id, patch)}
            onLinkDraft={(postId) => linkDraft(selected.id, postId)}
            onApprove={() => approveAndPublish(selected)}
            onDeleteRequest={() => setConfirmDeleteId(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        </Modal>
      )}

      {confirmDeleteId && (
        <Modal onClose={() => setConfirmDeleteId(null)} maxWidth={380}>
          <div className="p-5 flex flex-col gap-4">
            <span className="font-bold text-base">Xoá nhánh này?</span>
            <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
              Mọi nhánh con bên trong cũng sẽ bị xoá theo. Không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>
                Huỷ
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteNode(confirmDeleteId)}>
                Xoá
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NodePanel({
  node,
  isRoot,
  draftPosts,
  onSave,
  onLinkDraft,
  onApprove,
  onDeleteRequest,
  onClose,
}: {
  node: MindmapNode;
  isRoot: boolean;
  draftPosts: DraftPost[];
  onSave: (patch: { title?: string; note?: string | null; color?: string }) => void;
  onLinkDraft: (postId: string | null) => void;
  onApprove: () => void;
  onDeleteRequest: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [note, setNote] = useState(node.note ?? "");
  const [color, setColor] = useState(node.color ?? COLORS[0]);
  const [approving, setApproving] = useState(false);

  function save() {
    onSave({ title, note: note || null, color });
  }

  return (
    <div className="p-6 sm:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-xl">{isRoot ? "Gốc dự án" : "Nhánh"}</span>
        <button type="button" className="btn-icon" style={{ width: 32, height: 32, padding: 0 }} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Tên</span>
            <input
              className="input text-base"
              style={{ height: 44 }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={save}
              maxLength={100}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Ghi chú</span>
            <textarea
              className="input text-base"
              rows={7}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={save}
              maxLength={2000}
            />
          </label>

          <div className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Màu</span>
            <div className="flex gap-3">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    onSave({ color: c });
                  }}
                  className="rounded-full flex-none"
                  style={{
                    width: 32,
                    height: 32,
                    background: c,
                    border: color === c ? "3px solid var(--color-text)" : "3px solid transparent",
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Bài viết nháp gắn vào nhánh này</span>
          {node.linked_news_post_id ? (
            <div className="card p-4 flex flex-col gap-3" style={{ background: "var(--color-surface)" }}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-base leading-snug">{node.news_post?.title ?? "(Không có quyền xem bài này)"}</span>
                {node.news_post?.published ? (
                  <span
                    className="tag flex-none"
                    style={{ background: "var(--status-green-bg, #e4f4e6)", color: "var(--status-green, #3f9e52)" }}
                  >
                    Đã đăng
                  </span>
                ) : (
                  <span className="tag tag-neutral flex-none">Nháp</span>
                )}
              </div>
              {node.news_post?.excerpt && (
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-neutral-500)" }}>
                  {node.news_post.excerpt}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {node.news_post && !node.news_post.published && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={approving}
                    onClick={async () => {
                      setApproving(true);
                      await onApprove();
                      setApproving(false);
                    }}
                  >
                    {approving ? "Đang đăng…" : "✅ Duyệt & đăng"}
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onLinkDraft(null)}>
                  Bỏ liên kết
                </button>
              </div>
            </div>
          ) : draftPosts.length > 0 ? (
            <select
              className="input text-base"
              style={{ height: 44 }}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onLinkDraft(e.target.value);
              }}
            >
              <option value="" disabled>
                Chọn bài nháp…
              </option>
              {draftPosts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
              Không có bài nháp nào (hoặc bạn không có quyền xem bài chưa đăng).
            </p>
          )}
        </div>
      </div>

      {!isRoot && (
        <div className="flex justify-end pt-4" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
          <button type="button" className="btn btn-danger" onClick={onDeleteRequest}>
            Xoá nhánh
          </button>
        </div>
      )}
    </div>
  );
}
