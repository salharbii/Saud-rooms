'use client';
import { useState } from 'react';
import { useDB, useMonth, Load, money, MONTHS } from '@/components/ui';
import { supabase, must } from '@/lib/supabase';
import { today, dYM, ym, landlordMaintenance } from '@/lib/data';

export default function Maintenance() {
  const { db, err, reload } = useDB();
  const { y, m, picker } = useMonth();
  const [mf, setMf] = useState({ room: 1, desc: '', amount: '', date: today(), payer: 'tenant' });
  const [af, setAf] = useState({ room: 1, kind: 'expense', reason: '', amount: '', year: y, month: m });
  const [msg, setMsg] = useState('');
  const bad = Load({ db, err });
  if (bad) return bad;
  const activeOf = (room) => db.tenants.find((t) => t.room_id === +room && t.active);
  const tenantAt = (room, date) => db.tenants.find((t) => t.room_id === +room && dYM(t.start_date) <= dYM(date) && (!t.end_date || dYM(t.end_date) >= dYM(date)));

  async function addMaint() {
    try {
      if (!mf.desc.trim() || !(+mf.amount > 0)) throw new Error('أدخل الوصف والمبلغ');
      const t = tenantAt(mf.room, mf.date) || activeOf(mf.room);
      if (mf.payer === 'tenant' && !t) throw new Error('لا يوجد مستأجر في هذه الغرفة لتحميله الصيانة');
      must(await supabase.from('maintenance').insert({ room_id: +mf.room, tenant_id: t?.id || null, date: mf.date, description: mf.desc.trim(), amount: +mf.amount, payer: mf.payer }));
      setMf({ ...mf, desc: '', amount: '' }); setMsg('تمت إضافة الصيانة'); reload();
    } catch (e) { setMsg('خطأ: ' + e.message); }
  }
  async function addAdj() {
    try {
      if (!af.reason.trim() || !(+af.amount > 0)) throw new Error('أدخل السبب والمبلغ');
      const t = activeOf(af.room);
      if (!t) throw new Error('لا يوجد مستأجر حالي في هذه الغرفة');
      must(await supabase.from('adjustments').insert({ tenant_id: t.id, year: +af.year, month: +af.month, kind: af.kind, reason: af.reason.trim(), amount: +af.amount }));
      setAf({ ...af, reason: '', amount: '' }); setMsg('تمت الإضافة'); reload();
    } catch (e) { setMsg('خطأ: ' + e.message); }
  }
  const roomSel = (v, f) => (
    <select value={v} onChange={f}>{db.rooms.map((r) => <option key={r.id} value={r.id}>غرفة {r.id}</option>)}</select>
  );
  const list = db.maintenance.filter((x) => dYM(x.date) === ym(y, m)).sort((a, b) => b.date.localeCompare(a.date));
  const adjs = db.adjustments.filter((x) => x.year === y && x.month === m);
  return (
    <>
      <h1>الصيانة والمصاريف</h1>
      {msg && <p className={msg.startsWith('خطأ') ? 'errbox' : 'badge paid'}>{msg}</p>}
      <div className="card">
        <h3>تسجيل صيانة</h3>
        <div className="two">
          <label>الغرفة{roomSel(mf.room, (e) => setMf({ ...mf, room: e.target.value }))}</label>
          <label>المبلغ<input type="number" value={mf.amount} onChange={(e) => setMf({ ...mf, amount: e.target.value })} /></label>
          <label>التاريخ<input type="date" value={mf.date} onChange={(e) => setMf({ ...mf, date: e.target.value })} /></label>
          <label>المسؤول عن الدفع
            <select value={mf.payer} onChange={(e) => setMf({ ...mf, payer: e.target.value })}>
              <option value="tenant">على المستأجر (تُضاف لمستحقاته)</option><option value="landlord">على المؤجر (مصروف عليك)</option>
            </select>
          </label>
        </div>
        <label>وصف الصيانة<input value={mf.desc} onChange={(e) => setMf({ ...mf, desc: e.target.value })} /></label>
        <button className="btn" onClick={addMaint}>إضافة</button>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>مصروف إضافي أو خصم</h3>
        <div className="two">
          <label>الغرفة{roomSel(af.room, (e) => setAf({ ...af, room: e.target.value }))}</label>
          <label>النوع
            <select value={af.kind} onChange={(e) => setAf({ ...af, kind: e.target.value })}>
              <option value="expense">مصروف إضافي (يُضاف)</option><option value="discount">خصم (يُخصم)</option>
            </select>
          </label>
          <label>المبلغ<input type="number" value={af.amount} onChange={(e) => setAf({ ...af, amount: e.target.value })} /></label>
          <label>الشهر
            <select value={af.month} onChange={(e) => setAf({ ...af, month: e.target.value })}>{MONTHS.map((x, i) => <option key={i} value={i + 1}>{x}</option>)}</select>
          </label>
          <label>السنة<input type="number" value={af.year} onChange={(e) => setAf({ ...af, year: e.target.value })} /></label>
        </div>
        <label>السبب<input value={af.reason} onChange={(e) => setAf({ ...af, reason: e.target.value })} /></label>
        <button className="btn" onClick={addAdj}>إضافة</button>
      </div>
      <h3 style={{ marginTop: 16 }}>سجل الشهر</h3>
      {picker}
      <div className="tablewrap"><table style={{ minWidth: 0 }}>
        <thead><tr><th>الغرفة</th><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>المسؤول</th></tr></thead>
        <tbody>
          {list.map((x) => <tr key={x.id}><td>{x.room_id}</td><td>{x.date}</td><td>{x.description}</td><td>{money(x.amount)}</td><td>{x.payer === 'tenant' ? 'المستأجر' : 'المؤجر'}</td></tr>)}
          {adjs.map((x) => { const t = db.tenants.find((q) => q.id === x.tenant_id); return <tr key={x.id}><td>{t?.room_id}</td><td>{MONTHS[x.month - 1]}</td><td>{x.kind === 'expense' ? 'مصروف' : 'خصم'}: {x.reason}</td><td>{money(x.amount)}</td><td>{x.kind === 'expense' ? 'يُضاف' : 'يُخصم'}</td></tr>; })}
          {!list.length && !adjs.length && <tr><td colSpan="5" className="muted">لا سجلات</td></tr>}
        </tbody>
      </table></div>
      <p>إجمالي الصيانة على المؤجر هذا الشهر: <b>{money(landlordMaintenance(db, y, m))}</b></p>
    </>
  );
}
