'use client';
import { useEffect, useState } from 'react';
import { useDB, useMonth, Load, Badge, money, MONTHS } from '@/components/ui';
import { supabase, must } from '@/lib/supabase';

const stat = (a, p) => { a = Number(a) || 0; p = Number(p) || 0; return p <= 0 ? 'unpaid' : p >= a ? 'paid' : 'partial'; };

export default function Electricity() {
  const { db, err, reload } = useDB();
  const { y, m, picker } = useMonth();
  const [f, setF] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!db) return;
    const o = {};
    [1, 2].forEach((id) => {
      const b = db.electricity_bills.find((x) => x.main_meter_id === id && x.year === y && x.month === m);
      o[id] = { amount: b ? String(b.amount) : '', paid: b ? String(b.paid_amount ?? 0) : '' };
    });
    setF(o); setMsg('');
  }, [db, y, m]);

  const bad = Load({ db, err });
  if (bad) return bad;
  if (!f[1]) return null;

  async function save(id) {
    try {
      const a = f[id].amount;
      if (a === '' || !(+a > 0)) throw new Error('أدخل مبلغ الفاتورة');
      const paid = Number(f[id].paid) || 0;
      if (paid < 0) throw new Error('المبلغ المدفوع غير صحيح');
      if (paid > +a) throw new Error('المبلغ المدفوع أكبر من الفاتورة');
      must(await supabase.from('electricity_bills').upsert(
        { main_meter_id: id, year: y, month: m, amount: +a, extra_fees: 0, paid_amount: paid },
        { onConflict: 'main_meter_id,year,month' }));
      setMsg('تم حفظ فاتورة العداد ' + id); reload();
    } catch (e) { setMsg('خطأ: ' + e.message); }
  }

  const set = (id, k) => (e) => setF({ ...f, [id]: { ...f[id], [k]: e.target.value } });
  const month = db.electricity_bills.filter((b) => b.year === y && b.month === m);
  const tot = month.reduce((s, b) => s + Number(b.amount), 0);
  const paidTot = month.reduce((s, b) => s + Number(b.paid_amount || 0), 0);
  const all = [...db.electricity_bills].sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month) || a.main_meter_id - b.main_meter_id);

  return (
    <>
      <h1>فواتير الكهرباء</h1>
      {picker}
      {msg && <p className={msg.startsWith('خطأ') ? 'errbox' : 'badge paid'}>{msg}</p>}
      <div className="rooms">
        {[1, 2].map((id) => (
          <div key={id} className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}>
              <b>العداد {id === 1 ? 'الأول' : 'الثاني'}</b>
              <Badge s={stat(f[id].amount, f[id].paid)} />
            </div>
            <label style={{ marginTop: 10 }}>مبلغ الفاتورة (ر.س)<input type="number" value={f[id].amount} onChange={set(id, 'amount')} /></label>
            <label>المبلغ المدفوع (ر.س)<input type="number" value={f[id].paid} onChange={set(id, 'paid')} /></label>
            <p className="muted">المتبقي: <b>{money((+f[id].amount || 0) - (+f[id].paid || 0))}</b></p>
            <div className="row">
              <button className="btn" onClick={() => save(id)}>حفظ</button>
              <button className="btn ghost" onClick={() => setF({ ...f, [id]: { ...f[id], paid: f[id].amount } })}>سداد كامل</button>
            </div>
          </div>
        ))}
      </div>
      <p>إجمالي {MONTHS[m - 1]}: <b>{money(tot)}</b> • المدفوع: <b>{money(paidTot)}</b> • المتبقي: <b>{money(tot - paidTot)}</b></p>
      <h3 style={{ marginTop: 16 }}>سجل الفواتير</h3>
      <div className="tablewrap"><table style={{ minWidth: 0 }}>
        <thead><tr><th>الشهر</th><th>العداد</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead>
        <tbody>
          {all.map((b) => (
            <tr key={b.id}><td>{MONTHS[b.month - 1]} {b.year}</td><td>{b.main_meter_id}</td><td>{money(b.amount)}</td><td>{money(b.paid_amount)}</td><td>{money(b.amount - (b.paid_amount || 0))}</td><td><Badge s={stat(b.amount, b.paid_amount)} /></td></tr>
          ))}
          {!all.length && <tr><td colSpan="6" className="muted">لا فواتير</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
