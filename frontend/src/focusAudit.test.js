import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFocusTotals } from './focusAudit.js';
const week = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${10 + i}`, seconds: i === 0 ? 61 : 0 }));
test('focus audit compares exact seconds, not rounded minutes, and reports differences', () => {
  assert.equal(compareFocusTotals(week, { start_date: '2026-10-10', end_date: '2026-10-16', total_seconds: 61 }).matched, true);
  assert.equal(compareFocusTotals(week, { start_date: '2026-10-10', end_date: '2026-10-16', total_seconds: 60 }).matched, false);
});
test('focus audit rejects malformed or mismatched ranges instead of claiming success', () => {
  assert.throws(() => compareFocusTotals(week, { start_date: '2026-10-09', end_date: '2026-10-16', total_seconds: 61 }));
  assert.throws(() => compareFocusTotals([], {}));
});
