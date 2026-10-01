// "Trưa nay ăn gì?" filtering, checked against hand-worked examples.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterLunch, isOpenAt, priceRange, mapLink, telLink } from "../src/lib/lunch.ts";

// 11:30 in Vietnam = 04:30 UTC.
const noonVN = new Date("2026-10-01T04:30:00Z");
const nightVN = new Date("2026-10-01T16:30:00Z"); // 23:30 VN

test("isOpenAt reads common hour formats in Vietnam time", () => {
  assert.equal(isOpenAt("10:00 - 23:00", noonVN), true);
  assert.equal(isOpenAt("10:00 - 23:00", nightVN), false);
  assert.equal(isOpenAt("6h-10h, 16h-21h", noonVN), false);
  assert.equal(isOpenAt("18:00 - 02:00", nightVN), true); // past midnight
  assert.equal(isOpenAt(null, noonVN), null);
  assert.equal(isOpenAt("cả ngày", noonVN), null);
});

const shop = (id, extra = {}) => ({ id, name: id, shopee_link: null, photo_url: null, added_by: null, created_at: "", themes: [], ...extra });

test("priceRange prefers the menu, then the typed range", () => {
  assert.deepEqual(priceRange(shop("a", { price_min: 25000, price_max: 165000 }), []), { min: 25000, max: 165000 });
  assert.deepEqual(priceRange(shop("a", { price_min: 25000 }), [{ price: 40000 }, { price: 50000 }, { price: null }]), { min: 40000, max: 50000 });
  assert.equal(priceRange(shop("a"), []), null);
  assert.deepEqual(priceRange(shop("a", { price_max: 100000 }), []), { min: 0, max: 100000 }); // "dưới 100k"
});

test("filterLunch: topics, budget and requirements all must hold", () => {
  const shops = [
    shop("tam", { themes: ["com"], price_min: 25000, price_max: 165000, near_office: true, opening_hours: "10:00 - 23:00", dine_in: true }),
    shop("pho", { themes: ["nuoc"], shopee_link: "https://shopeefood.vn/x" }),
    shop("chay", { themes: ["chay", "com"], phone: "0909 123 456", opening_hours: "06:00 - 10:00" }),
  ];
  const menus = new Map([["pho", [{ price: 40000 }, { price: 50000 }]]]);
  const none = new Map();
  const names = (f, last = none) => filterLunch(shops, menus, f, noonVN, last).map((m) => m.shop.id);

  assert.deepEqual(names({ themes: [], budget: null, needs: [] }), ["tam", "chay", "pho"]); // open first
  assert.deepEqual(names({ themes: ["com"], budget: null, needs: [] }), ["tam", "chay"]);
  assert.deepEqual(names({ themes: [], budget: "40-60", needs: [] }), ["tam", "pho"]); // chay has no price
  assert.deepEqual(names({ themes: [], budget: "u40", needs: [] }), ["tam"]); // phở dishes are 40k+
  assert.deepEqual(names({ themes: [], budget: null, needs: ["near", "open"] }), ["tam"]);
  assert.deepEqual(names({ themes: [], budget: null, needs: ["delivery"] }), ["pho"]);
  assert.deepEqual(names({ themes: [], budget: null, needs: ["veg", "phone"] }), ["chay"]);
  assert.deepEqual(names({ themes: [], budget: null, needs: ["fresh"] }, new Map([["tam", "2026-09-29"]])), ["chay", "pho"]);
});

test("links: map search, phone", () => {
  assert.match(mapLink({ name: "Cơm Tấm", address: "17 Út Tịch", map_url: null }), /google\.com\/maps\/search\/\?api=1&query=C%C6%A1m/);
  assert.equal(mapLink({ name: "x", address: null, map_url: "https://maps.app.goo.gl/abc" }), "https://maps.app.goo.gl/abc");
  assert.equal(telLink("0909 123 456"), "tel:0909123456");
});

test("filterDishes: one card per dish, sides hidden, quán without menu as one card", async () => {
  const { filterDishes, CATEGORY_PHOTO } = await import("../src/lib/lunch.ts");
  const shops = [
    shop("pho", { themes: ["nuoc"], near_office: true }),
    shop("tam", { themes: ["com"], price_min: 25000, price_max: 165000 }),
  ];
  const menus = new Map([
    [
      "pho",
      [
        { id: "p1", shop_id: "pho", name: "Phở tái", price: 40000, category: "nuoc", photo_url: null },
        { id: "p2", shop_id: "pho", name: "Chén trứng", price: 10000 },
        { id: "p3", shop_id: "pho", name: "Phở chay", price: 45000, vegetarian: true, photo_url: "https://x/real.jpg", photo_is_sample: false },
      ],
    ],
  ]);
  const keys = (f) => filterDishes(shops, menus, f, noonVN, new Map()).map((d) => d.key);
  assert.deepEqual(keys({ themes: [], budget: null, needs: [] }).sort(), ["p1", "p3", "shop-tam"].sort());
  assert.deepEqual(keys({ themes: ["com"], budget: null, needs: [] }), ["shop-tam"]);
  assert.deepEqual(keys({ themes: [], budget: "u40", needs: [] }), ["shop-tam"]); // tam's range starts at 25k; phở is 40k+
  assert.deepEqual(keys({ themes: [], budget: null, needs: ["veg"] }), ["p3"]);
  assert.deepEqual(keys({ themes: ["chay"], budget: null, needs: [] }), ["p3"]); // a vegetarian phở counts as "Chay" too
  assert.deepEqual(keys({ themes: [], budget: null, needs: ["near"] }).sort(), ["p1", "p3"]);
  const d = filterDishes(shops, menus, { themes: [], budget: null, needs: [] }, noonVN, new Map());
  assert.equal(d.find((x) => x.key === "p1").photo, CATEGORY_PHOTO.nuoc);
  assert.equal(d.find((x) => x.key === "p1").sample, true);
  assert.equal(d.find((x) => x.key === "p3").sample, false);
});
