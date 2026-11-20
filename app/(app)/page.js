'use client';
import { useDB, useMonth, Load, money } from '@/components/ui';
import { monthReport, landlordMaintenance } from '@/lib/data';
import { r2 } from '@/lib/calc';

export default function Dashboard() {
  const { db, err } = useDB();
  const { y, m, picker } = useMonth();
  const bad = Load({ db, err });
  if (bad) return bad;
  const rows = monthReport(db, y, m);
  const act = rows.filter((r) => r.active);
  const sum = (k) => r2(rows.reduce((s, r) => s + r[k], 0));
  const occ = db.tenants.filter((t) => t.active).length;
  const cnt = (s) => act.filter((r) => r.status === s).length;
  const bills = db.electricity_bills.filter((b) => b.year === y && b.month === m);
  const eTot = r2(bills.reduce((s, b) => s + Number(b.amount), 0));
  const ePaid = r2(bills.reduce((s, b) => s + Number(b.paid_amount || 0), 0));
  const items = [
    ['الغرف المشغولة', occ], ['الغرف الشاغرة', 20 - occ],
    ['إجمالي الإيجارات', money(sum('rent'))],
    ['فواتير الكهرباء', money(eTot)], ['كهرباء مدفوعة', money(ePaid)], ['كهرباء متبقية', money(eTot - ePaid)],
    ['صيانة على المستأجرين', money(sum('maintenance'))], ['صيانة على المؤجر', money(landlordMaintenance(db, y, m))],
    ['إجمالي الخصومات', money(sum('discounts'))], ['إجمالي المستحق', money(sum('total_due'))],
    ['إجمالي المحصّل', money(sum('paid'))], ['إجمالي المتبقي', money(sum('remaining'))],
    ['دفعوا', cnt('paid')], ['لم يدفعوا', cnt('unpaid')], ['دفعوا جزئياً', cnt('partial')],
  ];
  return (
    <>
      <h1>لوحة التحكم</h1>
      {picker}
      <div className="grid">
        {items.map(([t, v]) => <div key={t} className="card stat"><small>{t}</small><b>{v}</b></div>)}
      </div>
      <p className="muted">إجمالي المستحق يشمل المديونية السابقة المرحّلة.</p>
    </>
  );
}
