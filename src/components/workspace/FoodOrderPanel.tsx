"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  addShopToRound,
  deleteFoodOrderRound,
  deleteMyFoodOrderItem,
  listFoodOrderItems,
  listRoundShopIds,
  listTodayFoodOrderRounds,
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

function NewShopForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (shop: FoodShop) => void;
}) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [items, setItems] = useState<NewShopItemDraft[]>([{ name: "", note: "", price: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasItem = items.some((it) => it.name.trim());

  function addRow() {
    setItems((prev) => [...prev, { name: "", note: "", price: "" }]);
  }
  function updateRow(i: number, patch: Partial<NewShopItemDraft>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeRow(i: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await addFoodShop({
        name,
        shopeeLink: link,
        items: items
          .filter((it) => it.name.trim())
          .map((it) => ({ name: it.name, note: it.note, price: it.price === "" ? null : Number(it.price) })),
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 pt-1" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="input"
          style={{ padding: "6px 8px", fontSize: 13 }}
          placeholder="Tên quán"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          className="input"
          style={{ padding: "6px 8px", fontSize: 13 }}
          placeholder="Link ShopeeFood (không bắt buộc)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </div>
      <span className="text-[11px] font-bold tracking-[0.06em]" style={{ color: "var(--color-neutral-500)" }}>
        MENU
      </span>
      <div className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <div key={i} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: "1fr 1fr 100px 28px" }}>
            <input
              className="input"
              style={{ padding: "5px 8px", fontSize: 12 }}
              placeholder="Tên món"
              value={it.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
            />
            <input
              className="input"
              style={{ padding: "5px 8px", fontSize: 12 }}
              placeholder="Ghi chú"
              value={it.note}
              onChange={(e) => updateRow(i, { note: e.target.value })}
            />
            <input
              type="number"
              min={0}
              className="input"
              style={{ padding: "5px 8px", fontSize: 12 }}
              placeholder="Giá"
              value={it.price}
              onChange={(e) => updateRow(i, { price: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="btn-icon"
              style={{ width: 26, height: 26, padding: 0, fontSize: 12 }}
              aria-label="Xoá món"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow} className="btn btn-ghost btn-sm w-fit">
        + Thêm món
      </button>
      {error && (
        <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm" disabled={saving}>
          Huỷ
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim() || !hasItem}>
          {saving ? "Đang lưu…" : "Lưu quán"}
        </button>
      </div>
    </form>
  );
}

// One order round's own card — items, its active quán menus, "my order",
// the ShopeeFood link, chốt/mở lại, xoá. Lives inside FoodOrderPanel, one
// per round the room has today (there can be several — lunch, then a
// separate afternoon trà sữa round).
function FoodOrderRoundCard({
  round,
  shops,
  currentUserId,
  profileById,
  onDeleted,
  onShopCreated,
}: {
  round: FoodOrderRound;
  shops: FoodShop[];
  currentUserId: string;
  profileById: Map<string, Profile>;
  onDeleted: (roundId: string) => void;
  onShopCreated: (shop: FoodShop) => void;
}) {
  // No local mirror of `round` — the parent's own food_order_rounds
  // realtime subscription already updates this prop (including the echo
  // of this card's own status/link changes), so re-deriving a copy here
  // would just be a second source of truth to keep in sync.
  const [items, setItems] = useState<FoodOrderItem[]>([]);
  const [roundShopIds, setRoundShopIds] = useState<Set<string>>(new Set());
  const [shopMenus, setShopMenus] = useState<Map<string, FoodShopMenuItem[]>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [addExistingShopId, setAddExistingShopId] = useState("");
  const [addingExistingShop, setAddingExistingShop] = useState(false);
  const [showAddShop, setShowAddShop] = useState(false);

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
      try {
        const [list, shopIds] = await Promise.all([listFoodOrderItems(round.id), listRoundShopIds(round.id)]);
        if (cancelled) return;
        setItems(list);
        setRoundShopIds(new Set(shopIds));
        const entries = await Promise.all(shopIds.map(async (id) => [id, await getFoodShopMenu(id)] as const));
        if (!cancelled) setShopMenus(new Map(entries));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Không thể tải đợt này.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [round.id]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`food-order-round-${round.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "food_order_items", filter: `round_id=eq.${round.id}` }, (payload) => {
        const isDelete = payload.eventType === "DELETE";
        const row = (isDelete ? payload.old : payload.new) as FoodOrderItem;
        setItems((prev) => {
          if (isDelete) return prev.filter((it) => it.profile_id !== row.profile_id);
          const idx = prev.findIndex((it) => it.profile_id === row.profile_id);
          return idx === -1 ? [...prev, row] : prev.map((it, i) => (i === idx ? row : it));
        });
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "food_order_round_shops", filter: `round_id=eq.${round.id}` },
        (payload) => {
          const row = payload.new as { shop_id: string };
          setRoundShopIds((prev) => new Set(prev).add(row.shop_id));
          getFoodShopMenu(row.shop_id)
            .then((menu) => setShopMenus((prev) => new Map(prev).set(row.shop_id, menu)))
            .catch(() => {});
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "food_order_round_shops", filter: `round_id=eq.${round.id}` },
        (payload) => {
          const row = payload.old as { shop_id: string };
          setRoundShopIds((prev) => {
            const next = new Set(prev);
            next.delete(row.shop_id);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [round.id]);

  const myItem = items.find((it) => it.profile_id === currentUserId);
  const allActiveMenuItems = Array.from(roundShopIds).flatMap((id) => shopMenus.get(id) ?? []);
  const activeShopNames = Array.from(roundShopIds)
    .map((id) => shops.find((s) => s.id === id)?.name)
    .filter((n): n is string => !!n);
  const shopsNotInRound = shops.filter((s) => !roundShopIds.has(s.id));
  const total = items.reduce((sum, it) => sum + (it.price ?? 0), 0);
  const hasPrices = items.some((it) => it.price !== null);

  async function handleAddExistingShopToRound() {
    if (!addExistingShopId || addingExistingShop) return;
    setAddingExistingShop(true);
    setError(null);
    try {
      await addShopToRound(round.id, addExistingShopId);
      const menu = await getFoodShopMenu(addExistingShopId);
      setRoundShopIds((prev) => new Set(prev).add(addExistingShopId));
      setShopMenus((prev) => new Map(prev).set(addExistingShopId, menu));
      setAddExistingShopId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setAddingExistingShop(false);
    }
  }

  async function handleNewShopCreated(shop: FoodShop) {
    onShopCreated(shop);
    setShowAddShop(false);
    try {
      await addShopToRound(round.id, shop.id);
      const menu = await getFoodShopMenu(shop.id);
      setRoundShopIds((prev) => new Set(prev).add(shop.id));
      setShopMenus((prev) => new Map(prev).set(shop.id, menu));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    }
  }

  // Reconstructs which menu checkboxes were selected from a previously
  // saved item_text ("Phở tái, Chén Trứng") — reliable since submitMyItem
  // below always joins names with ", " in the first place.
  function openMyItemForm() {
    if (allActiveMenuItems.length > 0) {
      const parts = (myItem?.item_text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const menuNames = new Set(allActiveMenuItems.map((m) => m.name));
      setCheckedItemIds(new Set(allActiveMenuItems.filter((m) => parts.includes(m.name)).map((m) => m.id)));
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
    if (saving) return;

    let itemText: string;
    let price: number | null;
    if (allActiveMenuItems.length > 0) {
      const chosen = allActiveMenuItems.filter((m) => checkedItemIds.has(m.id));
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
    setItems((prev) => prev.filter((it) => it.profile_id !== currentUserId));
    try {
      await deleteMyFoodOrderItem(round.id);
    } catch {
      // best effort — a stale row will resync from the next realtime event
    }
  }

  async function saveLink() {
    if (savingLink) return;
    setSavingLink(true);
    try {
      await updateFoodOrderRoundLink(round.id, linkDraft);
      setEditingLink(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSavingLink(false);
    }
  }

  async function toggleStatus() {
    try {
      await setFoodOrderRoundStatus(round.id, round.status === "open" ? "closed" : "open");
    } catch {
      // no-op — button just stays clickable to retry
    }
  }

  async function handleDeleteRound() {
    if (!confirm("Xoá đợt này?")) return;
    try {
      await deleteFoodOrderRound(round.id);
      onDeleted(round.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    }
  }

  const dateLabel = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }).format(
    new Date(`${round.order_date}T00:00:00`),
  );

  return (
    <div
      className="flex-none flex flex-col gap-3 mx-3 p-4 rounded-[14px]"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-neutral-200)" }}
    >
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
            {activeShopNames.length > 0 && ` · ${activeShopNames.join(", ")}`} · {items.length} người đã đặt
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
              title="Xoá đợt này"
            >
              Xoá đợt
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

      {round.status === "open" && shopsNotInRound.length > 0 && !showAddShop && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="input"
            style={{ padding: "5px 8px", fontSize: 12, maxWidth: 220 }}
            value={addExistingShopId}
            onChange={(e) => setAddExistingShopId(e.target.value)}
          >
            <option value="">+ Thêm quán khác vào đợt này…</option>
            {shopsNotInRound.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {addExistingShopId && (
            <button type="button" onClick={handleAddExistingShopToRound} className="btn btn-ghost btn-sm" disabled={addingExistingShop}>
              {addingExistingShop ? "…" : "Thêm"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddShop(true)}
            className="text-xs font-semibold"
            style={{ color: "var(--color-neutral-500)" }}
          >
            hoặc + Thêm quán mới
          </button>
        </div>
      )}

      {showAddShop && <NewShopForm onCancel={() => setShowAddShop(false)} onCreated={handleNewShopCreated} />}

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
          {allActiveMenuItems.length > 0 ? (
            <>
              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                {Array.from(roundShopIds).map((shopId) => {
                  const menu = shopMenus.get(shopId) ?? [];
                  if (menu.length === 0) return null;
                  const shopLabel = shops.find((s) => s.id === shopId)?.name ?? "Quán";
                  return (
                    <div key={shopId} className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold tracking-[0.04em]" style={{ color: "var(--color-neutral-500)" }}>
                        {shopLabel.toUpperCase()}
                      </span>
                      {menu.map((m) => (
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
                  );
                })}
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

      {error && (
        <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// The "Đặt đồ ăn" room's group-order tool, pinned above the regular chat.
// Several rounds can exist the same day (lunch, then a separate afternoon
// trà sữa round) — each renders as its own FoodOrderRoundCard below the
// "start a new round" prompt, which stays available regardless of whether
// today already has one. The message thread right below still works
// exactly like any other room, for "quán này hết món rồi" back-and-forth a
// structured order list can't capture.
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
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<FoodShop[]>([]);
  const [rounds, setRounds] = useState<FoodOrderRound[]>([]);

  const [selectedShopIds, setSelectedShopIds] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [showAddShop, setShowAddShop] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [shopList, roundList] = await Promise.all([listFoodShops(), listTodayFoodOrderRounds(channelId)]);
        if (cancelled) return;
        setShops(shopList);
        setRounds(roundList);
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

  // Live for everyone looking at this room at once — a new round someone
  // else started (or chốt/xoá) shows up without reloading.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`food-order-rounds-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "food_order_rounds", filter: `channel_id=eq.${channelId}` }, (payload) => {
        const isDelete = payload.eventType === "DELETE";
        const row = (isDelete ? payload.old : payload.new) as FoodOrderRound;
        setRounds((prev) => {
          if (isDelete) return prev.filter((r) => r.id !== row.id);
          const idx = prev.findIndex((r) => r.id === row.id);
          return idx === -1 ? [...prev, row] : prev.map((r, i) => (i === idx ? row : r));
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  function toggleSelectedShop(id: string) {
    setSelectedShopIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const shopIds = Array.from(selectedShopIds);
      const r = await startFoodOrderRound(channelId, { title: "Đặt đồ ăn", shopIds });
      setRounds((prev) => [...prev, r]);
      setSelectedShopIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setStarting(false);
    }
  }

  function handleShopCreated(shop: FoodShop) {
    setShops((prev) => [...prev, shop].sort((a, b) => a.name.localeCompare(b.name, "vi")));
  }

  if (loading) {
    return (
      <div className="flex-none px-4 py-3 text-xs" style={{ color: "var(--color-neutral-500)" }}>
        Đang tải đợt đặt đồ ăn…
      </div>
    );
  }

  return (
    <div className="flex-none flex flex-col gap-3 mt-3">
      <div
        className="flex flex-col gap-3 mx-3 p-4 rounded-[14px]"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-neutral-200)" }}
      >
        <div>
          <div className="text-sm font-bold">🍱 Đặt đồ ăn</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--color-neutral-500)" }}>
            {rounds.length > 0
              ? "Muốn đặt thêm một đợt riêng (VD: trà sữa buổi chiều)? Tạo đợt mới bên dưới."
              : "Chọn một hoặc nhiều quán đã lưu sẵn menu (VD: cơm ở quán A, trà sữa ở quán B), hoặc bắt đầu không cần chọn quán."}
          </div>
        </div>

        {!showAddShop && (
          <div className="flex flex-col gap-2">
            {shops.length > 0 && (
              <div className="flex flex-col gap-1">
                {shops.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedShopIds.has(s.id)} onChange={() => toggleSelectedShop(s.id)} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={handleStart} className="btn btn-primary btn-sm flex-none" disabled={starting}>
                {starting
                  ? "Đang bắt đầu…"
                  : selectedShopIds.size > 0
                    ? `Tạo đợt mới (${selectedShopIds.size} quán)`
                    : rounds.length > 0
                      ? "Tạo đợt mới không cần chọn quán"
                      : "Bắt đầu không cần chọn quán"}
              </button>
              <button type="button" onClick={() => setShowAddShop(true)} className="btn btn-ghost btn-sm flex-none">
                + Thêm quán mới
              </button>
            </div>
          </div>
        )}

        {showAddShop && (
          <NewShopForm
            onCancel={() => setShowAddShop(false)}
            onCreated={(shop) => {
              handleShopCreated(shop);
              setSelectedShopIds((prev) => new Set(prev).add(shop.id));
              setShowAddShop(false);
            }}
          />
        )}

        {error && (
          <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
      </div>

      {rounds.map((r) => (
        <FoodOrderRoundCard
          key={r.id}
          round={r}
          shops={shops}
          currentUserId={currentUserId}
          profileById={profileById}
          onDeleted={(id) => setRounds((prev) => prev.filter((x) => x.id !== id))}
          onShopCreated={handleShopCreated}
        />
      ))}
    </div>
  );
}
