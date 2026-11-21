import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, contractStatement } from '../lib/contracts.js';

test('إضافة أشهر مع ضبط نهاية الشهر', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
});

test('عقد كل 3 أشهر', () => {
  const c = { start_date: '2026-01-10', period_months: 3, amount: 1500, active: true };
  const s = contractStatement(c, [{ amount: 1000 }], '2026-04-15');
  assert.equal(s.installments.length, 2);
  assert.equal(s.remaining, 2000);
  assert.equal(s.next, '2026-07-10');
});
