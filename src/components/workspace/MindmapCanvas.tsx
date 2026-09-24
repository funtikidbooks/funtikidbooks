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
import { getNewsPostById, updateNewsPost } from "@/lib/actions/admin";
import { NewsEditDialog } from "@/components/admin/NewsEditDialog";
import type { MindmapNode, MindmapProject, NewsPost } from "@/lib/types";

// NODE_H is the header row's height, used for every node — it doubles as
// the connector-line's y-anchor regardless of how tall a card grows below
// it (list items only add height downward, never move the header).
const NODE_H = 56;
// Every node uses this same card shape now — header + optional list-item
// rows + "+ Thêm bài" — so there's one width for the whole canvas, not a
// separate compact size for a "plain" branch.
const LIST_W = 224;
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
  // Full post being edited in NewsEditDialog (text + images) — separate
  // from the node's own partial news_post preview, which only ever carries
  // title/excerpt/category/published, not content or a cover image.
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [loadingEditFor, setLoadingEditFor] = useState<string | null>(null);

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

  // Children of a list-mode node are "absorbed" — rendered as rows inside
  // their parent's own card instead of as separate draggable boxes, so
  // they're excluded from both the connector-line pass and the normal
  // node-rendering pass below.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, MindmapNode[]>();
    for (const n of nodes) {
      if (!n.parent_id) continue;
      const list = map.get(n.parent_id);
      if (list) list.push(n);
      else map.set(n.parent_id, [n]);
    }
    return map;
  }, [nodes]);
  // A child renders as a row inside its own parent's card purely based on
  // its own is_list_item flag — no separate per-parent mode needed, since
  // every node already shows the same "+ Thêm bài" control.
  const absorbedIds = useMemo(() => new Set(nodes.filter((n) => n.is_list_item).map((n) => n.id)), [nodes]);

  // Counts every descendant (children, grandchildren, ...) so the delete
  // confirmation can warn specifically when there's something to lose —
  // a leaf branch and a branch with 8 nested items underneath shouldn't
  // get the same casual "Xoá nhánh này?".
  function countDescendants(id: string): number {
    let count = 0;
    for (const child of childrenByParent.get(id) ?? []) {
      count += 1 + countDescendants(child.id);
    }
    return count;
  }

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
      .filter((n) => n.parent_id && !absorbedIds.has(n.id))
      .map((n) => {
        const parent = byId.get(n.parent_id!);
        if (!parent) return null;
        const x1 = parent.x + OFFSET_X + LIST_W / 2;
        const y1 = parent.y + OFFSET_Y + NODE_H / 2;
        const x2 = n.x + OFFSET_X + LIST_W / 2;
        const y2 = n.y + OFFSET_Y + NODE_H / 2;
        const midX = (x1 + x2) / 2;
        return { id: n.id, d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`, color: n.color ?? project.color };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
  }, [nodes, project.color, absorbedIds]);

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

  async function addChild(parent: MindmapNode, asListItem = false) {
    setTouchAddVisibleId(null);
    if (hideAddTimerRef.current) clearTimeout(hideAddTimerRef.current);
    const siblings = nodes.filter((n) => n.parent_id === parent.id).length;
    const created = await createMindmapNode({
      projectId: project.id,
      parentId: parent.id,
      title: asListItem ? "Bài mới" : "Nhánh mới",
      x: parent.x + 220,
      y: parent.y + siblings * 90,
      isListItem: asListItem,
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

  async function openPostEditor(node: MindmapNode) {
    if (!node.linked_news_post_id) return;
    setLoadingEditFor(node.id);
    const post = await getNewsPostById(node.linked_news_post_id).catch(() => null);
    setLoadingEditFor(null);
    if (!post) return;
    setEditingNodeId(node.id);
    setEditingPost(post);
  }

  function closePostEditor() {
    setEditingPost(null);
    setEditingNodeId(null);
  }

  function handlePostUpdated(_id: string, updated: NewsPost) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === editingNodeId
          ? { ...n, news_post: { id: updated.id, title: updated.title, excerpt: updated.excerpt, category: updated.category, published: updated.published, created_at: updated.created_at } }
          : n,
      ),
    );
    closePostEditor();
  }

  function handlePostDeletedFromEditor(deletedId: string) {
    setNodes((prev) =>
      prev.map((n) => (n.linked_news_post_id === deletedId ? { ...n, linked_news_post_id: null, news_post: null } : n)),
    );
    if (editingNodeId) updateMindmapNode(editingNodeId, { linkedNewsPostId: null }).catch(() => {});
    closePostEditor();
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

          {nodes
            .filter((n) => !absorbedIds.has(n.id))
            .map((n) => {
            const isRoot = n.parent_id === null;
            const color = n.color ?? project.color;

            const listItems = (childrenByParent.get(n.id) ?? []).filter((c) => c.is_list_item);
            return (
              <div
                key={n.id}
                className="fk-mindmap-node absolute card elev-sm flex flex-col select-none"
                style={{
                  left: n.x + OFFSET_X,
                  top: n.y + OFFSET_Y,
                  width: LIST_W,
                  zIndex: 1,
                  borderLeft: `4px solid ${color}`,
                  boxShadow: isRoot ? `0 0 0 2px ${color}33` : undefined,
                }}
              >
                <div
                  onPointerDown={(e) => handlePointerDown(e, n)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="flex flex-col justify-center gap-1 px-3 cursor-grab active:cursor-grabbing"
                  style={{ minHeight: NODE_H, paddingTop: 8, paddingBottom: 8, touchAction: "none" }}
                >
                  <span
                    className="text-[12.5px] leading-tight"
                    style={{
                      fontWeight: isRoot ? 800 : 700,
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
                </div>

                {listItems.length > 0 && (
                  <div className="flex flex-col">
                    {listItems.map((child) => (
                      <div
                        key={child.id}
                        onClick={() => openPanel(child.id)}
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                        style={{ borderTop: "1px solid var(--color-neutral-200)" }}
                      >
                        <span
                          className="flex-1 text-[12px] leading-tight"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {child.title}
                        </span>
                        {child.linked_news_post_id && (
                          <span
                            className="tag flex-none"
                            style={{
                              fontSize: 9,
                              padding: "1px 6px",
                              background: child.news_post?.published ? "var(--status-green-bg, #e4f4e6)" : "var(--color-neutral-100)",
                              color: child.news_post?.published ? "var(--status-green, #3f9e52)" : "var(--color-neutral-600)",
                            }}
                          >
                            {child.news_post?.published ? "Đã đăng" : "Bài nháp"}
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label="Xoá bài"
                          title="Xoá bài"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(child.id);
                          }}
                          className="btn-icon flex-none"
                          style={{ width: 22, height: 22, padding: 0, color: "var(--color-neutral-400)" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Always available on every node — adds a row INSIDE this
                    same card (a list item), distinct from the corner "+"
                    below which grows a genuinely separate branch (its own
                    box + connector line). */}
                <button
                  type="button"
                  onClick={() => addChild(n, true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold"
                  style={{ borderTop: "1px solid var(--color-neutral-200)", color }}
                >
                  + Thêm bài
                </button>

                <button
                  type="button"
                  aria-label="Thêm nhánh mới"
                  title="Thêm nhánh mới"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    addChild(n);
                  }}
                  className={"fk-mindmap-node-action absolute flex items-center justify-center rounded-full font-bold" + (touchAddVisibleId === n.id ? " is-visible" : "")}
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

                {!isRoot && (
                  <button
                    type="button"
                    aria-label="Xoá nhánh"
                    title="Xoá nhánh"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(n.id);
                    }}
                    className={"fk-mindmap-node-action absolute flex items-center justify-center rounded-full font-bold" + (touchAddVisibleId === n.id ? " is-visible" : "")}
                    style={{
                      right: -12,
                      top: -12,
                      width: 24,
                      height: 24,
                      background: "var(--status-red)",
                      color: "#fff",
                      fontSize: 13,
                      boxShadow: "var(--shadow-sm)",
                      zIndex: 2,
                    }}
                  >
                    ✕
                  </button>
                )}
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
            onEditPost={() => openPostEditor(selected)}
            editingPost={loadingEditFor === selected.id}
            onDeleteRequest={() => setConfirmDeleteId(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        </Modal>
      )}

      {editingPost && (
        <NewsEditDialog
          post={editingPost}
          onClose={closePostEditor}
          onCreated={() => {}}
          onUpdated={handlePostUpdated}
          onDeleted={handlePostDeletedFromEditor}
        />
      )}

      {confirmDeleteId &&
        (() => {
          const descendantCount = countDescendants(confirmDeleteId);
          const hasChildren = descendantCount > 0;
          return (
            <Modal onClose={() => setConfirmDeleteId(null)} maxWidth={380}>
              <div className="p-5 flex flex-col gap-4">
                <span className="font-bold text-base">
                  {hasChildren ? "Nhánh này có nhánh con bên trong" : "Xoá nhánh này?"}
                </span>
                <p className="text-sm" style={{ color: "var(--color-neutral-500)" }}>
                  {hasChildren
                    ? `Nhánh này đang có ${descendantCount} nhánh con bên trong — xoá sẽ mất hết luôn, không chỉ riêng nhánh này. Không thể hoàn tác.`
                    : "Không thể hoàn tác."}
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>
                    Huỷ
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteNode(confirmDeleteId)}>
                    {hasChildren ? `Xoá cả ${descendantCount + 1} nhánh` : "Xoá"}
                  </button>
                </div>
              </div>
            </Modal>
          );
        })()}
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
  onEditPost,
  editingPost,
  onDeleteRequest,
  onClose,
}: {
  node: MindmapNode;
  isRoot: boolean;
  draftPosts: DraftPost[];
  onSave: (patch: { title?: string; note?: string | null; color?: string }) => void;
  onLinkDraft: (postId: string | null) => void;
  onApprove: () => void;
  onEditPost: () => void;
  editingPost: boolean;
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
                {node.news_post && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={editingPost} onClick={onEditPost}>
                    {editingPost ? "Đang mở…" : "✏️ Chỉnh sửa nội dung"}
                  </button>
                )}
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
