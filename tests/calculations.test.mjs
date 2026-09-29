// Money and chat-ordering math, checked against hand-worked examples.
// Run: npm test   (Node's built-in runner; the .ts sources are loaded
// directly — they only use `import type`, which Node strips.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeAttendance,
  isCalendarOffFor,
  isOffByDefault,
  isDefaultWorkDay,
} from "../src/lib/constants/attendance.ts";
import { computeFinanceSummary } from "../src/lib/financeSummary.ts";
import { catchUpFrom, insertByTime, newestCreatedAt } from "../src/lib/chatSyncCursor.ts";
import { DEFAULT_UPWORK_SOP, normalizeSop } from "../src/lib/upworkSop.ts";

const day = (work_date, status, time, extra = {}) => ({
  work_date,
  status,
  check_in_at: time ? `${work_date}T${time}:00+07:00` : null,
  ...extra,
});

test("ngày công: each status counts the right amount", () => {
  const s = summarizeAttendance([
    day("2026-09-01", "present", "08:50"), // 1, on time
    day("2026-09-02", "present", "09:20"), // 1, late (grace is 5 min)
    day("2026-09-03", "present", null), // no check-in → not counted
    day("2026-09-04", "half_day", null), // 0.5
    day("2026-09-05", "paid_leave", null), // 1 (paid holiday)
    day("2026-09-06", "off", "08:00"), // never counted
    day("2026-09-07", "absent", null),
    day("2026-09-08", "leave", null),
  ]);
  assert.deepEqual(s, { present: 3.5, late: 1, absent: 1, leave: 1 });
});

test("tăng ca counts as công and is never late", () => {
  const s = summarizeAttendance([
    day("2026-09-19", "present", "10:15", { overtime: true }),
    day("2026-09-20", "half_day", null, { overtime: true }),
  ]);
  assert.deepEqual(s, { present: 1.5, late: 0, absent: 0, leave: 0 });
});

test("late threshold: 09:05 on time, 09:06 late", () => {
  assert.equal(summarizeAttendance([day("2026-09-01", "present", "09:05")]).late, 0);
  assert.equal(summarizeAttendance([day("2026-09-01", "present", "09:06")]).late, 1);
});

test("calendar day off shows as Ngày nghỉ only when nothing on it is paid", () => {
  const off = new Set(["2026-09-26"]);
  assert.equal(isCalendarOffFor("2026-09-26", undefined, off), true);
  assert.equal(isCalendarOffFor("2026-09-26", day("2026-09-26", "off", null), off), true);
  assert.equal(isCalendarOffFor("2026-09-26", day("2026-09-26", "present", null), off), true);
  // Anything payroll pays for is shown, never hidden behind "Ngày nghỉ".
  assert.equal(isCalendarOffFor("2026-09-26", day("2026-09-26", "present", "08:40"), off), false);
  assert.equal(isCalendarOffFor("2026-09-26", day("2026-09-26", "half_day", null), off), false);
  assert.equal(isCalendarOffFor("2026-09-26", day("2026-09-26", "present", "10:00", { overtime: true }), off), false);
  assert.equal(isCalendarOffFor("2026-09-25", undefined, off), false);
});

test("Sunday is off by default, Saturday isn't unless the calendar says so", () => {
  assert.equal(isDefaultWorkDay("2026-09-27"), false); // Sunday
  assert.equal(isDefaultWorkDay("2026-09-26"), true); // Saturday
  assert.equal(isOffByDefault("2026-09-26", new Set()), false);
  assert.equal(isOffByDefault("2026-09-26", new Set(["2026-09-26"])), true);
});

test("tài chính: net = revenue − costs − salary; break-even from gross margin", () => {
  const e = (type, amount) => ({ type, amount });
  const s = computeFinanceSummary(
    [e("revenue", 250_000_000), e("variable_cost", 40_000_000), e("fixed_cost", 30_000_000)],
    8_000_000,
  );
  assert.equal(s.grossProfit, 210_000_000);
  assert.equal(s.netProfit, 172_000_000);
  assert.equal(Math.round(s.grossMarginRatio * 1000) / 1000, 0.84);
  // (fixed + salary) / gross margin = 38M / 0.84
  assert.equal(Math.round(s.breakEvenRevenue), 45_238_095);
  const empty = computeFinanceSummary([], 0);
  assert.equal(empty.netProfit, 0);
  assert.equal(empty.breakEvenRevenue, null);
});

test("chat: a late-fetched message is inserted at its time, unsent bubbles stay last", () => {
  const m = (id, t) => ({ id, created_at: `2026-09-25T${t}:00.000000+00:00` });
  let list = [m("a", "04:06"), m("b", "04:07"), m("f", "11:06"), { id: "temp-1", created_at: "2099-01-01T00:00:00Z" }];
  list = insertByTime(list, m("c", "08:31"));
  assert.deepEqual(list.map((x) => x.id), ["a", "b", "c", "f", "temp-1"]);
});

test("chat: the catch-up cursor re-reads a minute back and parses microseconds", () => {
  assert.equal(catchUpFrom("2026-09-25T08:32:04.782068+00:00"), "2026-09-25T08:31:04.782Z");
  assert.equal(catchUpFrom(undefined), undefined);
  assert.equal(newestCreatedAt([{ created_at: "2026-01-02" }, { created_at: "2026-01-03" }], "2026-01-01"), "2026-01-03");
});

