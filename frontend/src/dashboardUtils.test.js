import test from "node:test";
import assert from "node:assert/strict";
import { chinaDate, chartHeight, formatFocusDuration } from "./dashboardUtils.js";
import { readFocusMinutes, validFocusMinutes, writeFocusMinutes } from "./focusPreferences.js";

test("China dates change at UTC 16:00, independent of computer timezone", () => {
  assert.equal(chinaDate(new Date("2026-10-10T15:59:59Z")), "2026-10-10");
  assert.equal(chinaDate(new Date("2026-10-10T16:00:00Z")), "2026-10-11");
});

test("trend displays seconds and distinguishes activity from zero", () => {
  const week = [{ seconds: 0 }, { seconds: 7 }, { seconds: 10 }];
  assert.equal(chartHeight(0, week), 0);
  assert.equal(chartHeight(7, week), 84);
  assert.equal(chartHeight(10, week), 120);
  assert.equal(formatFocusDuration(7), "7秒");
  assert.equal(formatFocusDuration(65), "1分 5秒");
});

test("duration preference validates integer minutes and tolerates blocked storage", () => {
  for (const value of ["", 0, 241, 1.5, "invalid"]) assert.equal(validFocusMinutes(value), false);
  assert.equal(validFocusMinutes("45"), true);
  let value = null;
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  assert.equal(readFocusMinutes(storage), 25);
  writeFocusMinutes(storage, 45);
  assert.equal(readFocusMinutes(storage), 45);
  value = "broken";
  assert.equal(readFocusMinutes(storage), 25);
  assert.equal(readFocusMinutes({ getItem() { throw new Error("blocked"); } }), 25);
});
