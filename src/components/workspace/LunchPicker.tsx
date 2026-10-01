"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { listLunchData, saveFoodShopDetails, updateDishMeta, uploadDishPhoto, type FoodShopDetailsInput } from "@/lib/actions/foodShops";
import {
  LUNCH_BUDGETS,
  LUNCH_NEEDS,
  LUNCH_THEMES,
  directionsLink,
  filterDishes,
  formatK,
  priceRange,
  sizedPhoto,
  telLink,
  type LunchBudgetId,
  type LunchDish,
  type LunchFilters,
  type LunchNeedId,
  type LunchThemeId,
} from "@/lib/lunch";
import type { FoodShop, FoodShopMenuItem } from "@/lib/types";

// "Trưa nay ăn gì?" — a wall of dishes with photos (like truanayangi.com,
// minus the game): tick what you feel like (chủ đề), what it may cost and
// what matters today (near, open now, delivered, vegetarian…), and every
// matching món shows as a card. Open one for its quán — address on the map,
// a call button, the online order link, and "Đặt chung hôm nay" to start
// the room's group order. Photos start as free illustrations until someone
// who ate it adds a real one. Anyone can add a quán or fill in its details.

const FILTERS_KEY = "funti-lunch-filters";
const NO_FILTERS: LunchFilters = { themes: [], budget: null, needs: [] };

// One colour per topic — the strip under each card's photo.
const THEME_TINT: Record<LunchThemeId, string> = {
  com: "#E0A030",
  nuoc: "#D9663A",
  banhmi: "#B9853A",
  ga: "#E5803F",
  chay: "#5BAA5F",
  healthy: "#3FA58C",
  hannhat: "#C4515C",
  anvat: "#D16BA5",
  uong: "#8A6A4F",
};
const themeOf = (id: LunchThemeId | null) => (id ? LUNCH_THEMES.find((t) => t.id === id) ?? null : null);

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
  return NO_FILTERS;
}

// Takes turns between quán, so one long menu doesn't fill the whole wall.
function interleave(dishes: LunchDish[]) {
  const byShop = new Map<string, LunchDish[]>();
  for (const d of dishes) byShop.set(d.shop.id, [...(byShop.get(d.shop.id) ?? []), d]);
  const queues = [...byShop.values()];
  const out: LunchDish[] = [];
  for (let i = 0; out.length < dishes.length; i++) for (const q of queues) if (q[i]) out.push(q[i]);
  return out;
}

// The dish's own price; else the quán's range, marked as such; else unknown.
function PriceTag({ d, className }: { d: LunchDish; className: string }) {
  if (d.price) {
    return (
      <span className={`font-bold ${className}`} style={{ color: "var(--color-accent-700)" }}>
        {formatK(d.price)}
      </span>
    );
  }
  const r = priceRange(d.shop);
  return (
    <span className={`font-semibold ${className}`} style={{ color: "var(--color-neutral-600)" }}>
      {r ? (r.min === r.max ? formatK(r.min) : `${formatK(r.min)} – ${formatK(r.max)}`) : "Giá tại quán"}
      {r && <span className="ml-1 text-[11px] font-medium" style={{ color: "var(--color-neutral-500)" }}>giá quán</span>}
    </span>
  );
}

