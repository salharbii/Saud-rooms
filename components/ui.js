'use client';
import { useState, useEffect, useCallback } from 'react';
import { loadAll, nowYM } from '@/lib/data';

export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const money = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ر.س';
export const STATUS = { paid: 'مدفوع', partial: 'جزئي', unpaid: 'غير مدفوع' };

export function useDB() {
  const [db, setDb] = useState(null);
  const [err, setErr] = useState('');
  const reload = useCallback(async () => {
    try { setDb(await loadAll()); setErr(''); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { db, err, reload };
}

export function useMonth() {
  const n = nowYM();
  const [y, setY] = useState(n.y);
  const [m, setM] = useState(n.m);
  const picker = (
    <div className="monthpick no-print">
      <select value={m} onChange={(e) => setM(+e.target.value)}>
        {MONTHS.map((x, i) => <option key={i} value={i + 1}>{x}</option>)}
      </select>
      <input type="number" value={y} onChange={(e) => setY(+e.target.value)} />
    </div>
  );
  return { y, m, picker };
}

export const Badge = ({ s }) => <span className={'badge ' + s}>{STATUS[s] || s}</span>;

export function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Load({ db, err }) {
  if (err) return <p className="errbox">خطأ: {err}</p>;
  if (!db) return <p className="muted">جارٍ التحميل…</p>;
  return null;
}

export function PayModal({ tenant, remaining, date, onClose, onSaved }) {
  const [f, setF] = useState({ amount: remaining > 0 ? remaining : '', paid_at: date || new Date().toLocaleDateString("en-CA"), method: 'cash', note: '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    const { supabase } = await import('@/lib/supabase');
    if (!(+f.amount > 0)) return setMsg('أدخل مبلغاً صحيحاً');
    const r = await supabase.from('payments').insert({ tenant_id: tenant.id, amount: +f.amount, paid_at: f.paid_at, method: f.method, note: f.note || null });
    if (r.error) return setMsg(r.error.message);
    onSaved();
  }
  return (
    <Modal title={'تسجيل دفعة – ' + tenant.name} onClose={onClose}>
      <label>المبلغ<input type="number" value={f.amount} onChange={set('amount')} /></label>
      <label>تاريخ الدفع<input type="date" value={f.paid_at} onChange={set('paid_at')} /></label>
      <label>طريقة الدفع
        <select value={f.method} onChange={set('method')}>
          <option value="cash">نقداً</option><option value="transfer">تحويل</option>
          <option value="card">بطاقة</option><option value="other">أخرى</option>
        </select>
      </label>
      <label>ملاحظة<input value={f.note} onChange={set('note')} /></label>
      {msg && <p className="errbox">{msg}</p>}
      <div className="row"><button className="btn" onClick={save}>حفظ</button><button className="btn ghost" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}