test("SOP: a partial saved copy is completed from the original deck", () => {
  const sop = normalizeSop({ criteria: { passScore: 16, rows: [{ name: "X", howToCheck: 5 }, "junk"] } });
  assert.equal(sop.criteria.passScore, 16);
  assert.deepEqual(sop.criteria.rows, [{ name: "X", howToCheck: "" }]);
  assert.equal(sop.cover.title, DEFAULT_UPWORK_SOP.cover.title);
  assert.equal(sop.decision.tiers.length, 2);
});

test("chat: provisional messages are replaced by the saved row, or dropped when never confirmed", async () => {
  const { dropStaleProvisional, withoutProvisional, replaceIfProvisional } = await import("../src/lib/chatSyncCursor.ts");
  const t = (h) => `2026-09-28T${h}:00.000Z`;
  const saved = [{ id: "a", created_at: t("10:00") }];
  const prov = { id: "p", created_at: t("10:05"), provisional: true, provisional_at: 1_000 };
  const list = [...saved, prov];
  // Confirmed row with the server's (earlier) timestamp takes the provisional's place.
  const confirmed = { id: "p", created_at: t("10:04") };
  assert.deepEqual(replaceIfProvisional(list, confirmed), [saved[0], confirmed]);
  // A second provisional copy, or a duplicate saved row, changes nothing.
  assert.equal(replaceIfProvisional(list, { ...prov }), list);
  const done = [...saved, confirmed];
  assert.equal(replaceIfProvisional(done, confirmed), done);
  assert.equal(replaceIfProvisional(list, { id: "new", created_at: t("10:06") }), null);
  // Unconfirmed after 90s → gone; within 90s → kept.
  assert.deepEqual(dropStaleProvisional(list, 1_000 + 91_000), saved);
  assert.equal(dropStaleProvisional(list, 1_000 + 30_000), list);
  assert.deepEqual(withoutProvisional(list), saved);
});

test("chat: both people build the same private DM channel name, lower id first", async () => {
  const { dmTopic, roomTopic, inboxTopic } = await import("../src/lib/chatTopics.ts");
  const a = "1fe95dd5-f7dd-46c7-bc9a-6b4c837f4f2a";
  const b = "52661369-7ae9-4a2a-8327-02297342681e";
  assert.equal(dmTopic(a, b), dmTopic(b, a));
  assert.equal(dmTopic(b, a), `dm:${a}:${b}`);
  assert.equal(roomTopic("x"), "room:x");
  assert.equal(inboxTopic("y"), "inbox:y");
});

test("thử việc: 2 months from the join date, then due for 30 days, confirmed = official", async () => {
  const { addMonths, probationStatus, vnDateOf } = await import("../src/lib/probation.ts");
  assert.equal(addMonths("2026-08-15", 2), "2026-10-15");
  assert.equal(addMonths("2026-12-31", 2), "2027-02-28");
  assert.equal(addMonths("2027-12-31", 2), "2028-02-29");
  // 17:30 UTC on 31/07 is already 01/08 in Vietnam.
  assert.equal(vnDateOf("2026-07-31T17:30:00Z"), "2026-08-01");

  const staff = { joined_at: "2026-08-15", created_at: "2026-08-01T00:00:00Z", access_role: "staff" };
  assert.deepEqual(probationStatus(staff, null, "2026-09-28"), { kind: "probation", endsOn: "2026-10-15", daysLeft: 17 });
  assert.deepEqual(probationStatus(staff, null, "2026-10-15"), { kind: "due", endsOn: "2026-10-15", daysOver: 0 });
  assert.deepEqual(probationStatus(staff, null, "2026-11-14"), { kind: "due", endsOn: "2026-10-15", daysOver: 30 });
  assert.equal(probationStatus(staff, null, "2026-11-15").kind, "official");
  assert.equal(probationStatus(staff, "2026-09-01", "2026-09-28").kind, "official");
  // Directors never show as thử việc; no joined_at falls back to account creation.
  assert.equal(probationStatus({ ...staff, access_role: "director" }, null, "2026-09-28").kind, "official");
  assert.equal(probationStatus({ ...staff, joined_at: null }, null, "2026-09-28").endsOn, "2026-10-01");
});