function OpenDot({ open }: { open: boolean | null }) {
  const color = open === true ? "var(--status-green)" : open === false ? "var(--status-red)" : "var(--color-neutral-300)";
  return <span aria-hidden className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: color }} />;
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
  const [filters, setFilters] = useState<LunchFilters>(NO_FILTERS);
  const [picked, setPicked] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<FoodShop | "new" | null>(null);
  const [ordering, setOrdering] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const resultsRef = useRef<HTMLDivElement>(null);

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
  const allDishes = useMemo(() => filterDishes(shops, menus, NO_FILTERS, now, last), [shops, menus, now, last]);
  const dishes = useMemo(() => interleave(filterDishes(shops, menus, filters, now, last)), [shops, menus, filters, now, last]);
  const themeCount = useMemo(() => {
    const c = new Map<string, number>();
    for (const d of allDishes) {
      const cats = d.item ? [d.category] : d.shop.themes ?? [];
      for (const t of cats) if (t) c.set(t, (c.get(t) ?? 0) + 1);
    }
    return c;
  }, [allDishes]);
  const shown = picked ? [...dishes.filter((d) => d.key === picked), ...dishes.filter((d) => d.key !== picked)] : dishes;
  const active = filters.themes.length + filters.needs.length + (filters.budget ? 1 : 0);
  const openDish = openKey ? allDishes.find((d) => d.key === openKey) ?? null : null;

  function pickOne() {
    if (dishes.length === 0) return;
    const pool = dishes.length > 1 && picked ? dishes.filter((d) => d.key !== picked) : dishes;
    setPicked(pool[Math.floor(Math.random() * pool.length)].key);
    resultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    resultsRef.current?.closest(".overflow-y-auto")?.scrollTo({ top: 0, behavior: "smooth" });
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

  function patchItem(id: string, patch: Partial<FoodShopMenuItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  return (
    <Modal onClose={onClose} maxWidth={1800} sheetOnPhone>
      <div className="flex flex-col h-full sm:max-h-[90vh] lg:h-[88vh] min-h-0">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 flex-none" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg">🍽 Trưa nay ăn gì?</h2>
            <p className="text-[12.5px]" style={{ color: "var(--color-neutral-500)" }}>
              Tick điều kiện, bấm vào món để xem quán, bản đồ và số điện thoại.
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
        ) : openDish ? (
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            <DishDetail
              key={openDish.key}
              dish={openDish}
              sameShop={allDishes.filter((d) => d.shop.id === openDish.shop.id && d.key !== openDish.key)}
              lastOrdered={lastOrdered[openDish.shop.id] ?? null}
              ordering={ordering === openDish.shop.id}
              onBack={() => setOpenKey(null)}
              onOpen={setOpenKey}
              onOrder={() => orderTogether(openDish.shop.id)}
              onEdit={() => setEditing(openDish.shop)}
              onPatch={patchItem}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
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
                <button type="button" className="text-[13px] font-semibold w-fit hover:underline" style={{ color: "var(--color-accent-700)" }} onClick={() => update(NO_FILTERS)}>
                  Bỏ hết lọc ({active})
                </button>
              )}
            </div>

            {/* --------------------------------------------------- RESULTS */}
            <div ref={resultsRef} className="flex flex-col gap-3 px-4 sm:px-6 py-4 lg:overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-bold">{loading ? "Đang tải…" : `${dishes.length} món phù hợp`}</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={pickOne} disabled={dishes.length === 0}>
                    🎲 {picked ? "Gợi ý món khác" : "Chọn giúp 1 món"}
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

              {!loading && dishes.length === 0 && (
                <div className="rounded-[14px] p-5 text-[14px] leading-relaxed" style={{ background: "var(--color-surface)", color: "var(--color-neutral-600)" }}>
                  Chưa có món nào khớp hết các điều kiện. Bỏ bớt một vài ô, hoặc <b>+ Thêm quán</b> bạn biết quanh văn phòng để lần sau ai cũng chọn được.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[106rem]:grid-cols-6 gap-3 sm:gap-4">
                {shown.map((d) => (
                  <DishCard key={d.key} d={d} picked={d.key === picked} onOpen={() => setOpenKey(d.key)} />
                ))}
              </div>

              {shown.some((d) => d.sample && d.photo) && (
                <p className="text-[11.5px] pt-1" style={{ color: "var(--color-neutral-500)" }}>
                  Ảnh có nhãn “Ảnh minh hoạ” là ảnh miễn phí từ Unsplash — ai ăn món nào thì mở món đó, bấm 📷 để thay bằng ảnh thật.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DishPhoto({ d, width, className }: { d: LunchDish; width: number; className?: string }) {
  const theme = themeOf(d.category);
  const tint = d.category ? THEME_TINT[d.category] : "var(--color-neutral-300)";
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} style={{ background: `color-mix(in srgb, ${tint} 18%, var(--color-surface))` }}>
      {d.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sizedPhoto(d.photo, width)} alt={d.name} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span aria-hidden className="absolute inset-0 grid place-items-center text-[40px]">
          {theme?.icon ?? "🍽"}
        </span>
      )}
      {d.vegetarian && (
        <span className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: "#3E8E47" }}>
          🥬 Chay
        </span>
      )}
      {d.sample && d.photo && (
        <span className="absolute bottom-1.5 right-1.5 rounded px-1.5 py-px text-[10px] font-semibold text-white" style={{ background: "rgba(0,0,0,.45)" }}>
          Ảnh minh hoạ
        </span>
      )}
    </div>
  );
}

