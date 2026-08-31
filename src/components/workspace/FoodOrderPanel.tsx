"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deleteFoodOrderRound,
  deleteMyFoodOrderItem,
  getTodayFoodOrderRound,
  listFoodOrderItems,
  setFoodOrderRoundStatus,
  startFoodOrderRound,
  updateFoodOrderRoundLink,
  upsertMyFoodOrderItem,
} from "@/lib/actions/foodOrders";
import { addFoodShop, getFoodShopMenu, listFoodShops } from "@/lib/actions/foodShops";
import { thumbnailUrl } from "@/lib/imageTransform";
import type { FoodOrderItem, FoodOrderRound, FoodShop, FoodShopMenuItem, Profile } from "@/lib/types";

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

type NewShopItemDraft = { name: string; note: string; price: string };

// The "Đặt đồ ăn" room's group-order tool, pinned above the regular chat —
// one round per calendar day: everyone adds their own item, whoever places
// the real ShopeeFood order pastes the link back for the rest to see. The
// message thread right below still works exactly like any other room, for
// "quán này hết món rồi" back-and-forth that a structured order list can't
// capture.
//
// A round can optionally point at a saved food_shops entry (its menu read
// off a real ShopeeFood page once, by hand) — when it does, "my order"
// becomes a checklist against that menu instead of free-typing.
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

  const [shops, setShops] = useState<FoodShop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [starting, setStarting] = useState(false);
  const [showAddShop, setShowAddShop] = useState(false);
  const [newShopName, setNewShopName] = useState("");
  const [newShopLink, setNewShopLink] = useState("");
  const [newShopItems, setNewShopItems] = useState<NewShopItemDraft[]>([{ name: "", note: "", price: "" }]);
  const [addingShop, setAddingShop] = useState(false);

  const [shopMenu, setShopMenu] = useState<FoodShopMenuItem[]>([]);
  const [editingMine, setEditingMine] = useState(false);
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());
  const [extraText, setExtraText] = useState("");
  const [freeItemText, setFreeItemText] = useState("");
  const [note, setNote] = useState("");
  const [freePrice, setFreePrice] = useState<number | "">("");
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
        const [r, shopList] = await Promise.all([getTodayFoodOrderRound(channelId), listFoodShops()]);
        if (cancelled) return;
        setRound(r);
        setShops(shopList);
        if (r) {
          const [list, menu] = await Promise.all([
            listFoodOrderItems(r.id),
            r.shop_id ? getFoodShopMenu(r.shop_id) : Promise.resolve([]),
          ]);
          if (!cancelled) {
            setItems(list);
            setShopMenu(menu);
          }
        } else {
          setItems([]);
          setShopMenu([]);
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
      const r = await startFoodOrderRound(channelId, { title: "Đặt đồ ăn", shopId: selectedShopId || null });
      setRound(r);
      setShopMenu(r.shop_id ? await getFoodShopMenu(r.shop_id) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setStarting(false);
    }
  }

  function addNewShopItemRow() {
    setNewShopItems((prev) => [...prev, { name: "", note: "", price: "" }]);
  }

  function updateNewShopItemRow(i: number, patch: Partial<NewShopItemDraft>) {
    setNewShopItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeNewShopItemRow(i: number) {
    setNewShopItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function submitNewShop(e: React.FormEvent) {
    e.preventDefault();
    if (addingShop) return;
    setAddingShop(true);
    setError(null);
    try {
      const created = await addFoodShop({
        name: newShopName,
        shopeeLink: newShopLink,
        items: newShopItems
          .filter((it) => it.name.trim())
          .map((it) => ({ name: it.name, note: it.note, price: it.price === "" ? null : Number(it.price) })),
      });
      setShops((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "vi")));
      setSelectedShopId(created.id);
      setShowAddShop(false);
      setNewShopName("");
      setNewShopLink("");
      setNewShopItems([{ name: "", note: "", price: "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setAddingShop(false);
    }
  }

  const myItem = items.find((it) => it.profile_id === currentUserId);

  // Reconstructs which menu checkboxes were selected from a previously
  // saved item_text ("Phở tái, Chén Trứng") — reliable since submitMyItem
  // below always joins names with ", " in the first place.
  function openMyItemForm() {
    if (round?.shop_id) {
      const parts = (myItem?.item_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const menuNames = new Set(shopMenu.map((m) => m.name));
      setCheckedItemIds(new Set(shopMenu.filter((m) => parts.includes(m.name)).map((m) => m.id)));
      setExtraText(parts.filter((p) => !menuNames.has(p)).join(", "));
    } else {
      setFreeItemText(myItem?.item_text ?? "");
      setFreePrice(myItem?.price ?? "");
    }
    setNote(myItem?.note ?? "");
    setEditingMine(true);
  }

  function toggleChecked(id: string) {
    setCheckedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitMyItem(e: React.FormEvent) {
    e.preventDefault();
    if (!round || saving) return;

    let itemText: string;
    let price: number | null;
    if (round.shop_id) {
      const chosen = shopMenu.filter((m) => checkedItemIds.has(m.id));
      const names = [...chosen.map((m) => m.name), ...(extraText.trim() ? [extraText.trim()] : [])];
      itemText = names.join(", ");
      price = chosen.reduce((sum, m) => sum + (m.price ?? 0), 0);
    } else {
      itemText = freeItemText;
      price = freePrice === "" ? null : Number(freePrice);
    }
    if (!itemText.trim()) {
      setError("Cần chọn hoặc nhập ít nhất 1 món.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved = await upsertMyFoodOrderItem(round.id, { itemText, note, price });
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

  async function handleDeleteRound() {
    if (!round) return;
    if (!confirm("Xoá đợt đặt đồ ăn hôm nay và làm lại từ đầu?")) return;
    try {
      await deleteFoodOrderRound(round.id);
      setRound(null);
      setItems([]);
      setShopMenu([]);
      setSelectedShopId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    }
  }

  const total = items.reduce((sum, it) => sum + (it.price ?? 0), 0);
  const hasPrices = items.some((it) => it.price !== null);
  const dateLabel = round
    ? new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }).format(
        new Date(`${round.order_date}T00:00:00`),
      )
    : "";
  const shopName = round?.shop_id ? shops.find((s) => s.id === round.shop_id)?.name : null;

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
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-sm font-bold">🍱 Chưa có ai bắt đầu đặt đồ ăn hôm nay</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
              Chọn một quán đã lưu sẵn menu, hoặc bắt đầu không cần chọn quán.
            </div>
          </div>

          {!showAddShop && (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="input flex-1"
                style={{ padding: "6px 8px", fontSize: 13, minWidth: 180 }}
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
              >
                <option value="">— Không chọn quán (tự gõ món) —</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleStart} className="btn btn-primary btn-sm flex-none" disabled={starting}>
                {starting ? "Đang bắt đầu…" : "Bắt đầu đặt đồ ăn"}
              </button>
              <button type="button" onClick={() => setShowAddShop(true)} className="btn btn-ghost btn-sm flex-none">
                + Thêm quán mới
              </button>
            </div>
          )}

          {showAddShop && (
            <form onSubmit={submitNewShop} className="flex flex-col gap-2 pt-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="input"
                  style={{ padding: "6px 8px", fontSize: 13 }}
                  placeholder="Tên quán"
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  autoFocus
                />
                <input
                  className="input"
                  style={{ padding: "6px 8px", fontSize: 13 }}
                  placeholder="Link ShopeeFood (không bắt buộc)"
                  value={newShopLink}
                  onChange={(e) => setNewShopLink(e.target.value)}
                />
              </div>
              <span className="text-[11px] font-bold tracking-[0.06em]" style={{ color: "var(--color-neutral-500)" }}>
                MENU
              </span>
              <div className="flex flex-col gap-1.5">
                {newShopItems.map((it, i) => (
                  <div key={i} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: "1fr 1fr 100px 28px" }}>
                    <input
                      className="input"
                      style={{ padding: "5px 8px", fontSize: 12 }}
                      placeholder="Tên món"
                      value={it.name}
                      onChange={(e) => updateNewShopItemRow(i, { name: e.target.value })}
                    />
                    <input
                      className="input"
                      style={{ padding: "5px 8px", fontSize: 12 }}
                      placeholder="Ghi chú"
                      value={it.note}
                      onChange={(e) => updateNewShopItemRow(i, { note: e.target.value })}
                    />
                    <input
                      type="number"
                      min={0}
                      className="input"
                      style={{ padding: "5px 8px", fontSize: 12 }}
                      placeholder="Giá"
                      value={it.price}
                      onChange={(e) => updateNewShopItemRow(i, { price: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeNewShopItemRow(i)}
                      className="btn-icon"
                      style={{ width: 26, height: 26, padding: 0, fontSize: 12 }}
                      aria-label="Xoá món"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addNewShopItemRow} className="btn btn-ghost btn-sm w-fit">
                + Thêm món
              </button>
              <div className="flex items-center gap-2 justify-end">
                <button type="button" onClick={() => setShowAddShop(false)} className="btn btn-ghost btn-sm" disabled={addingShop}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={addingShop || !newShopName.trim()}>
                  {addingShop ? "Đang lưu…" : "Lưu quán"}
                </button>
              </div>
            </form>
          )}
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
                {dateLabel}
                {shopName && ` · ${shopName}`} · {items.length} người đã đặt
                {hasPrices && ` · Tổng ${formatVnd(total)}`}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-none">
              {round.created_by === currentUserId && (
                <button
                  type="button"
                  onClick={handleDeleteRound}
                  className="text-xs"
                  style={{ color: "var(--color-neutral-400)" }}
                  title="Xoá đợt, bắt đầu lại"
                >
                  Xoá đợt, làm lại
                </button>
              )}
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
              {round.shop_id ? (
                <>
                  <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1">
                    {shopMenu.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={checkedItemIds.has(m.id)} onChange={() => toggleChecked(m.id)} />
                        <span className="flex-1">
                          {m.name}
                          {m.note && (
                            <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                              {" "}
                              ({m.note})
                            </span>
                          )}
                        </span>
                        {m.price !== null && <span className="text-xs font-semibold flex-none">{formatVnd(m.price)}</span>}
                      </label>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      className="input"
                      style={{ padding: "5px 8px", fontSize: 12 }}
                      placeholder="Món khác ngoài menu (không bắt buộc)"
                      value={extraText}
                      onChange={(e) => setExtraText(e.target.value)}
                    />
                    <input
                      className="input"
                      style={{ padding: "5px 8px", fontSize: 12 }}
                      placeholder="Ghi chú (VD: ít đường, không hành)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 110px" }}>
                  <input
                    className="input"
                    style={{ padding: "5px 8px", fontSize: 12 }}
                    placeholder="Món ăn / thức uống"
                    value={freeItemText}
                    onChange={(e) => setFreeItemText(e.target.value)}
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
                    value={freePrice}
                    onChange={(e) => setFreePrice(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              )}
              <div className="flex items-center gap-2 justify-end">
                <button type="button" onClick={() => setEditingMine(false)} className="btn btn-ghost btn-sm" disabled={saving}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
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
