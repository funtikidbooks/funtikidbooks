// Lượt truy cập web: which days a span covers and how its bars are grouped,
// checked against Google Analytics' own week/month keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ANALYTICS_START, bucketFrames, comparisonRanges, grainFor, isRealDate, isoWeekKey, previousRange, resolveRange } from "../src/lib/analyticsRange.ts";

const TODAY = "2026-10-05";

test("khoảng mặc định là 7 ngày tính cả hôm nay", () => {
  assert.deepEqual(resolveRange({}, TODAY), { key: "7", start: "2026-09-29", end: TODAY, clipped: false, label: "7 ngày" });
});

test("khoảng dài hơn số liệu đang có thì bắt đầu từ ngày Google Analytics bắt đầu ghi", () => {
  const r = resolveRange({ ky: "90" }, TODAY);
  assert.equal(r.start, ANALYTICS_START);
  assert.equal(r.clipped, true);
  assert.equal(resolveRange({ ky: "tat-ca" }, TODAY).start, ANALYTICS_START);
  assert.equal(resolveRange({ ky: "tat-ca" }, TODAY).clipped, false);
});

test("tự chọn ngày: đảo lại nếu chọn ngược, không quá hôm nay", () => {
  const r = resolveRange({ tu: "2026-10-09", den: "2026-09-25" }, TODAY);
  assert.deepEqual(r, { key: "tu-chon", start: "2026-09-25", end: TODAY, clipped: false, label: "25/09/2026 – 05/10/2026" });
  // Rubbish falls back to 7 ngày.
  assert.equal(resolveRange({ tu: "abc", den: "2026-10-01" }, TODAY).key, "7");
  // Entirely before the data began: nothing to show, so 7 ngày.
  assert.equal(resolveRange({ tu: "2026-01-01", den: "2026-02-01" }, TODAY).key, "7");
});

test("tuần ISO giống Google Analytics (isoYearIsoWeek)", () => {
  assert.equal(isoWeekKey("2026-09-23"), "202639");
  assert.equal(isoWeekKey("2026-09-28"), "202640");
  assert.equal(isoWeekKey("2026-10-04"), "202640");
  assert.equal(isoWeekKey("2026-10-05"), "202641");
  assert.equal(isoWeekKey("2027-01-01"), "202653"); // a Friday: still 2026's last week
  assert.equal(isoWeekKey("2029-12-31"), "203001"); // a Monday: already 2030's first week
});

test("cột theo ngày / tuần / tháng tuỳ độ dài", () => {
  assert.equal(grainFor("2026-10-01", "2026-10-31"), "day");
  assert.equal(grainFor("2026-10-01", "2026-11-01"), "week");
  assert.equal(grainFor("2026-10-01", "2027-01-28"), "week");
  assert.equal(grainFor("2026-10-01", "2027-01-29"), "month");

  const days = bucketFrames("2026-09-29", TODAY, "day");
  assert.equal(days.length, 7);
  assert.deepEqual(days[0], { key: "20260929", label: "29/09", title: "29/09/2026" });

  const weeks = bucketFrames("2026-09-23", "2026-10-05", "week");
  assert.deepEqual(
    weeks.map((w) => [w.key, w.title]),
    [
      ["202639", "Tuần 23/09 – 27/09"],
      ["202640", "Tuần 28/09 – 04/10"],
      ["202641", "Tuần 05/10"],
    ],
  );

  const months = bucketFrames("2026-09-23", "2027-01-10", "month");
  assert.deepEqual(months.map((m) => m.key), ["202609", "202610", "202611", "202612", "202701"]);
  assert.equal(months[3].title, "Tháng 12/2026");
  assert.equal(months[4].title, "Tháng 01/2027 (01/01 – 10/01)");
});

test("ngày không có thật thì không nhận (31/09, 30/02)", () => {
  assert.equal(isRealDate("2026-09-31"), false);
  assert.equal(isRealDate("2026-02-30"), false);
  assert.equal(isRealDate("2027-02-29"), false);
  assert.equal(isRealDate("2028-02-29"), true);
  assert.equal(resolveRange({ tu: "2026-09-31", den: "2026-10-03" }, TODAY).key, "7");
});

test("tháng bị cắt ở hai đầu ghi rõ những ngày nào", () => {
  const months = bucketFrames("2026-10-06", "2027-10-05", "month");
  assert.equal(months[0].title, "Tháng 10/2026 (06/10 – 31/10)");
  assert.equal(months[1].title, "Tháng 11/2026");
  assert.equal(months.at(-1).title, "Tháng 10/2027 (01/10 – 05/10)");
});

test("so sánh kỳ trước không tính hôm nay (chưa hết ngày)", () => {
  // 7 ngày 29/09–05/10 on 05/10: 29/09–04/10 against 23/09–28/09.
  assert.deepEqual(comparisonRanges("2026-09-29", TODAY, TODAY), {
    current: { start: "2026-09-29", end: "2026-10-04" },
    previous: { start: "2026-09-23", end: "2026-09-28" },
    withoutToday: true,
  });
  // A span that ended before today is compared whole.
  assert.deepEqual(comparisonRanges("2026-10-01", "2026-10-03", TODAY), {
    current: { start: "2026-10-01", end: "2026-10-03" },
    previous: { start: "2026-09-28", end: "2026-09-30" },
    withoutToday: false,
  });
  // Only today: nothing whole to compare.
  assert.equal(comparisonRanges(TODAY, TODAY, TODAY), null);
});

test("so với kỳ trước chỉ khi kỳ trước có đủ số liệu", () => {
  // The 7 days before 29/09 start on 22/09, before the data began → none.
  assert.equal(previousRange("2026-09-29", TODAY), null);
  assert.deepEqual(previousRange("2026-10-01", "2026-10-05"), { start: "2026-09-26", end: "2026-09-30" });
  assert.deepEqual(previousRange("2026-09-30", "2026-10-06"), { start: "2026-09-23", end: "2026-09-29" });
});
