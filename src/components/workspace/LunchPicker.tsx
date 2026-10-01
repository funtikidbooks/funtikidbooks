"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { listLunchData, saveFoodShopDetails, type FoodShopDetailsInput } from "@/lib/actions/foodShops";
import {
  LUNCH_BUDGETS,
  LUNCH_NEEDS,
  LUNCH_THEMES,
  directionsLink,
  filterLunch,
  formatK,
  telLink,
  type LunchBudgetId,
  type LunchFilters,
  type LunchMatch,
  type LunchNeedId,
  type LunchThemeId,
} from "@/lib/lunch";
import type { FoodShop, FoodShopMenuItem } from "@/lib/types";

// "Trưa nay ăn gì?" — not a game: tick what you feel like (chủ đề), what it
// may cost, what matters today (near, open now, delivered, vegetarian…),
// and the matching quán are listed with their address on the map, a call
// button, the online order link, and "Đặt chung hôm nay" to start the
// room's group order with it. Anyone can add a quán or fill in its details.

const FILTERS_KEY = "funti-lunch-filters";

function chipStyle(on: boolean) {
  return {
    background: on ? "var(--color-accent-500)" : "var(--color-panel)",
    color: on ? "#fff" : "var(--color-text)",
    boxShadow: on ? "none" : "inset 0 0 0 1px var(--color-neutral-200)",
  };
}

function readSavedFilters(): LunchFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (raw) {
      const f = JSON.parse(raw) as LunchFilters;
      return { themes: f.themes ?? [], budget: f.budget ?? null, needs: f.needs ?? [] };
    }
  } catch {
    // ignore
  }
  return { themes: [], budget: null, needs: [] };
}