test("tổng quan: monthly thu/chi/lãi match the Tài chính page, luỹ kế starts at T8/2026", async () => {
  const { monthlySeries, compactVnd, shortMonthLabel } = await import("../src/lib/dashboardMath.ts");
  const entries = [
    { entry_month: "2026-07-01", type: "revenue", amount: 50_000_000 },
    { entry_month: "2026-08-01", type: "revenue", amount: 80_000_000 },
    { entry_month: "2026-08-01", type: "fixed_cost", amount: 10_000_000 },
    { entry_month: "2026-08-01", type: "variable_cost", amount: 5_000_000 },
    { entry_month: "2026-09-01", type: "revenue", amount: 40_000_000 },
    { entry_month: "2026-09-01", type: "fixed_cost", amount: 10_000_000 },
  ];
  const salary = { "2026-08-01": 30_000_000, "2026-09-01": 35_000_000 };
  const s = monthlySeries(["2026-07-01", "2026-08-01", "2026-09-01"], entries, salary, "2026-08-01");
  assert.deepEqual(s.map((p) => p.net), [50_000_000, 35_000_000, -5_000_000]);
  // July is before the fresh start — no luỹ kế; Aug starts it, Sep adds on.
  assert.deepEqual(s.map((p) => p.cumulative), [null, 35_000_000, 30_000_000]);
  const aug = computeFinanceSummary(entries.filter((e) => e.entry_month === "2026-08-01"), 30_000_000);
  assert.equal(s[1].net, aug.netProfit);
  assert.equal(s[1].cost, aug.totalCost);
  assert.equal(compactVnd(12_500_000), "12,5tr");
  assert.equal(compactVnd(-5_000_000), "−5tr");
  assert.equal(compactVnd(850_000), "850k");
  assert.equal(shortMonthLabel("2027-01-01"), "T1/27");
});

