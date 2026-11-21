import { r2 } from './calc.js';
const pad = (n) => String(n).padStart(2, '0');

export function addMonths(s, n) {
  const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1, d = +s.slice(8, 10);
  const t = y * 12 + m + n;
  const ny = Math.floor(t / 12), nm = t % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

export function contractStatement(c, payments, asOf) {
  const limit = c.end_date && c.end_date < asOf ? c.end_date : asOf;
  const installments = [];
  for (let k = 0; k < 600; k++) {
    const due = addMonths(c.start_date, k * c.period_months);
    if (due > limit) break;
    installments.push({ n: k + 1, due, amount: r2(c.amount) });
  }
  const total = r2(installments.length * Number(c.amount));
  const paid = r2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const remaining = r2(total - paid);
  const next = c.active ? addMonths(c.start_date, installments.length * c.period_months) : null;
  const status = remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return { installments, total, paid, remaining, next, status };
}