function DishCard({ d, picked, onOpen }: { d: LunchDish; picked: boolean; onOpen: () => void }) {
  const theme = themeOf(d.category);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-[14px] overflow-hidden flex flex-col min-w-0 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: "var(--color-panel)",
        boxShadow: picked ? "0 0 0 2.5px var(--color-accent-500), var(--shadow-md)" : "var(--shadow-sm)",
      }}
    >
      <div className="relative">
        <DishPhoto d={d} width={600} className="aspect-[4/3] w-full" />
        {picked && (
          <span className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: "var(--color-accent-500)" }}>
            ★ Gợi ý hôm nay
          </span>
        )}
      </div>
      <span aria-hidden className="h-[3px] w-full flex-none" style={{ background: d.category ? THEME_TINT[d.category] : "var(--color-neutral-200)" }} />
      <div className="flex flex-col gap-1 p-3 min-w-0 flex-1">
        {theme && (
          <span className="text-[11px] font-bold tracking-[0.04em] uppercase truncate" style={{ color: "var(--color-neutral-500)" }}>
            {theme.icon} {theme.label}
          </span>
        )}
        <h3 className="text-[15px] font-bold leading-snug line-clamp-2 break-words">{d.name}</h3>
        <PriceTag d={d} className="text-[14px]" />
        <span className="mt-auto pt-1 flex items-center gap-1.5 text-[12px] min-w-0" style={{ color: "var(--color-neutral-600)" }}>
          <OpenDot open={d.open} />
          <span className="truncate">{d.item ? d.shop.name : d.shop.address || "Quán chưa có thực đơn"}</span>
        </span>
      </div>
    </button>
  );
}

