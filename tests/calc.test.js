import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement, distributeBill, roomKwh } from '../lib/calc.js';
const base = () => ({ rents: [], electricity: [], maintenance: [], adjustments: [], payments: [] });

test('ترحيل المديونية: مثال المستند', () => {
  const d = base();
  d.rents = [{ year: 2026, month: 1, amount: 500 }, { year: 2026, month: 2, amount: 500 }];
  d.electricity = [{ year: 2026, month: 1, amount: 100 }];
  d.payments = [{ paid_at: '2026-01-10', amount: 400 }];
  const s = buildStatement(d, 2026, 2);
  assert.equal(s[0].total_due, 600);
  assert.equal(s[0].remaining, 200);
  assert.equal(s[0].status, 'partial');
  assert.equal(s[1].previous_balance, 200);
  assert.equal(s[1].total_due, 700);
});

test('عدم تكرار المديونية عند إعادة الحساب', () => {
  const d = base();
  d.rents = [{ year: 2026, month: 1, amount: 500 }, { year: 2026, month: 2, amount: 500 }];
  const a = buildStatement(d, 2026, 3), b = buildStatement(d, 2026, 3);
  assert.deepEqual(a, b);
  assert.equal(a[2].previous_balance, 1000);
  assert.equal(a[2].total_due, 1000);
});

test('سداد مديونية قديمة والدفعات السابقة محفوظة', () => {
  const d = base();
  d.rents = [{ year: 2026, month: 1, amount: 500 }, { year: 2026, month: 2, amount: 500 }];
  d.payments = [{ paid_at: '2026-01-05', amount: 300 }, { paid_at: '2026-02-05', amount: 700 }];
  const s = buildStatement(d, 2026, 2);
  assert.equal(s[0].remaining, 200);
  assert.equal(s[1].total_due, 700);
  assert.equal(s[1].remaining, 0);
  assert.equal(s[1].status, 'paid');
  assert.equal(s[0].paid, 300);
});

test('الصيانة: على المستأجر تُضاف، على المؤجر لا', () => {
  const d = base();
  d.rents = [{ year: 2026, month: 3, amount: 400 }];
  d.maintenance = [{ date: '2026-03-04', amount: 50, payer: 'tenant' }, { date: '2026-03-06', amount: 300, payer: 'landlord' }];
  d.adjustments = [{ year: 2026, month: 3, kind: 'expense', amount: 20 }, { year: 2026, month: 3, kind: 'discount', amount: 30 }];
  const [m] = buildStatement(d, 2026, 3);
  assert.equal(m.maintenance, 50);
  assert.equal(m.total_due, 440);
});

test('بعد الإخلاء يبقى الرصيد في الكشف', () => {
  const d = base();
  d.rents = [{ year: 2026, month: 1, amount: 500 }];
  assert.equal(buildStatement(d, 2026, 3)[2].remaining, 500);
});

test('الكهرباء حسب الاستهلاك الفعلي لا بالتساوي', () => {
  const out = distributeBill({ amount: 300, extra_fees: 30, fee_method: 'proportional' }, { 1: 100, 2: 200, 3: 0 }, [1, 2, 3]);
  assert.equal(out[1].consumption, 100);
  assert.equal(out[2].consumption, 200);
  assert.equal(out[1].fees, 10);
  assert.equal(out[2].fees, 20);
  assert.equal(out[3].total, 0);
});

test('رسوم بالتساوي والمجموع مطابق للفاتورة', () => {
  const out = distributeBill({ amount: 100, extra_fees: 10, fee_method: 'equal' }, { 1: 10, 2: 20, 3: 30 }, [1, 2, 3]);
  assert.equal(Math.round((out[1].total + out[2].total + out[3].total) * 100) / 100, 110);
  assert.equal(Math.round((out[1].fees + out[2].fees + out[3].fees) * 100) / 100, 10);
});

test('الاستهلاك اليدوي والقراءات', () => {
  assert.equal(roomKwh({ prev_reading: 100, curr_reading: 250 }), 150);
  assert.equal(roomKwh({ manual_kwh: 80 }), 80);
  assert.equal(roomKwh({ prev_reading: 100, curr_reading: 250, manual_kwh: 80 }), 80);
  assert.equal(roomKwh(null), 0);
});
