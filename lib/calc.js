export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ym = (y, m) => y * 12 + (m - 1);
const fromYm = (v) => ({ year: Math.floor(v / 12), month: (v % 12) + 1 });

export function roomKwh(rd) {
  if (!rd) return 0;
  if (rd.manual_kwh != null && rd.manual_kwh !== '') return r2(rd.manual_kwh);
  if (rd.curr_reading == null || rd.prev_reading == null) return 0;
  return Math.max(0, r2(rd.curr_reading - rd.prev_reading));
}

// توزيع فاتورة عداد رئيسي حسب الاستهلاك الفعلي (والرسوم: proportional أو equal)
export function distributeBill(bill, kwhByRoom, roomIds) {
  const out = {};
  roomIds.forEach((id) => (out[id] = { kwh: kwhByRoom[id] || 0, consumption: 0, fees: 0, total: 0 }));
  const active = roomIds.filter((id) => (kwhByRoom[id] || 0) > 0);
  if (!active.length) return out;
  const split = (amount, weightOf, field) => {
    const wsum = active.reduce((s, id) => s + weightOf(id), 0);
    let used = 0;
    active.forEach((id, i) => {
      const part = i === active.length - 1 ? r2(amount - used) : r2((amount * weightOf(id)) / wsum);
      used = r2(used + part);
      out[id][field] = part;
    });
  };
  split(Number(bill.amount) || 0, (id) => kwhByRoom[id], 'consumption');
  split(Number(bill.extra_fees) || 0, bill.fee_method === 'equal' ? () => 1 : (id) => kwhByRoom[id], 'fees');
  active.forEach((id) => (out[id].total = r2(out[id].consumption + out[id].fees)));
  return out;
}

// كشف حساب مستأجر شهراً بشهر؛ المديونية تُشتق فلا تتكرر
export function buildStatement(data, toYear, toMonth) {
  const monthOf = (d) => { const x = new Date(d); return ym(x.getUTCFullYear(), x.getUTCMonth() + 1); };
  const keys = [
    ...data.rents.map((x) => ym(x.year, x.month)),
    ...data.electricity.map((x) => ym(x.year, x.month)),
    ...data.adjustments.map((x) => ym(x.year, x.month)),
    ...data.maintenance.map((x) => monthOf(x.date)),
    ...data.payments.map((x) => monthOf(x.paid_at)),
  ];
  if (!keys.length) return [];
  const start = Math.min(...keys);
  const end = ym(toYear, toMonth);
  const sum = (arr) => r2(arr.reduce((s, x) => s + Number(x.amount), 0));
  const rows = [];
  let prev = 0;
  for (let k = start; k <= end; k++) {
    const { year, month } = fromYm(k);
    const same = (x) => ym(x.year, x.month) === k;
    const rent = sum(data.rents.filter(same));
    const electricity = sum(data.electricity.filter(same));
    const maintenance = sum(data.maintenance.filter((x) => x.payer === 'tenant' && monthOf(x.date) === k));
    const extras = sum(data.adjustments.filter((x) => same(x) && x.kind === 'expense'));
    const discounts = sum(data.adjustments.filter((x) => same(x) && x.kind === 'discount'));
    const paid = sum(data.payments.filter((x) => monthOf(x.paid_at) === k));
    const total_due = r2(rent + electricity + maintenance + extras - discounts + prev);
    const remaining = r2(total_due - paid);
    const status = remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    rows.push({ year, month, rent, electricity, maintenance, extras, discounts,
      previous_balance: prev, total_due, paid, remaining, status });
    prev = remaining;
  }
  return rows;
}
