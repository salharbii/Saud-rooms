'use client';
import { useState } from 'react';
import { useDB, Load, Modal, Badge, money } from '@/components/ui';
import { supabase, must } from '@/lib/supabase';
import { today } from '@/lib/data';
import { contractStatement } from '@/lib/contracts';

const PNAME = { 1: 'شهر', 2: 'شهرين', 3: '3 أشهر', 4: '4 أشهر', 6: '6 أشهر', 12: 'سنة' };

function ContractForm({ room, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', phone: '', amount: '', period: '3', start: today() });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    try {
      if (!f.name.trim()) throw new Error('اسم المستأجر مطلوب');
      if (!(+f.amount > 0)) throw new Error('أدخل مبلغ الدفعة');
      must(await supabase.from('contracts').insert({ room_id: room.id, name: f.name.trim(), phone: f.phone || null, amount: +f.amount, period_months: +f.period, start_date: f.start }));
      onSaved();
    } catch (e) { setMsg(e.message); }
  }
  return (
    <Modal title={'عقد جديد – ' + room.label} onClose={onClose}>
      <label>اسم المستأجر<input value={f.name} onChange={set('name')} /></label>
      <label>رقم الجوال<input value={f.phone} onChange={set('phone')} inputMode="tel" /></label>
      <label>مدة الدفعة
        <select value={f.period} onChange={set('period')}>
          {Object.entries(PNAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label>مبلغ الدفعة الواحدة (ر.س)<input type="number" value={f.amount} onChange={set('amount')} /></label>
      <label>تاريخ بداية العقد<input type="date" value={f.start} onChange={set('start')} /></label>
      <p className="muted">أول دفعة تستحق في تاريخ البداية، ثم تتكرر كل مدة الدفعة.</p>
      {msg && <p className="errbox">{msg}</p>}
      <div className="row"><button className="btn" onClick={save}>حفظ</button><button className="btn ghost" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

function ContractPay({ c, remaining, onClose, onSaved }) {
  const [f, setF] = useState({ amount: remaining > 0 ? remaining : '', paid_at: today(), method: 'cash', note: '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    try {
      if (!(+f.amount > 0)) throw new Error('أدخل مبلغاً صحيحاً');
      must(await supabase.from('contract_payments').insert({ contract_id: c.id, amount: +f.amount, paid_at: f.paid_at, method: f.method, note: f.note || null }));
      onSaved();
    } catch (e) { setMsg(e.message); }
  }
  return (
    <Modal title={'تسجيل دفعة – ' + c.name} onClose={onClose}>
      <label>المبلغ<input type="number" value={f.amount} onChange={set('amount')} /></label>
      <label>تاريخ الدفع<input type="date" value={f.paid_at} onChange={set('paid_at')} /></label>
      <label>طريقة الدفع
        <select value={f.method} onChange={set('method')}>
          <option value="cash">نقداً</option><option value="transfer">تحويل</option><option value="card">بطاقة</option><option value="other">أخرى</option>
        </select>
      </label>
      <label>ملاحظة<input value={f.note} onChange={set('note')} /></label>
      {msg && <p className="errbox">{msg}</p>}
      <div className="row"><button className="btn" onClick={save}>حفظ</button><button className="btn ghost" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

function Details({ c, st, pays, onClose }) {
  return (
    <Modal title={'كشف حساب – ' + c.name} onClose={onClose}>
      <h3>الدفعات المستحقة</h3>
      <div className="tablewrap"><table style={{ minWidth: 0 }}>
        <thead><tr><th>#</th><th>تاريخ الاستحقاق</th><th>المبلغ</th></tr></thead>
        <tbody>{st.installments.map((i) => <tr key={i.n}><td>{i.n}</td><td>{i.due}</td><td>{money(i.amount)}</td></tr>)}</tbody>
      </table></div>
      <h3 style={{ marginTop: 12 }}>المدفوعات</h3>
      <div className="tablewrap"><table style={{ minWidth: 0 }}>
        <thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th></tr></thead>
        <tbody>{pays.map((p) => <tr key={p.id}><td>{p.paid_at}</td><td>{money(p.amount)}</td><td>{p.note || ''}</td></tr>)}
          {!pays.length && <tr><td colSpan="3" className="muted">لا مدفوعات</td></tr>}</tbody>
      </table></div>
      <p>المستحق: <b>{money(st.total)}</b> • المدفوع: <b>{money(st.paid)}</b> • المتبقي: <b>{money(st.remaining)}</b></p>
      <button className="btn ghost" onClick={onClose}>إغلاق</button>
    </Modal>
  );
}

export default function Contracts() {
  const { db, err, reload } = useDB();
  const [modal, setModal] = useState(null);
  const bad = Load({ db, err });
  if (bad) return bad;
  const t = today();
  const done = () => { setModal(null); reload(); };
  const paysOf = (c) => db.contract_payments.filter((p) => p.contract_id === c.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  async function rename(r) {
    const v = prompt('اسم الغرفة', r.label);
    if (!v || !v.trim()) return;
    try { must(await supabase.from('contract_rooms').update({ label: v.trim() }).eq('id', r.id)); reload(); } catch (e) { alert(e.message); }
  }
  async function end(c) {
    if (!confirm(`إنهاء عقد ${c.name}؟ يبقى حسابه ومديونيته محفوظة.`)) return;
    try { must(await supabase.from('contracts').update({ active: false, end_date: t }).eq('id', c.id)); reload(); } catch (e) { alert(e.message); }
  }
  const rooms = [...db.contract_rooms].sort((a, b) => a.id - b.id);
  const old = db.contracts.filter((c) => !c.active).sort((a, b) => b.start_date.localeCompare(a.start_date));
  return (
    <>
      <h1>الغرف غير الشهرية</h1>
      <p className="muted">عقود تُدفع كل عدة أشهر (3 أو 6 أو سنة) بدل الشهر.</p>
      <div className="rooms">
        {rooms.map((r) => {
          const c = db.contracts.find((x) => x.room_id === r.id && x.active);
          const pays = c ? paysOf(c) : [];
          const st = c ? contractStatement(c, pays, t) : null;
          return (
            <div key={r.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}>
                <b>{r.label}</b>
                <span className={'badge ' + (c ? 'occ' : 'vac')}>{c ? 'مشغولة' : 'شاغرة'}</span>
              </div>
              {c ? <>
                <p style={{ margin: '8px 0 2px' }}>{c.name}</p>
                <small className="muted">{c.phone || ''}</small>
                <p style={{ margin: '6px 0' }}>الدفعة: <b>{money(c.amount)}</b> كل <b>{PNAME[c.period_months] || c.period_months + ' أشهر'}</b></p>
                <small className="muted">البداية: {c.start_date} • الدفعة القادمة: {st.next}</small>
                <div className="row"><Badge s={st.status} /><span>المتبقي: <b>{money(st.remaining)}</b></span></div>
                <div className="row">
                  <button className="btn sm" onClick={() => setModal({ k: 'pay', c, rem: st.remaining })}>دفعة</button>
                  <button className="btn sm ghost" onClick={() => setModal({ k: 'det', c, st, pays })}>كشف الحساب</button>
                  <button className="btn sm danger" onClick={() => end(c)}>إنهاء</button>
                </div>
              </> : <div className="row"><button className="btn sm" onClick={() => setModal({ k: 'add', r })}>إضافة مستأجر</button></div>}
              <div className="row"><button className="btn sm ghost" onClick={() => rename(r)}>تغيير الاسم</button></div>
            </div>
          );
        })}
      </div>
      {old.length > 0 && <>
        <h3 style={{ marginTop: 16 }}>عقود سابقة</h3>
        <div className="tablewrap"><table style={{ minWidth: 0 }}>
          <thead><tr><th>الغرفة</th><th>المستأجر</th><th>المتبقي</th><th></th></tr></thead>
          <tbody>{old.map((c) => {
            const pays = paysOf(c); const st = contractStatement(c, pays, t);
            return <tr key={c.id}><td>{db.contract_rooms.find((r) => r.id === c.room_id)?.label}</td><td>{c.name}</td><td>{money(st.remaining)}</td>
              <td><button className="btn sm ghost" onClick={() => setModal({ k: 'det', c, st, pays })}>كشف</button>{st.remaining > 0 && <> <button className="btn sm" onClick={() => setModal({ k: 'pay', c, rem: st.remaining })}>دفعة</button></>}</td></tr>;
          })}</tbody>
        </table></div>
      </>}
      {modal?.k === 'add' && <ContractForm room={modal.r} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.k === 'pay' && <ContractPay c={modal.c} remaining={modal.rem} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.k === 'det' && <Details c={modal.c} st={modal.st} pays={modal.pays} onClose={() => setModal(null)} />}
    </>
  );
}
