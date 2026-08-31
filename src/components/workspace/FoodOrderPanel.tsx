"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deleteMyFoodOrderItem,
  getTodayFoodOrderRound,
  listFoodOrderItems,
  setFoodOrderRoundStatus,
  startFoodOrderRound,
  updateFoodOrderRoundLink,
  upsertMyFoodOrderItem,
} from "@/lib/actions/foodOrders";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { FoodOrderItem, FoodOrderRound, Profile } from "@/lib/types";

function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function Avatar({ profile }: { profile: Profile | undefined }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold overflow-hidden flex-none"
      style={{ width: 26, height: 26, fontSize: 11, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl(profile.avatar_url, 52)} alt="" className="w-full h-full object-cover" />
      ) : (
        (profile?.display_name ?? "?").charAt(0).toUpperCase()
      )}
    </span>
  );
}

// The "Đặt đồ ăn" room's group-order tool, pinned above the regular chat —
// one round per calendar day: everyone adds their own item, whoever places
// the real ShopeeFood order pastes the link back for the rest to see. The
// message thread right below still works exactly like any other room, for
// "quán này hết món rồi" back-and-forth that a structured order list can't
// capture.
export function FoodOrderPanel({
  channelId,
  currentUserId,
  profileById,
}: {
  channelId: string;
  currentUserId: string;
  profileById: Map<string, Profile>;
}) {
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState<FoodOrderRound | null>(null);
  const [items, setItems] = useState<FoodOrderItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [starting, setStarting] = useState(false);
  const [editingMine, setEditingMine] = useState(false);
  const [itemText, setItemText] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const [linkDraft, setLinkDraft] = useState("");
  const [editingLink, setEditingLink] = useState(false);
  const [savingLink, setSavingLink] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await getTodayFoodOrderRound(channelId);
        if (cancelled) return;
        setRound(r);
        if (r) {
          const list = await listFoodOrderItems(r.id);
          if (!cancelled) setItems(list);
        } else {
          setItems([]);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không thể tải đợt đặt đồ ăn.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Live for everyone looking at this room at once — the whole point of a
  // group order is seeing new items land without reloading.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`food-order-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "food_order_rounds" }, (payload) => {
        const isDelete = payload.eventType === "DELETE";
        const row = (isDelete ? payload.old : payload.new) as FoodOrderRound;
        if (row.channel_id !== channelId) return;
        setRound((prev) => {
          if (isDelete) return prev?.id === row.id ? null : prev;
          return row;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "food_order_items" }, (payload) => {
        const isDelete = payload.eventType === "DELETE";
        const row = (isDelete ? payload.old : payload.new) as FoodOrderItem;
        setItems((prev) => {
          if (isDelete) return prev.filter((it) => it.profile_id !== row.profile_id || it.round_id !== row.round_id);
          if (row.round_id !== (round?.id ?? row.round_id)) return prev;
          const idx = prev.findIndex((it) => it.profile_id === row.profile_id && it.round_id === row.round_id);
          return idx === -1 ? [...prev, row] : prev.map((it, i) => (i === idx ? row : it));
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // round.id intentionally excluded — resubscribing on every round change
    // would drop messages in the gap; the handlers above re-check the
    // current round via functional state updates instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const r = await startFoodOrderRound(channelId, { title: "Đặt đồ ăn" });
      setRound(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setStarting(false);
    }
  }

  const myItem = items.find((it) => it.profile_id === currentUserId);

  function openMyItemForm() {
    setItemText(myItem?.item_text ?? "");
    setNote(myItem?.note ?? "");
    setPrice(myItem?.price ?? "");
    setEditingMine(true);
  }

  async function submitMyItem(e: React.FormEvent) {
    e.preventDefault();
    if (!round || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertMyFoodOrderItem(round.id, { itemText, note, price: price === "" ? null : Number(price) });
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.profile_id === saved.profile_id);
        return idx === -1 ? [...prev, saved] : prev.map((it, i) => (i === idx ? saved : it));
      });
      setEditingMine(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMine() {
    if (!round) return;
    setItems((prev) => prev.filter((it) => it.profile_id !== currentUserId));
    try {
      await deleteMyFoodOrderItem(round.id);
    } catch {
      // best effort — a stale row will resync from the next realtime event
    }
  }

  async function saveLink() {
    if (!round || savingLink) return;
    setSavingLink(true);
    try {
      const updated = await updateFoodOrderRoundLink(round.id, linkDraft);
      setRound(updated);
      setEditingLink(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSavingLink(false);
    }
  }

  async function toggleStatus() {
    if (!round) return;
    try {
      const updated = await setFoodOrderRoundStatus(round.id, round.status === "open" ? "closed" : "open");
      setRound(updated);
    } catch {
      // no-op — button just stays clickable to retry
    }
  }

  const total = items.reduce((sum, it) => sum + (it.price ?? 0), 0);
  const hasPrices = items.some((it) => it.price !== null);
  const dateLabel = round
    ? new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }).format(
        new Date(`${round.order_date}T00:00:00`),
      )
    : "";

  if (loading) {
    return (
      <div className="flex-none px-4 py-3 text-xs" style={{ color: "var(--color-neutral-500)" }}>
        Đang tải đợt đặt đồ ăn…
      </div>
    );
  }

  return (
    <div
      className="flex-none flex flex-col gap-3 mx-3 mt-3 p-4 rounded-[14px]"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-neutral-200)" }}
    >
      {!round ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-bold">🍱 Chưa có ai bắt đầu đặt đồ ăn hôm nay</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
              Bắt đầu một đợt để mọi người thêm món của mình vào nhé.
            </div>
          </div>
          <button type="button" onClick={handleStart} className="btn btn-primary btn-sm flex-none" disabled={starting}>
            {starting ? "Đang bắt đầu…" : "Bắt đầu đặt đồ ăn hôm nay"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">🍱 {round.title}</span>
                <span
                  className="tag"
                  style={{
                    background: round.status === "open" ? "var(--color-accent-100)" : "var(--color-neutral-200)",
                    color: round.status === "open" ? "var(--color-accent-700)" : "var(--color-neutral-600)",
                  }}
                >
                  {round.status === "open" ? "Đang mở" : "Đã chốt"}
                </span>
              </div>
              <div className="text-xs mt-0.5 capitalize" style={{ color: "var(--color-neutral-500)" }}>
                {dateLabel} · {items.length} người đã đặt
                {hasPrices && ` · Tổng ${formatVnd(total)}`}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-none">
              <button type="button" onClick={toggleStatus} className="btn btn-ghost btn-sm">
                {round.status === "open" ? "Chốt đơn" : "Mở lại"}
              </button>
              {myItem ? (
                <button type="button" onClick={openMyItemForm} className="btn btn-secondary btn-sm">
                  Sửa đơn của tôi
                </button>
              ) : (
                round.status === "open" && (
                  <button type="button" onClick={openMyItemForm} className="btn btn-primary btn-sm">
                    + Thêm đơn của tôi
                  </button>
                )
              )}
            </div>
          </div>

          {round.shopee_link ? (
            <a
              href={round.shopee_link}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold w-fit"
              style={{ color: "var(--color-accent-700)" }}
            >
              🛵 Mở đơn ShopeeFood
            </a>
          ) : editingLink ? (
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                style={{ padding: "5px 8px", fontSize: 12 }}
                placeholder="Dán link đơn ShopeeFood…"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={saveLink} className="btn btn-secondary btn-sm" disabled={savingLink}>
                {savingLink ? "…" : "Lưu"}
              </button>
              <button type="button" onClick={() => setEditingLink(false)} className="btn btn-ghost btn-sm">
                Huỷ
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setLinkDraft("");
                setEditingLink(true);
              }}
              className="text-xs font-semibold w-fit"
              style={{ color: "var(--color-neutral-500)" }}
            >
              🔗 Dán link đơn ShopeeFood khi đã đặt
            </button>
          )}

          {items.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1">
              {items.map((it) => (
                <div key={it.profile_id} className="flex items-start gap-2 text-sm">
                  <Avatar profile={profileById.get(it.profile_id)} />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold">{profileById.get(it.profile_id)?.display_name ?? "?"}</span>
                    <span> — {it.item_text}</span>
                    {it.note && (
                      <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                        {" "}
                        ({it.note})
                      </span>
                    )}
                  </div>
                  {it.price !== null && <span className="text-xs font-semibold flex-none">{formatVnd(it.price)}</span>}
                  {it.profile_id === currentUserId && (
                    <button
                      type="button"
                      onClick={handleDeleteMine}
                      className="text-xs flex-none"
                      style={{ color: "var(--status-red, #c22)" }}
                      aria-label="Xoá đơn của tôi"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {editingMine && (
            <form onSubmit={submitMyItem} className="flex flex-col gap-2 pt-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 110px" }}>
                <input
                  className="input"
                  style={{ padding: "5px 8px", fontSize: 12 }}
                  placeholder="Món ăn / thức uống"
                  value={itemText}
                  onChange={(e) => setItemText(e.target.value)}
                  autoFocus
                />
                <input
                  className="input"
                  style={{ padding: "5px 8px", fontSize: 12 }}
                  placeholder="Ghi chú (VD: ít đường)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <input
                  type="number"
                  min={0}
                  className="input"
                  style={{ padding: "5px 8px", fontSize: 12 }}
                  placeholder="Giá (không bắt buộc)"
                  value={price}
                  onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button type="button" onClick={() => setEditingMine(false)} className="btn btn-ghost btn-sm" disabled={saving}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !itemText.trim()}>
                  {saving ? "Đang lưu…" : "Lưu"}
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {error && (
        <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