export function LunchPicker({
  onClose,
  onOrderTogether,
  onShopSaved,
  initial,
}: {
  onClose: () => void;
  // Already-loaded library (skips the fetch) — e.g. a preview.
  initial?: { shops: FoodShop[]; items: FoodShopMenuItem[]; lastOrdered: Record<string, string> };
  // Starts today's group order in the room with this quán.
  onOrderTogether: (shopId: string) => Promise<void>;
  onShopSaved: (shop: FoodShop) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<FoodShop[]>([]);
  const [items, setItems] = useState<FoodShopMenuItem[]>([]);
  const [lastOrdered, setLastOrdered] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<LunchFilters>({ themes: [], budget: null, needs: [] });
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<FoodShop | "new" | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(readSavedFilters());
    const load = initial ? Promise.resolve(initial) : listLunchData();
    load
      .then((d) => {
        setShops(d.shops);
        setItems(d.items);
        setLastOrdered(d.lastOrdered);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Không tải được danh sách quán."))
      .finally(() => setLoading(false));
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
    // Loads once when the picker opens; `initial` is read only then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: LunchFilters) {
    setFilters(next);
    setPicked(null);
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const menus = useMemo(() => {
    const m = new Map<string, FoodShopMenuItem[]>();
    for (const it of items) m.set(it.shop_id, [...(m.get(it.shop_id) ?? []), it]);
    return m;
  }, [items]);
  const last = useMemo(() => new Map(Object.entries(lastOrdered)), [lastOrdered]);
  const matches = useMemo(() => filterLunch(shops, menus, filters, now, last), [shops, menus, filters, now, last]);
  const themeCount = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of shops) for (const t of s.themes ?? []) c.set(t, (c.get(t) ?? 0) + 1);
    return c;
  }, [shops]);
  const shown = picked ? [...matches.filter((m) => m.shop.id === picked), ...matches.filter((m) => m.shop.id !== picked)] : matches;
  const active = filters.themes.length + filters.needs.length + (filters.budget ? 1 : 0);

  function pickOne() {
    if (matches.length === 0) return;
    const pool = matches.length > 1 && picked ? matches.filter((m) => m.shop.id !== picked) : matches;
    setPicked(pool[Math.floor(Math.random() * pool.length)].shop.id);
  }

  async function orderTogether(shopId: string) {
    setOrdering(shopId);
    try {
      await onOrderTogether(shopId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được đợt đặt.");
    } finally {
      setOrdering(null);
    }
  }

  function saved(shop: FoodShop) {
    setShops((prev) => {
      const i = prev.findIndex((s) => s.id === shop.id);
      return (i === -1 ? [...prev, shop] : prev.map((s) => (s.id === shop.id ? shop : s))).sort((a, b) => a.name.localeCompare(b.name, "vi"));
    });
    onShopSaved(shop);
    setEditing(null);
  }

  return (
    <Modal onClose={onClose} maxWidth={980} sheetOnPhone>
      <div className="flex flex-col h-full sm:max-h-[88vh] lg:h-[86vh] min-h-0">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 flex-none" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg">🍽 Trưa nay ăn gì?</h2>
            <p className="text-[12.5px]" style={{ color: "var(--color-neutral-500)" }}>
              Tick những gì bạn muốn — quán phù hợp hiện bên dưới, kèm bản đồ và số điện thoại.
            </p>
          </div>
          <button type="button" className="btn-icon flex-none" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        {editing ? (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            <ShopDetailsForm shop={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={saved} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
            {/* ------------------------------------------------ CHECKLISTS */}
            <div className="flex flex-col gap-4 px-4 sm:px-6 py-4 lg:overflow-y-auto" style={{ borderRight: "1px solid var(--color-neutral-200)" }}>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-[12px] font-bold tracking-[0.06em] uppercase mb-1.5" style={{ color: "var(--color-neutral-500)" }}>
                  Chủ đề
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {LUNCH_THEMES.map((t) => {
                    const on = filters.themes.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update({ ...filters, themes: toggle<LunchThemeId>(filters.themes, t.id) })}
                        className="rounded-full px-3 py-1.5 text-[13px] font-semibold"
                        style={chipStyle(on)}
                      >
                        {t.icon} {t.label}
                        <span className="ml-1 text-[11px] opacity-70">{themeCount.get(t.id) ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="text-[12px] font-bold tracking-[0.06em] uppercase mb-1.5" style={{ color: "var(--color-neutral-500)" }}>
                  Giá mỗi món
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {LUNCH_BUDGETS.map((b) => {
                    const on = filters.budget === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => update({ ...filters, budget: on ? null : (b.id as LunchBudgetId) })}
                        className="rounded-full px-3 py-1.5 text-[13px] font-semibold"
                        style={chipStyle(on)}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-1">
                <legend className="text-[12px] font-bold tracking-[0.06em] uppercase mb-1.5" style={{ color: "var(--color-neutral-500)" }}>
                  Yêu cầu
                </legend>
                {LUNCH_NEEDS.map((n) => (
                  <label key={n.id} className="flex items-center gap-2.5 text-[14px] py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 flex-none"
                      checked={filters.needs.includes(n.id)}
                      onChange={() => update({ ...filters, needs: toggle<LunchNeedId>(filters.needs, n.id) })}
                    />
                    {n.label}
                  </label>
                ))}
              </fieldset>

              {active > 0 && (
                <button type="button" className="text-[13px] font-semibold w-fit hover:underline" style={{ color: "var(--color-accent-700)" }} onClick={() => update({ themes: [], budget: null, needs: [] })}>
                  Bỏ hết lọc ({active})
                </button>
              )}
            </div>

            {/* --------------------------------------------------- RESULTS */}
            <div className="flex flex-col gap-3 px-4 sm:px-6 py-4 lg:overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-bold">{loading ? "Đang tải…" : `${matches.length} quán phù hợp`}</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={pickOne} disabled={matches.length === 0}>
                    {picked ? "Gợi ý quán khác" : "Chọn giúp 1 quán"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing("new")}>
                    + Thêm quán
                  </button>
                </div>
              </div>
              {error && (
                <p className="text-[13px] font-semibold" style={{ color: "var(--status-red)" }}>
                  {error}
                </p>
              )}

              {!loading && matches.length === 0 && (
                <div className="rounded-[14px] p-5 text-[14px] leading-relaxed" style={{ background: "var(--color-surface)", color: "var(--color-neutral-600)" }}>
                  Chưa có quán nào khớp hết các điều kiện. Bỏ bớt một vài ô, hoặc <b>+ Thêm quán</b> bạn biết quanh văn phòng để lần sau ai cũng chọn được.
                </div>
              )}

              {shown.map((m) => (
                <ShopCard
                  key={m.shop.id}
                  m={m}
                  picked={m.shop.id === picked}
                  lastOrdered={lastOrdered[m.shop.id] ?? null}
                  budget={filters.budget}
                  ordering={ordering === m.shop.id}
                  onOrder={() => orderTogether(m.shop.id)}
                  onEdit={() => setEditing(m.shop)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ShopCard({
  m,
  picked,
  lastOrdered,
  budget,
  ordering,
  onOrder,
  onEdit,
}: {
  m: LunchMatch;
  picked: boolean;
  lastOrdered: string | null;
  budget: LunchBudgetId | null;
  ordering: boolean;
  onOrder: () => void;
  onEdit: () => void;
}) {
  const { shop, items, price, open } = m;
  const b = budget ? LUNCH_BUDGETS.find((x) => x.id === budget) : null;
  const dishes = items
    .filter((i) => !b || (typeof i.price === "number" && i.price >= b.min && i.price < b.max))
    .slice(0, 4);
  const themes = LUNCH_THEMES.filter((t) => (shop.themes ?? []).includes(t.id));

  return (
    <div
      className="rounded-[16px] p-4 flex flex-col gap-2.5 min-w-0"
      style={{
        background: "var(--color-panel)",
        boxShadow: picked ? "0 0 0 2px var(--color-accent-500), var(--shadow-md)" : "var(--shadow-sm)",
      }}
    >
      {picked && (
        <span className="text-[11.5px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-accent-700)" }}>
          ★ Gợi ý cho hôm nay
        </span>
      )}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <h3 className="text-[16px] font-bold leading-snug min-w-0 break-words">{shop.name}</h3>
        <span
          className="flex-none rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap"
          style={{
            background: open === true ? "rgba(72,160,110,.12)" : open === false ? "rgba(192,82,79,.1)" : "var(--color-neutral-100)",
            color: open === true ? "var(--status-green)" : open === false ? "var(--status-red)" : "var(--color-neutral-500)",
          }}
        >
          {open === true ? "Đang mở" : open === false ? "Đã đóng" : "Chưa rõ giờ"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        {themes.map((t) => (
          <span key={t.id} className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--color-neutral-100)", color: "var(--color-neutral-700)" }}>
            {t.icon} {t.label}
          </span>
        ))}
        {shop.near_office && (
          <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}>
            🚶 Gần văn phòng
          </span>
        )}
        <span className="font-semibold" style={{ color: "var(--color-neutral-600)" }}>
          {price ? (price.min === price.max ? `${formatK(price.min)} / món` : `${formatK(price.min)} – ${formatK(price.max)} / món`) : "Chưa có giá"}
        </span>
        {shop.opening_hours && <span style={{ color: "var(--color-neutral-500)" }}>· {shop.opening_hours}</span>}
        {lastOrdered && <span style={{ color: "var(--color-neutral-500)" }}>· đặt gần nhất {lastOrdered.split("-").reverse().slice(0, 2).join("/")}</span>}
      </div>

      {dishes.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--color-neutral-700)" }}>
          {dishes.map((d) => (
            <li key={d.id}>
              {d.name}
              {typeof d.price === "number" && d.price > 0 && <b className="ml-1">{formatK(d.price)}</b>}
            </li>
          ))}
        </ul>
      )}

      <div className="text-[13px] flex flex-col gap-0.5" style={{ color: "var(--color-neutral-700)" }}>
        <span>📍 {shop.address || <i style={{ color: "var(--color-neutral-500)" }}>Chưa có địa chỉ</i>}</span>
        <span>📞 {shop.phone || <i style={{ color: "var(--color-neutral-500)" }}>Chưa có số — ai gọi đặt thì bấm Sửa để thêm</i>}</span>
        {shop.note && <span>📝 {shop.note}</span>}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <a href={directionsLink(shop)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
          📍 Bản đồ & đường đi
        </a>
        {shop.phone && (
          <a href={telLink(shop.phone)} className="btn btn-secondary btn-sm">
            📞 Gọi {shop.phone}
          </a>
        )}
        {shop.shopee_link && (
          <a href={shop.shopee_link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
            🛵 Đặt online
          </a>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={onOrder} disabled={ordering}>
          {ordering ? "Đang tạo…" : "🍱 Đặt chung hôm nay"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
          ✏️ Sửa
        </button>
      </div>
    </div>
  );
}

function ShopDetailsForm({ shop, onCancel, onSaved }: { shop: FoodShop | null; onCancel: () => void; onSaved: (s: FoodShop) => void }) {
  const [f, setF] = useState<FoodShopDetailsInput>({
    id: shop?.id,
    name: shop?.name ?? "",
    address: shop?.address ?? "",
    phone: shop?.phone ?? "",
    mapUrl: shop?.map_url ?? "",
    shopeeLink: shop?.shopee_link ?? "",
    themes: shop?.themes ?? [],
    openingHours: shop?.opening_hours ?? "",
    priceMin: shop?.price_min ?? null,
    priceMax: shop?.price_max ?? null,
    nearOffice: shop?.near_office ?? false,
    dineIn: shop?.dine_in ?? false,
    vegetarian: shop?.vegetarian ?? false,
    note: shop?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FoodShopDetailsInput>) => setF((prev) => ({ ...prev, ...patch }));
  const k = (v: number | null) => (v == null ? "" : String(Math.round(v / 1000)));
  const fromK = (s: string) => (s.trim() === "" ? null : Math.max(0, Number(s)) * 1000);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveFoodShopDetails(f));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 max-w-[720px]">
      <h3 className="text-[17px]">{shop ? `Sửa thông tin · ${shop.name}` : "Thêm quán mới"}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="field sm:col-span-2">
          <label>Tên quán *</label>
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} required />
        </div>
        <div className="field sm:col-span-2">
          <label>Địa chỉ</label>
          <input className="input" placeholder="VD: 17 Út Tịch, P. 4, Q. Tân Bình" value={f.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        <div className="field">
          <label>Số điện thoại</label>
          <input className="input" inputMode="tel" placeholder="VD: 0909 123 456" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <div className="field">
          <label>Giờ mở cửa</label>
          <input className="input" placeholder="VD: 10:00 - 21:00" value={f.openingHours} onChange={(e) => set({ openingHours: e.target.value })} />
        </div>
        <div className="field">
          <label>Giá từ (nghìn đồng)</label>
          <input className="input" type="number" min={0} placeholder="VD: 35" value={k(f.priceMin)} onChange={(e) => set({ priceMin: fromK(e.target.value) })} />
        </div>
        <div className="field">
          <label>Giá đến (nghìn đồng)</label>
          <input className="input" type="number" min={0} placeholder="VD: 70" value={k(f.priceMax)} onChange={(e) => set({ priceMax: fromK(e.target.value) })} />
        </div>
        <div className="field sm:col-span-2">
          <label>Link ShopeeFood / GrabFood (nếu đặt giao được)</label>
          <input className="input" placeholder="https://shopeefood.vn/…" value={f.shopeeLink} onChange={(e) => set({ shopeeLink: e.target.value })} />
        </div>
        <div className="field sm:col-span-2">
          <label>Link Google Maps (không bắt buộc — để trống thì tìm theo tên + địa chỉ)</label>
          <input className="input" placeholder="https://maps.app.goo.gl/…" value={f.mapUrl} onChange={(e) => set({ mapUrl: e.target.value })} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-bold mb-1">Chủ đề</legend>
        <div className="flex flex-wrap gap-1.5">
          {LUNCH_THEMES.map((t) => {
            const on = f.themes.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => set({ themes: on ? f.themes.filter((x) => x !== t.id) : [...f.themes, t.id] })}
                className="rounded-full px-3 py-1.5 text-[13px] font-semibold"
                style={chipStyle(on)}
              >
                {t.icon} {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
        {(
          [
            ["nearOffice", "Gần văn phòng (đi bộ được)"],
            ["dineIn", "Ngồi ăn tại quán được"],
            ["vegetarian", "Có món chay"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4" checked={f[key]} onChange={(e) => set({ [key]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>

      <div className="field">
        <label>Ghi chú</label>
        <input className="input" placeholder="VD: nghỉ chủ nhật, nhắn Zalo đặt trước 11h" value={f.note} onChange={(e) => set({ note: e.target.value })} />
      </div>

      {error && (
        <p className="text-[13px] font-semibold" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Huỷ
        </button>
      </div>
      <p className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
        Thực đơn và giá từng món sửa ở nút ✏️ cạnh tên quán trong khung Đặt đồ ăn.
      </p>
    </form>
  );
}
