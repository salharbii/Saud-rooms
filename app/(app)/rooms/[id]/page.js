'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useDB, Load, PayModal, Badge, money, MONTHS } from '@/components/ui';
import { electricityMap, tenantStatement, nowYM } from '@/lib/data';
import { roomKwh } from '@/lib/calc';

const METHODS = { cash: 'نقداً', transfer: 'تحويل', card: 'بطاقة', other: 'أخرى' };

export default function Statement() {
  const roomId = +useParams().id;
  const { db, err, reload } = useDB();
  const [sel, setSel] = useState(null);
  const [pay, setPay] = useState(false);
  const bad = Load({ db, err });
  if (bad) return bad;
  const tenants = db.tenants.filter((t) => t.room_id === roomId).sort((a, b) => b.start_date.localeCompare(a.start_date));
  if (!tenants.length) return <><h1>غرفة {roomId}</h1><p className="muted">لا يوجد مستأجرون سابقون لهذه الغرفة.</p></>;
  const t = tenants.find((x) => x.id === sel) || tenants.find((x) => x.active) || tenants[0];
  const { y, m } = nowYM();
  const emap = electricityMap(db);
  const st = tenantStatement(db, emap, t, y, m);
  const balance = st.length ? st[st.length - 1].remaining : 0;
  const pays = db.payments.filter((p) => p.tenant_id === t.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const maint = db.maintenance.filter((x) => x.tenant_id === t.id).sort((a, b) => b.date.localeCompare(a.date));
  const adj = db.adjustments.filter((x) => x.tenant_id === t.id);
  const elec = Object.entries(emap).map(([k, v]) => ({ k, v })).filter(({ k }) => k.startsWith(roomId + '-'));
  return (
    <>
      <h1>كشف حساب – غرفة {roomId}</h1>
      <div className="card">
        <b>{t.name}</b> {t.active ? <span className="badge occ">مستأجر حالي</span> : <span className="badge vac">مُخلى {t.end_date}</span>}
        <p className="muted" style={{ margin: '4px 0' }}>{t.phone || ''} • بداية الإيجار: {t.start_date}</p>
        <p>الرصيد المتبقي حتى الآن: <b style={{ color: balance > 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(balance)}</b></p>
        <div className="row no-print">
          <button className="btn sm" onClick={() => setPay(true)}>تسجيل دفعة</button>
          <button className="btn sm ghost" onClick={() => window.print()}>طباعة</button>
          {tenants.length > 1 && (
            <select style={{ width: 'auto' }} value={t.id} onChange={(e) => setSel(e.target.value)}>
              {tenants.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.start_date})</option>)}
            </select>
          )}
        </div>
      </div>
      <h3 style={{ marginTop: 16 }}>الحساب الشهري</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>الشهر</th><th>الإيجار</th><th>الكهرباء</th><th>الصيانة</th><th>إضافي</th><th>خصومات</th><th>مديونية سابقة</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead>
        <tbody>{st.map((r) => (
          <tr key={r.year + '-' + r.month}>
            <td>{MONTHS[r.month - 1]} {r.year}</td><td>{money(r.rent)}</td><td>{money(r.electricity)}</td><td>{money(r.maintenance)}</td>
            <td>{money(r.extras)}</td><td>{money(r.discounts)}</td><td>{money(r.previous_balance)}</td>
            <td>{money(r.total_due)}</td><td>{money(r.paid)}</td><td><b>{money(r.remaining)}</b></td><td><Badge s={r.status} /></td>
          </tr>))}</tbody>
      </table></div>
      <h3 style={{ marginTop: 16 }}>الدفعات</h3>
      <div className="tablewrap"><table style={{ minWidth: 0 }}>
        <thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظة</th></tr></thead>
        <tbody>{pays.map((p) => <tr key={p.id}><td>{p.paid_at}</td><td>{money(p.amount)}</td><td>{METHODS[p.method]}</td><td>{p.note || ''}</td></tr>)}
          {!pays.length && <tr><td colSpan="4" className="muted">لا دفعات</td></tr>}</tbody>
      </table></div>
      <h3 style={{ marginTop: 16 }}>فواتير الكهرباء</h3>
      <div className="tablewrap"><table style={{ minWidth: 0 }}>
        <thead><tr><th>الشهر</th><th>الاستهلاك (كيلوواط)</th><th>التكلفة</th><th>رسوم موزعة</th><th>الإجمالي</th></tr></thead>
        <tbody>{elec.filter(({ v }) => v.kwh > 0).map(({ k, v }) => { const [, yy, mm] = k.split('-'); return (
          <tr key={k}><td>{MONTHS[mm - 1]} {yy}</td><td>{v.kwh}</td><td>{money(v.consumption)}</td><td>{money(v.fees)}</td><td>{money(v.total)}</td></tr>); })}</tbody>
      </table></div>
      <h3 style={{ marginTop: 16 }}>الصيانة والمصاريف والخصومات</h3>
      <div className="tablewrap"><table style={{ minWidth: 0 }}>
        <thead><tr><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>المسؤول</th></tr></thead>
        <tbody>
          {maint.map((x) => <tr key={x.id}><td>{x.date}</td><td>صيانة: {x.description}</td><td>{money(x.amount)}</td><td>{x.payer === 'tenant' ? 'المستأجر' : 'المؤجر (لا تُحسب عليه)'}</td></tr>)}
          {adj.map((x) => <tr key={x.id}><td>{MONTHS[x.month - 1]} {x.year}</td><td>{x.kind === 'expense' ? 'مصروف' : 'خصم'}: {x.reason}</td><td>{money(x.amount)}</td><td>{x.kind === 'expense' ? 'يُضاف' : 'يُخصم'}</td></tr>)}
        </tbody>
      </table></div>
      {pay && <PayModal tenant={t} remaining={balance} onClose={() => setPay(false)} onSaved={() => { setPay(false); reload(); }} />}
    </>
  );
}
