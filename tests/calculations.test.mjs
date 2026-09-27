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