test("tổng quan: thời gian trả lời khách và lời/lỗ theo dự án", async () => {
  const { responseStats, formatDuration, projectProfit, hourlyCost } = await import("../src/lib/dashboardMath.ts");
  const at = (h, m = 0) => `2026-09-28T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  const msgs = [
    // Project A: two client messages, answered 30 min after the first.
    { project_id: "A", sender_type: "client", created_at: at(1) },
    { project_id: "A", sender_type: "client", created_at: at(1, 10) },
    { project_id: "A", sender_type: "staff", created_at: at(1, 30) },
    // …then asked again and answered after 2 hours.
    { project_id: "A", sender_type: "client", created_at: at(3) },
    { project_id: "A", sender_type: "staff", created_at: at(5) },
    // Project B: still waiting since 06:00.
    { project_id: "B", sender_type: "client", created_at: at(6) },
  ];
  const s = responseStats(msgs, Date.parse(at(8)));
  assert.equal(s.answered, 2);
  assert.equal(s.medianMinutes, 30);
  assert.equal(s.withinHourPct, 0.5);
  assert.equal(s.waitingNow, 1);
  assert.equal(s.oldestWaitingMinutes, 120);
  assert.equal(formatDuration(45), "45 phút");
  assert.equal(formatDuration(190), "3 giờ 10 phút");
  assert.equal(formatDuration(60 * 52), "2 ngày 4 giờ");

  // 8.320.000đ / 26 ngày / 8 giờ = 40.000đ/giờ.
  assert.equal(hourlyCost(8_320_000, 26), 40_000);
  const rows = projectProfit(
    [{ id: "p1", name: "Ryan" }, { id: "p2", name: "Daisy" }, { id: "p3", name: "Trống" }],
    [
      { project_channel_id: "p1", profile_id: "u1", hours: 10, minutes: 30 },
      { project_channel_id: "p1", profile_id: "u2", hours: 2, minutes: 0 }, // no salary set
      { project_channel_id: "p2", profile_id: "u1", hours: 5, minutes: 0 },
    ],
    new Map([["u1", 40_000]]),
    new Map([["p1", 1_000_000]]),
  );
  assert.equal(rows.length, 2); // p3 has neither hours nor revenue
  assert.deepEqual(rows[0], { id: "p1", name: "Ryan", hours: 12.5, laborCost: 420_000, unpricedHours: 2, revenue: 1_000_000, profit: 580_000 });
  assert.equal(rows[1].revenue, null);
  assert.equal(rows[1].profit, null);
});

test("bảng công việc: lọc thẻ kiểu Trello và sắp xếp", async () => {
  const { matchesFilter, sortTasks, fold, EMPTY_FILTER, filterCount, isArchiveColumnTitle, ARCHIVE_COLUMN_TITLE } = await import("../src/lib/boardTools.ts");
  const t = (o) => ({ title: "Tô màu sách Ryan", code: "#123", description: "<p>Trang 12–16</p>", due_date: null, labels: [], assignees: [], created_at: "2026-09-01", ...o });
  const today = "2026-09-28";
  assert.equal(fold("Hoàn Thành Đẹp"), "hoan thanh dep");
  assert.ok(matchesFilter(t({}), { ...EMPTY_FILTER, text: "to mau ryan" }, today));
  assert.ok(matchesFilter(t({}), { ...EMPTY_FILTER, text: "trang 12" }, today)); // searches the description too
  assert.ok(!matchesFilter(t({}), { ...EMPTY_FILTER, text: "daisy" }, today));
  assert.ok(matchesFilter(t({ assignees: [{ id: "u1" }] }), { ...EMPTY_FILTER, members: ["u1"] }, today));
  assert.ok(matchesFilter(t({}), { ...EMPTY_FILTER, members: ["none"] }, today));
  assert.ok(!matchesFilter(t({ assignees: [{ id: "u2" }] }), { ...EMPTY_FILTER, members: ["u1", "none"] }, today));
  assert.ok(matchesFilter(t({ labels: ["gap"] }), { ...EMPTY_FILTER, labels: ["gap", "pause"] }, today));
  assert.ok(matchesFilter(t({ due_date: "2026-09-27" }), { ...EMPTY_FILTER, due: "overdue" }, today));
  assert.ok(!matchesFilter(t({ due_date: "2026-09-28" }), { ...EMPTY_FILTER, due: "overdue" }, today)); // due today isn't overdue yet
  assert.ok(matchesFilter(t({ due_date: "2026-10-05" }), { ...EMPTY_FILTER, due: "week" }, today));
  assert.ok(!matchesFilter(t({ due_date: "2026-10-06" }), { ...EMPTY_FILTER, due: "week" }, today));
  assert.ok(matchesFilter(t({}), { ...EMPTY_FILTER, due: "none" }, today));
  assert.equal(filterCount({ text: "x", members: ["a", "b"], labels: [], due: "week" }), 4);
  const sorted = sortTasks([t({ title: "B", due_date: null }), t({ title: "A", due_date: "2026-10-01" }), t({ title: "C", due_date: "2026-09-30" })], "due");
  assert.deepEqual(sorted.map((x) => x.title), ["C", "A", "B"]);
  assert.ok(isArchiveColumnTitle(` ${ARCHIVE_COLUMN_TITLE} `));
});

test("SOP bảng giá: cân ngân sách job theo mức Tốt / Trung bình / Thấp", async () => {
  const { parsePrice, priceBand } = await import("../src/lib/upworkSop.ts");
  assert.equal(parsePrice("$1,200"), 1200);
  assert.equal(parsePrice(" 45.5 "), 45.5);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("chưa có"), null);
  const row = (good, average, low) => ({ name: "", unit: "", good, average, low, note: "" });
  const rows = [row("150", "100", "60"), row("280", "180", "110"), row("250", "180", "120")]; // page · spread · cover
  // 12 spreads + 1 cover: good 12×280+250 = 3610, average 2340, low 1440
  const q = [0, 12, 1];
  assert.deepEqual(priceBand(4000, rows, q).need, { good: 3610, average: 2340, low: 1440 });
  assert.equal(priceBand(3610, rows, q).band, "good");
  assert.equal(priceBand(2500, rows, q).band, "average");
  assert.equal(priceBand(1440, rows, q).band, "low");
  assert.equal(priceBand(900, rows, q).band, "below");
  assert.equal(priceBand(0, rows, q).band, null); // no budget typed yet
  assert.equal(priceBand(5000, rows, [0, 0, 0]).band, null); // nothing asked for
  // A tier with a missing price for a used row is skipped, not counted as $0.
  const partial = [row("", "100", "60")];
  assert.deepEqual(priceBand(120, partial, [1]), { band: "average", need: { good: null, average: 100, low: 60 } });
  assert.equal(priceBand(50, [row("150", "100", "")], [1]).band, null); // no floor set → can't call it "below"
});

test("bảng công việc: mô tả kiểu Trello (Markdown) hiện đúng, thẻ hoàn tất hạn không bị tính quá hạn", async () => {
  const { descriptionToHtml, isHtmlDescription } = await import("../src/lib/descriptionHtml.ts");
  const { matchesFilter, EMPTY_FILTER, taskLink, codeFromParam } = await import("../src/lib/boardTools.ts");
  const html = descriptionToHtml(
    'Hi **Nhân**\nsee [https://docs.google.com/x](https://docs.google.com/x "smartCard-inline")\n\n- one\n- two <b>x</b>\n\n3. three\n\n![image.webp](https://trello.com/a.webp)\n_The Bear_ and file_name_x',
  );
  assert.ok(html.startsWith("<p>Hi <strong>Nhân</strong><br>see <a href=\"https://docs.google.com/x\""));
  assert.ok(html.includes("<ul><li>one</li><li>two &lt;b&gt;x&lt;/b&gt;</li></ul>")); // raw HTML in Markdown is shown, never run
  assert.ok(html.includes('<ol start="3"><li>three</li></ol>'));
  assert.ok(html.includes(">🖼 image.webp</a>")); // Trello images need a login — linked, not embedded
  assert.ok(html.includes("<em>The Bear</em> and file_name_x"));
  assert.ok(!descriptionToHtml("[x](javascript:alert(1))").includes("href")); // only http(s)/mailto links
  assert.equal(descriptionToHtml("<p>đã là HTML</p>"), "<p>đã là HTML</p>");
  assert.equal(descriptionToHtml("   "), "");
  assert.ok(isHtmlDescription("a<br>b") && !isHtmlDescription("a < b > c"));

  const today = "2026-09-29";
  const t = (o) => ({ title: "x", code: "#1", description: null, due_date: "2026-09-20", labels: [], assignees: [], ...o });
  assert.ok(matchesFilter(t({}), { ...EMPTY_FILTER, due: "overdue" }, today));
  assert.ok(!matchesFilter(t({ due_complete: true }), { ...EMPTY_FILTER, due: "overdue" }, today));
  assert.ok(matchesFilter(t({ due_complete: true }), { ...EMPTY_FILTER, due: "complete" }, today));
  assert.ok(!matchesFilter(t({ due_complete: true }), { ...EMPTY_FILTER, due: "incomplete" }, today));
  assert.ok(matchesFilter(t({ due_date: null, due_complete: true }), { ...EMPTY_FILTER, due: "complete" }, today)); // ticked without a date, like Trello
  assert.equal(taskLink("https://funtikidbooks.com", "#1546"), "https://funtikidbooks.com/workspace?the=1546");
  assert.equal(codeFromParam("1546"), "#1546");
  assert.equal(codeFromParam(""), null);
});

test("báo giá: tổng từng mức, một giá cho mọi mức, tuỳ chọn không cộng vào tổng", async () => {
  const { tierTotals, lineTotal, parseMoney, formatMoney, resizeTiers, draftFromPreset, quoteAsText } = await import("../src/lib/quote.ts");
  const it = (o) => ({ id: "x", kind: "item", name: "", description: "", qty: 1, unit: "trang", prices: [null, null, null], flat: false, optional: false, ...o });
  const items = [
    it({ qty: 40, prices: [150000, 200000, 280000] }), // 40 trang tô màu
    it({ qty: 1, prices: [500000, 700000, 900000] }), // bìa
    it({ kind: "section", name: "PHẦN THÊM", qty: 0 }),
    it({ qty: 1, prices: [300000, null, null], flat: true }), // dàn trang — một giá
    it({ qty: 1, prices: [250000, null, null], flat: true, optional: true }), // bài test — không cộng
  ];
  assert.deepEqual(tierTotals(items, 3), [
    { total: 6_800_000, missing: false },
    { total: 9_000_000, missing: false },
    { total: 12_400_000, missing: false },
  ]);
  assert.equal(lineTotal(items[0], 1), 8_000_000);
  assert.deepEqual(tierTotals([it({ prices: [100, null, null] })], 3).map((x) => x.missing), [false, true, true]);
  assert.equal(parseMoney("1.500.000", "VND"), 1500000);
  assert.equal(parseMoney("1,500,000 ₫", "VND"), 1500000);
  assert.equal(parseMoney("$1,250.50", "USD"), 1250.5);
  assert.equal(parseMoney("", "USD"), null);
  assert.equal(formatMoney(6800000, "VND"), "6.800.000 ₫");
  assert.equal(formatMoney(1250.5, "USD"), "$1,250.50");
  assert.equal(formatMoney(900, "USD"), "$900");
  // 3 → 2 mức keeps the prices already typed for the first two
  const two = resizeTiers({ tier_names: ["A", "B", "C"], tier_notes: ["", "", ""], items, language: "vi" }, 2);
  assert.deepEqual(two.tier_names, ["A", "B"]);
  assert.deepEqual(two.items[0].prices, [150000, 200000]);
  const d = draftFromPreset("coloring", "vi", "Phúc");
  assert.equal(d.tier_names.length, 2);
  assert.equal(d.currency, "VND");
  assert.ok(d.items.some((x) => x.optional));
  const text = quoteAsText({ ...d, code: "BG-2026-001", client_name: "Chị Thảo", book_size: "21 × 21 cm", items });
  assert.ok(text.includes("Khổ sách: 21 × 21 cm"));
  assert.ok(text.startsWith("BÁO GIÁ · BG-2026-001\nGửi: Chị Thảo"));
  assert.ok(text.includes("Tuỳ chọn thêm:"));
});

test("báo giá: số lượng khác nhau theo từng phương án (16+6 / 20+4)", async () => {
  const { tierTotals, qtyText, quoteAsText, draftFromPreset } = await import("../src/lib/quote.ts");
  const it = (o) => ({ id: "x", kind: "item", name: "", description: "", qty: 1, unit: "trang", prices: [null, null], flat: true, optional: false, ...o });
  const items = [
    it({ name: "Thiết kế nhân vật", prices: [1_000_000, null] }), // one flat price, qty 1 in both
    it({ name: "Trang ruột", qtys: [16, 20], prices: [200_000, null] }),
    it({ name: "Trang sticker", qtys: [6, 4], prices: [300_000, null] }),
  ];
  // A: 1.000.000 + 16×200.000 + 6×300.000 = 6.000.000 · B: 1.000.000 + 20×200.000 + 4×300.000 = 6.200.000
  assert.deepEqual(tierTotals(items, 2).map((t) => t.total), [6_000_000, 6_200_000]);
  assert.equal(qtyText(items[1], 2), "16 / 20");
  assert.equal(qtyText(items[0], 2), "1");
  const text = quoteAsText({ ...draftFromPreset("blank", "vi", ""), code: "BG-1", tier_names: ["PA A", "PA B"], tier_notes: ["", ""], items });
  assert.ok(text.includes("• Trang ruột — 16 / 20 trang"));
  assert.ok(text.includes("PA A: 3.200.000 ₫ · PA B: 4.000.000 ₫"));
});

test("báo giá: các đợt thanh toán tính theo tổng từng mức, cộng lại đúng bằng tổng", async () => {
  const { paymentAmounts, paymentsFromPreset, percentTotal, draftFromPreset, quoteAsText } = await import("../src/lib/quote.ts");
  const p = (percent) => ({ id: String(percent), label: "", percent });
  // 30/40/30 of 6.800.000 ₫
  assert.deepEqual(paymentAmounts(6_800_000, [p(30), p(40), p(30)], "VND"), [2_040_000, 2_720_000, 2_040_000]);
  // Thirds of 10.000.000 ₫: rounded to 1.000 ₫, the last takes the rest so the sum is exact
  const thirds = paymentAmounts(10_000_000, [p(33.33), p(33.33), p(33.34)], "VND");
  assert.deepEqual(thirds, [3_333_000, 3_333_000, 3_334_000]);
  assert.equal(thirds.reduce((s, v) => s + v, 0), 10_000_000);
  // USD to the cent
  assert.deepEqual(paymentAmounts(1250.5, [p(50), p(50)], "USD"), [625.25, 625.25]);
  // Shares that don't add up to 100% are shown as they are (the editor warns)
  assert.deepEqual(paymentAmounts(1_000_000, [p(30), p(30)], "VND"), [300_000, 300_000]);
  assert.equal(percentTotal([p(30), p(40), p(30)]), 100);
  // New quotes start with 50/50; a test piece is paid in one go
  assert.deepEqual(draftFromPreset("picture", "vi", "").payments.map((x) => x.percent), [50, 50]);
  assert.deepEqual(draftFromPreset("test", "en", "").payments.map((x) => [x.label, x.percent]), [["Full payment to start", 100]]);
  assert.equal(paymentsFromPreset("30-40-30", "vi")[1].label, "Khi duyệt xong phác thảo");
  // In the copied message, per tier
  const it = { id: "x", kind: "item", name: "Trang", description: "", qty: 10, unit: "trang", prices: [100_000, 200_000], flat: false, optional: false };
  const text = quoteAsText({
    ...draftFromPreset("blank", "vi", ""),
    code: "BG-1",
    tier_names: ["Cơ bản", "Chi tiết"],
    tier_notes: ["", ""],
    items: [it],
    payments: paymentsFromPreset("50-50", "vi"),
  });
  assert.ok(text.includes("Các đợt thanh toán:\n1. Đặt cọc khi bắt đầu (50%): Cơ bản 500.000 ₫ · Chi tiết 1.000.000 ₫"));
});

test("máy chấm công vân tay: vào, về, chạm lại, giờ web bị thay, quét bù khi mất mạng", async () => {
  const { planScan, scanTime, lateMinutes, screenFor, asciiFold, vnDate } = await import("../src/lib/clockMath.ts");
  const at = (hhmm, day = "2026-09-29") => new Date(`${day}T${hhmm}:00+07:00`);
  const rules = { workStartMinutes: 9 * 60, graceMinutes: 5 };
  // First finger of the day → check-in
  const first = planScan(null, at("08:57"));
  assert.equal(first.action, "check_in");
  assert.equal(first.insert, true);
  assert.equal(first.patch.check_in_source, "device");
  // A web check-in from home at 08:40, then the finger at 09:20 → the finger's time wins
  const web = { id: "a", status: "present", check_in_at: at("08:40").toISOString(), check_in_source: "web" };
  const replaced = planScan(web, at("09:20"));
  assert.equal(replaced.action, "check_in");
  assert.equal(replaced.patch.check_in_at, at("09:20").toISOString());
  // …but a first finger after noon with only a web check-in is someone leaving
  assert.equal(planScan(web, at("18:31")).action, "check_out");
  // Machine check-in, touched again a minute later → nothing changes
  const dev = { id: "b", status: "present", check_in_at: at("08:57").toISOString(), check_in_source: "device", check_out_at: null };
  assert.equal(planScan(dev, at("08:58")).action, "repeat");
  // …evening touch → giờ về; a later one moves giờ về later
  const out = planScan(dev, at("18:35"));
  assert.equal(out.action, "check_out");
  assert.equal(out.patch.check_out_at, at("18:35").toISOString());
  assert.equal(planScan({ ...dev, check_out_at: at("18:35").toISOString() }, at("19:10")).action, "check_out");
  // Marked absent in advance, then came in → present
  assert.equal(planScan({ id: "c", status: "absent", check_in_at: null }, at("09:02")).patch.status, "present");
  // An 08:50 scan sent late (Wi-Fi was down) after a 09:30 one → 08:50 is the arrival, 09:30 becomes giờ về
  const late = planScan({ ...dev, check_in_at: at("09:30").toISOString() }, at("08:50"));
  assert.equal(late.patch.check_in_at, at("08:50").toISOString());
  assert.equal(late.patch.check_out_at, at("09:30").toISOString());
  // The machine's own clock is believed for the last 3 days, not the future
  const now = at("10:00");
  assert.equal(scanTime(Math.floor(at("08:50").getTime() / 1000), now).toISOString(), at("08:50").toISOString());
  assert.equal(scanTime(Math.floor(at("10:30").getTime() / 1000), now), now);
  assert.equal(scanTime(0, now), now);
  assert.equal(vnDate(new Date("2026-09-29T17:30:00Z")), "2026-09-30"); // 00:30 VN time is the next day
  // Late: 09:05 on time, 09:12 → 12 minutes
  assert.equal(lateMinutes(at("09:05"), rules), 0);
  assert.equal(lateMinutes(at("09:12"), rules), 12);
  assert.deepEqual(screenFor(first, "Nhật Vy", at("09:12"), rules, false), { title: "Chao Nhat Vy", big: "Vao 09:12", note: "Tre 12 phut", tone: "warn" });
  assert.equal(asciiFold("Đỗ Thuỳ Dung"), "Do Thuy Dung");
});

test("upwork hiệu quả: chạy đều mỗi giờ, phễu, tỉ lệ sếp giữ lại, điểm chấm", async () => {
  const { upworkStats } = await import("../src/lib/upworkStats.ts");
  const now = Date.parse("2026-09-30T02:30:00Z"); // 09:30 VN
  // 24 hourly checks over the last day, 3 of them found jobs
  const batches = Array.from({ length: 24 }, (_, i) => ({
    id: `b${i}`,
    ran_at: new Date(now - (i + 0.5) * 3600e3).toISOString(),
    jobs_found: i % 8 === 0 ? 5 : 0,
    leads_drafted: 0,
  }));
  const lead = (id, status, fit, tpl) => ({ batch_id: id, status, fit_score: fit, template_name: tpl, created_at: batches[0].ran_at });
  const leads = [
    lead("b0", "hired", 5, "Sách tranh"),
    lead("b0", "replied", 5, "Sách tranh"),
    lead("b8", "sent", 4, "Tô màu"),
    lead("b8", "rejected", 3, null),
    lead("b16", "rejected", 3, null),
    lead("b16", "pending", 4, null),
  ];
  const s = upworkStats(batches, leads, 7, now);
  assert.equal(s.checks, 24);
  // 10:00 yesterday → 09:xx now, hourly: every working hour (7h–24h) had its check; 00–06 don't count
  assert.equal(s.expectedHours, 17);
  assert.equal(s.coveredHours, 17);
  assert.equal(s.uptime, 100);
  assert.equal(s.found, 15);
  assert.equal(s.drafted, 6);
  assert.equal(s.fitRate, 40); // 6 of 15
  assert.equal(s.kept, 3);
  assert.equal(s.rejected, 2);
  assert.equal(s.keptRate, 60); // 3 kept of 5 decided
  assert.equal(s.replyRate, 67); // 2 of 3 sent
  assert.deepEqual(s.funnel.map((f) => f.value), [15, 6, 3, 3, 2, 1]);
  // ★5: 2 of 2 kept; ★3: 0 of 2 — the scoring lines up with sếp's choices
  assert.equal(s.byScore.find((r) => r.score === 5).keptRate, 100);
  assert.equal(s.byScore.find((r) => r.score === 3).keptRate, 0);
  assert.equal(s.byScore.find((r) => r.score === 4).reviewed, 1); // the pending one isn't counted
  assert.deepEqual(s.templates[0], { name: "Sách tranh", sent: 2, replied: 2 });
  assert.equal(s.byDay.length, 2); // the checks began yesterday — no empty days before that
  assert.equal(s.byDay.reduce((n, d) => n + d.checks, 0), 24);
});

test("upwork yêu cầu đầu vào: đọc ngân sách, lọc job, thử trên job cũ", async () => {
  const { parseBudget, filterReason, previewFilters, normalizeFilters, DEFAULT_UPWORK_FILTERS } = await import("../src/lib/upworkFilters.ts");
  assert.deepEqual(parseBudget("$1,500 fixed · Intermediate"), { type: "fixed", min: 1500, max: 1500 });
  assert.deepEqual(parseBudget("$25–40/hr"), { type: "hourly", min: 25, max: 40 });
  assert.deepEqual(parseBudget("Hourly: $15.00 - $30.00"), { type: "hourly", min: 15, max: 30 });
  assert.deepEqual(parseBudget("$2k budget"), { type: "fixed", min: 2000, max: 2000 });
  assert.deepEqual(parseBudget("Not specified"), { type: null, min: null, max: null });
  const f = normalizeFilters({ minFixedBudget: "$500", minHourlyRate: "20", minFitScore: 4, noBudget: "skip", excludeKeywords: "logo, NFT" });
  const job = (job_title, budget_text, fit_score = 4) => ({ job_title, budget_text, fit_score });
  assert.equal(filterReason(job("Children's picture book", "$1,500 fixed"), f), null);
  assert.equal(filterReason(job("Picture book", "$300 fixed"), f), "ngân sách $300 < $500");
  assert.equal(filterReason(job("Picture book", "$12–18/hr"), f), "$18/giờ < $20/giờ");
  assert.equal(filterReason(job("Picture book", "$25–40/hr"), f), null);
  assert.equal(filterReason(job("Picture book", ""), f), "chưa ghi ngân sách");
  assert.equal(filterReason(job("Mascot LOGO for bakery", "$900"), f), 'có từ "logo"');
  assert.equal(filterReason(job("Picture book", "$900", 3), f), "dưới 4★");
  assert.equal(filterReason(job("Picture book", "$900", null), f), null); // unscored older job: not judged on stars
  // With nothing set, everything passes (today's behaviour)
  assert.equal(filterReason(job("Anything", "", 3), DEFAULT_UPWORK_FILTERS), null);
  const p = previewFilters([job("A", "$1,500"), job("B", "$300"), job("C", "$200"), job("D", "$900", 3)], f);
  assert.equal(p.kept, 1);
  assert.equal(p.dropped, 3);
  assert.deepEqual(p.reasons[0], { reason: "ngân sách thấp", count: 2 });
  // Junk from the database is tidied
  assert.equal(normalizeFilters({ minFitScore: 9, noBudget: "maybe" }).minFitScore, 3);
  assert.equal(normalizeFilters({ noBudget: "maybe" }).noBudget, "keep");
});

test("báo giá: “anh/chị” tự đổi thành tên khách (chỉ báo giá tiếng Việt)", async () => {
  const { personalize } = await import("../src/lib/quote.ts");
  const intro = "Cảm ơn anh/chị đã tin tưởng Funti Kidbooks. Anh/chị chọn phương án phù hợp nhất nhé, anh / chị nhé.";
  assert.equal(personalize(intro, "Trí Việt", "vi"), "Cảm ơn Trí Việt đã tin tưởng Funti Kidbooks. Trí Việt chọn phương án phù hợp nhất nhé, Trí Việt nhé.");
  assert.equal(personalize(intro, "  ", "vi"), intro); // no name yet: stays anh/chị
  assert.equal(personalize("Thank you anh/chị", "Anna", "en"), "Thank you anh/chị"); // English quotes untouched
});

test("quản lý dự án: phòng ↔ thẻ, giai đoạn, ai trống / sắp xong / nhiều việc", async () => {
  const { buildPm, matchTask, stageOf, clientKey } = await import("../src/lib/pmMath.ts");
  assert.equal(stageOf("Sketch Story Board"), "sketch");
  assert.equal(stageOf("Color"), "color");
  assert.equal(stageOf("Final 2026"), "final");
  assert.equal(stageOf("Theo Giờ"), "hourly");
  assert.equal(stageOf("Sample"), "sample");
  assert.equal(clientKey("Dự án Martina"), "martina");
  const task = (title, column_title, o = {}) => ({ id: title, code: "#1", title, column_title, due_date: null, due_complete: false, created_at: "2026-09-01", ...o });
  const tasks = [
    task("Kelly Dorval- Canadian Backyard Adventure- Nhân", "Sketch Story Board", { due_date: "2026-10-03" }),
    task("Carrie Lipson-test page- Bích", "Color"),
    task("Kelly Dorval- old book", "Final 2025", { created_at: "2025-01-01" }),
  ];
  assert.equal(matchTask("Kelly Dorval- Nhân", tasks).title, "Kelly Dorval- Canadian Backyard Adventure- Nhân"); // not the Final one
  assert.equal(matchTask("Carrie Liípon - Bích", tasks).title, "Carrie Lipson-test page- Bích"); // typo tolerated
  assert.equal(matchTask("Tamped Book- Lan", tasks), null);
  const room = (id, name, memberIds, o = {}) => ({ id, name, icon: "💬", billing_type: "milestone", weekly_hour_cap: null, last_message_at: "2026-09-28T10:00:00Z", created_at: "2026-09-01", memberIds, ...o });
  const staff = ["Nhân", "Bích", "Lan", "Vy"].map((n) => ({ id: n, display_name: n, role: "Artist", avatar_url: null }));
  const pm = buildPm({
    today: "2026-09-29",
    weekStart: "2026-09-28",
    rooms: [
      room("r1", "Kelly Dorval- Nhân", ["Nhân", "boss"]),
      room("r2", "Carrie Liípon - Bích", ["Bích"]),
      room("r3", "Tamped Book- Lan", ["Lan", "Nhân"], { billing_type: "hourly", weekly_hour_cap: 20, last_message_at: "2026-09-20T10:00:00Z" }),
      room("r4", "A- Lan", ["Lan"]), room("r5", "B- Lan", ["Lan"]), room("r6", "C- Lan", ["Lan"]),
    ],
    tasks,
    staff,
    hours: [
      { profile_id: "Lan", project_channel_id: "r3", work_date: "2026-09-29", hours: 3, minutes: 30 },
      { profile_id: "Lan", project_channel_id: "r3", work_date: "2026-09-26", hours: 5, minutes: 0 }, // last week
    ],
  });
  const byId = Object.fromEntries(pm.projects.map((p) => [p.id, p]));
  assert.equal(byId.r1.stage, "sketch");
  assert.equal(byId.r1.dueInDays, 4);
  assert.ok(byId.r1.flags.dueSoon);
  assert.deepEqual(byId.r1.leadIds, ["Nhân"]);
  assert.deepEqual(byId.r1.memberIds, ["Nhân"]); // non-staff members (managers) left out
  assert.ok(byId.r2.flags.nearlyDone);
  assert.equal(byId.r3.stage, "hourly");
  assert.equal(byId.r3.weekMinutes, 210);
  assert.equal(byId.r3.capMinutes, 1200);
  assert.ok(byId.r3.flags.quiet);
  const status = Object.fromEntries(pm.staff.map((s) => [s.person.id, s.status]));
  assert.equal(status.Vy, "free");
  assert.equal(status["Bích"], "finishing");
  assert.equal(status.Lan, "busy");
  assert.equal(status["Nhân"], "normal");
  assert.equal(pm.staff[0].person.id, "Vy"); // free people first
  assert.equal(pm.projects[0].id, "r1"); // most urgent first
  assert.equal(pm.totals.free, 1);
  assert.equal(pm.totals.weekMinutes, 210);
});