function DishDetail({
  dish: d,
  sameShop,
  lastOrdered,
  ordering,
  onBack,
  onOpen,
  onOrder,
  onEdit,
  onPatch,
}: {
  dish: LunchDish;
  sameShop: LunchDish[];
  lastOrdered: string | null;
  ordering: boolean;
  onBack: () => void;
  onOpen: (key: string) => void;
  onOrder: () => void;
  onEdit: () => void;
  onPatch: (id: string, patch: Partial<FoodShopMenuItem>) => void;
}) {
  const { shop, item } = d;
  const theme = themeOf(d.category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const url = await uploadDishPhoto(item.id, fd);
      onPatch(item.id, { photo_url: url, photo_is_sample: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được ảnh.");
    } finally {
      setBusy(false);
    }
  }

  async function setMeta(category: string | null, vegetarian: boolean) {
    if (!item) return;
    const before = { category: item.category ?? null, vegetarian: !!item.vegetarian };
    onPatch(item.id, { category, vegetarian });
    setError(null);
    try {
      await updateDishMeta(item.id, { category, vegetarian });
    } catch (e) {
      onPatch(item.id, before);
      setError(e instanceof Error ? e.message : "Không lưu được.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" className="text-[13.5px] font-semibold w-fit hover:underline" style={{ color: "var(--color-accent-700)" }} onClick={onBack}>
        ← Tất cả món
      </button>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 md:gap-7 items-start">
        <div className="flex flex-col gap-2 min-w-0">
          <DishPhoto d={d} width={1200} className="aspect-[4/3] lg:aspect-[3/2] w-full rounded-[16px]" />
          {item && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) upload(f);
                }}
              />
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? "Đang tải ảnh…" : d.sample ? "📷 Thêm ảnh thật của món" : "📷 Đổi ảnh"}
              </button>
              {d.sample && d.photo && (
                <span className="text-[12px]" style={{ color: "var(--color-neutral-500)" }}>
                  Đang là ảnh minh hoạ (Unsplash)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-col gap-1.5">
            {theme && (
              <span className="text-[12px] font-bold tracking-[0.05em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
                {theme.icon} {theme.label}
              </span>
            )}
            <h3 className="text-[24px] sm:text-[28px] leading-tight break-words" style={{ textWrap: "balance" }}>
              {d.name}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <PriceTag d={d} className="text-[20px]" />
              {d.vegetarian && (
                <span className="rounded-full px-2 py-0.5 text-[12px] font-bold text-white" style={{ background: "#3E8E47" }}>
                  🥬 Chay
                </span>
              )}
            </div>
            {item?.note && (
              <p className="text-[13.5px]" style={{ color: "var(--color-neutral-600)" }}>
                {item.note}
              </p>
            )}
          </div>

          {/* ------------------------------------------------- THE QUÁN */}
          <div className="rounded-[16px] p-4 flex flex-col gap-2.5" style={{ background: "var(--color-surface)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[11.5px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
                  Quán
                </span>
                <h4 className="text-[17px] font-bold leading-snug break-words">{shop.name}</h4>
              </div>
              <span
                className="flex-none rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap"
                style={{
                  background: d.open === true ? "rgba(72,160,110,.12)" : d.open === false ? "rgba(192,82,79,.1)" : "var(--color-neutral-100)",
                  color: d.open === true ? "var(--status-green)" : d.open === false ? "var(--status-red)" : "var(--color-neutral-500)",
                }}
              >
                {d.open === true ? "Đang mở" : d.open === false ? "Đã đóng" : "Chưa rõ giờ"}
              </span>
            </div>
            <div className="text-[13.5px] flex flex-col gap-1" style={{ color: "var(--color-neutral-700)" }}>
              <span>📍 {shop.address || <i style={{ color: "var(--color-neutral-500)" }}>Chưa có địa chỉ</i>}</span>
              <span>📞 {shop.phone || <i style={{ color: "var(--color-neutral-500)" }}>Chưa có số — ai gọi đặt thì bấm Sửa quán để thêm</i>}</span>
              {shop.opening_hours && <span>🕐 {shop.opening_hours}</span>}
              {shop.near_office && <span>🚶 Gần văn phòng, đi bộ được</span>}
              {shop.note && <span>📝 {shop.note}</span>}
              {lastOrdered && <span style={{ color: "var(--color-neutral-500)" }}>Đặt gần nhất {lastOrdered.split("-").reverse().slice(0, 2).join("/")}</span>}
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
                ✏️ Sửa quán
              </button>
            </div>
          </div>

          {/* ------------------------------------------ TOPIC & "CHAY" */}
          {item ? (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
                Món này thuộc chủ đề
              </span>
              <div className="flex flex-wrap gap-1.5">
                {LUNCH_THEMES.map((t) => {
                  const on = item.category === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setMeta(on ? null : t.id, !!item.vegetarian)}
                      className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
                      style={chipStyle(on)}
                    >
                      {t.icon} {t.label}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-[14px] cursor-pointer w-fit">
                <input type="checkbox" className="w-4 h-4" checked={!!item.vegetarian} onChange={(e) => setMeta(item.category ?? null, e.target.checked)} />
                Món chay
              </label>
            </div>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--color-neutral-500)" }}>
              Quán này chưa có thực đơn — thêm món ở nút ✏️ cạnh tên quán trong khung Đặt đồ ăn, mỗi món sẽ thành một thẻ có ảnh.
            </p>
          )}
          {error && (
            <p className="text-[13px] font-semibold" style={{ color: "var(--status-red)" }}>
              {error}
            </p>
          )}
        </div>
      </div>

      {sameShop.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <span className="text-[12px] font-bold tracking-[0.06em] uppercase" style={{ color: "var(--color-neutral-500)" }}>
            Món khác ở {shop.name}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {sameShop.map((o) => (
              <button key={o.key} type="button" onClick={() => onOpen(o.key)} className="text-left rounded-[12px] overflow-hidden min-w-0" style={{ background: "var(--color-panel)", boxShadow: "var(--shadow-sm)" }}>
                <DishPhoto d={o} width={400} className="aspect-[4/3] w-full" />
                <div className="p-2 flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold leading-snug line-clamp-2 break-words">{o.name}</span>
                  <PriceTag d={o} className="text-[12.5px]" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
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
