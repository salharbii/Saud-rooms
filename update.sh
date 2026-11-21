mkdir -p lib tests "app/(app)/contracts"
cat > lib/contracts.js <<'EOF'
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
EOF
cat > "app/(app)/contracts/page.js" <<'EOF'
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
EOF
cat > "app/(app)/rooms/page.js" <<'EOF'
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useDB, useMonth, Load, Modal, PayModal, Badge, money } from '@/components/ui';
import { monthReport, nowYM, today } from '@/lib/data';
import { supabase, must } from '@/lib/supabase';

function RoomForm({ room, tenant, mode, onClose, onSaved }) {
  const [f, setF] = useState({ name: tenant?.name || '', phone: tenant?.phone || '', rent: room.monthly_rent || '', meter: room.sub_meter_no || '', start: today() });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    try {
      const rent = Number(f.rent);
      if (mode !== 'room' && !f.name.trim()) throw new Error('اسم المستأجر مطلوب');
      if (!(rent > 0) && mode === 'add') throw new Error('حدّد الإيجار الشهري');
      must(await supabase.from('rooms').update({ monthly_rent: rent || 0, sub_meter_no: f.meter || null }).eq('id', room.id));
      if (mode === 'add') must(await supabase.from('tenants').insert({ room_id: room.id, name: f.name.trim(), phone: f.phone || null, start_date: f.start }));
      if (mode === 'edit') must(await supabase.from('tenants').update({ name: f.name.trim(), phone: f.phone || null }).eq('id', tenant.id));
      if (tenant && rent > 0) {
        const { y, m } = nowYM();
        must(await supabase.from('rent_records').update({ amount: rent }).eq('tenant_id', tenant.id).eq('year', y).eq('month', m));
      }
      onSaved();
    } catch (e) { setMsg(e.message); }
  }
  return (
    <Modal title={`غرفة ${room.id} – ${mode === 'add' ? 'إضافة مستأجر' : mode === 'edit' ? 'تعديل' : 'الإيجار والعداد'}`} onClose={onClose}>
      {mode !== 'room' && <>
        <label>اسم المستأجر<input value={f.name} onChange={set('name')} /></label>
        <label>رقم الجوال<input value={f.phone} onChange={set('phone')} inputMode="tel" /></label>
      </>}
      <label>الإيجار الشهري (ر.س)<input type="number" value={f.rent} onChange={set('rent')} /></label>
      <label>رقم عداد الغرفة (اختياري)<input value={f.meter} onChange={set('meter')} /></label>
      {mode === 'add' && <label>تاريخ بداية الإيجار<input type="date" value={f.start} onChange={set('start')} /></label>}
      {mode === 'edit' && <p className="muted">تغيير الإيجار يسري على الشهر الحالي وما بعده، وتبقى الأشهر السابقة كما هي.</p>}
      {msg && <p className="errbox">{msg}</p>}
      <div className="row"><button className="btn" onClick={save}>حفظ</button><button className="btn ghost" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

function MeterBar({ meter, onSaved }) {
  const [v, setV] = useState(meter.meter_no || '');
  const [msg, setMsg] = useState('');
  async function save() {
    try { must(await supabase.from('main_meters').update({ meter_no: v.trim() || null }).eq('id', meter.id)); setMsg('تم الحفظ'); onSaved(); }
    catch (e) { setMsg(e.message); }
  }
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="row" style={{ marginTop: 0 }}>
        <b>رقم العداد</b>
        <input style={{ maxWidth: 220 }} value={v} placeholder="اكتب رقم العداد" onChange={(e) => setV(e.target.value)} />
        <button className="btn sm" onClick={save}>حفظ</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </div>
  );
}

export default function Rooms() {
  const { db, err, reload } = useDB();
  const { y, m, picker } = useMonth();
  const [modal, setModal] = useState(null);
  const bad = Load({ db, err });
  if (bad) return bad;
  const rows = monthReport(db, y, m);
  const done = () => { setModal(null); reload(); };
  async function vacate(t) {
    if (!confirm(`إخلاء ${t.name}؟ ستبقى كل حساباته ومديونيته محفوظة.`)) return;
    try { must(await supabase.from('tenants').update({ active: false, end_date: today() }).eq('id', t.id)); reload(); } catch (e) { alert(e.message); }
  }
  const card = (r) => {
    const t = db.tenants.find((x) => x.room_id === r.id && x.active);
    const row = t && rows.find((x) => x.tenant_id === t.id);
    return (
      <div key={r.id} className="card">
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}>
          <b>غرفة {r.id}</b>
          <span className={'badge ' + (t ? 'occ' : 'vac')}>{t ? 'مشغولة' : 'شاغرة'}</span>
        </div>
        <p style={{ margin: '8px 0 2px' }}>{t ? t.name : '—'}</p>
        <small className="muted">{t?.phone || ''}</small>
        <p style={{ margin: '6px 0' }}>الإيجار: <b>{money(r.monthly_rent)}</b></p>
        <small className="muted">عداد الغرفة: {r.sub_meter_no || '—'}</small>
        {row && <div className="row"><Badge s={row.status} /><span>المتبقي: <b>{money(row.remaining)}</b></span></div>}
        <div className="row">
          {t ? <>
            <Link className="btn sm" href={`/rooms/${r.id}`}>كشف الحساب</Link>
            <button className="btn sm" onClick={() => setModal({ k: 'pay', t, rem: row?.remaining })}>دفعة</button>
            <button className="btn sm ghost" onClick={() => setModal({ k: 'edit', r, t })}>تعديل</button>
            <button className="btn sm danger" onClick={() => vacate(t)}>إخلاء</button>
          </> : <>
            <button className="btn sm" onClick={() => setModal({ k: 'add', r })}>إضافة مستأجر</button>
            <button className="btn sm ghost" onClick={() => setModal({ k: 'room', r })}>الإيجار والعداد</button>
            <Link className="btn sm ghost" href={`/rooms/${r.id}`}>السجل</Link>
          </>}
        </div>
      </div>
    );
  };
  const groups = [[1, 'المجموعة الأولى – غرف 1 إلى 10'], [2, 'المجموعة الثانية – غرف 11 إلى 20']];
  return (
    <>
      <h1>الغرف</h1>
      {picker}
      {groups.map(([id, title]) => {
        const list = db.rooms.filter((r) => r.main_meter_id === id);
        const occ = list.filter((r) => db.tenants.some((t) => t.room_id === r.id && t.active)).length;
        const meter = db.main_meters.find((x) => x.id === id);
        return (
          <section key={id} style={{ marginBottom: 20 }}>
            <h3>{title} <span className="muted">({occ} مشغولة من {list.length})</span></h3>
            {meter && <MeterBar key={id + ':' + (meter.meter_no || '')} meter={meter} onSaved={reload} />}
            <div className="rooms">{list.map(card)}</div>
          </section>
        );
      })}
      {modal?.k === 'pay' && <PayModal tenant={modal.t} remaining={modal.rem} onClose={() => setModal(null)} onSaved={done} />}
      {['add', 'edit', 'room'].includes(modal?.k) && <RoomForm room={modal.r} tenant={modal.t} mode={modal.k} onClose={() => setModal(null)} onSaved={done} />}
    </>
  );
}
EOF
cat > "app/(app)/reports/page.js" <<'EOF'
'use client';
import { useState } from 'react';
import { useDB, useMonth, Load, Badge, money, MONTHS, STATUS } from '@/components/ui';
import { monthReport } from '@/lib/data';
import { r2 } from '@/lib/calc';

const stat = (a, p) => { a = Number(a) || 0; p = Number(p) || 0; return p <= 0 ? 'unpaid' : p >= a ? 'paid' : 'partial'; };

export default function Reports() {
  const { db, err } = useDB();
  const { y, m, picker } = useMonth();
  const [tab, setTab] = useState('rent');
  const [scope, setScope] = useState('month');
  const bad = Load({ db, err });
  if (bad) return bad;

  async function excel(heads, data, name) {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([heads, ...data]);
    ws['!views'] = [{ rightToLeft: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
    XLSX.writeFile(wb, name + '.xlsx');
  }

  const tabs = (
    <div className="row no-print" style={{ marginBottom: 10 }}>
      <button className={'btn ' + (tab === 'rent' ? '' : 'ghost')} onClick={() => setTab('rent')}>تقرير الإيجارات</button>
      <button className={'btn ' + (tab === 'elec' ? '' : 'ghost')} onClick={() => setTab('elec')}>تقرير الكهرباء</button>
    </div>
  );
  const actions = (onExcel) => (
    <>
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={() => window.print()}>طباعة</button>
        <button className="btn" onClick={() => window.print()}>تحميل PDF</button>
        <button className="btn" onClick={onExcel}>تصدير Excel</button>
      </div>
      <p className="muted no-print">لتحميل PDF: اضغط «تحميل PDF» ثم اختر «حفظ كـ PDF» من نافذة الطباعة.</p>
    </>
  );

  if (tab === 'rent') {
    const rows = monthReport(db, y, m);
    const keys = ['rent', 'maintenance', 'extras', 'discounts', 'previous_balance', 'total_due', 'paid', 'remaining'];
    const tot = {}; keys.forEach((k) => (tot[k] = r2(rows.reduce((s, r) => s + r[k], 0))));
    const heads = ['الغرفة', 'المستأجر', 'الإيجار', 'الصيانة', 'مصاريف إضافية', 'الخصومات', 'مديونية سابقة', 'إجمالي المستحق', 'المدفوع', 'المتبقي', 'الحالة'];
    const toExcel = () => {
      const data = rows.map((r) => [r.room_id, r.tenant, ...keys.map((k) => r[k]), STATUS[r.status]]);
      data.push(['', 'الإجمالي', ...keys.map((k) => tot[k]), '']);
      excel(heads, data, `SAUD-ROOMS-rent-${y}-${String(m).padStart(2, '0')}`);
    };
    return (
      <>
        <h1>تقرير الإيجارات – {MONTHS[m - 1]} {y}</h1>
        {tabs}{picker}{actions(toExcel)}
        <div className="tablewrap"><table>
          <thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.tenant_id}><td>{r.room_id}</td><td>{r.tenant}</td>{keys.map((k) => <td key={k}>{money(r[k])}</td>)}<td><Badge s={r.status} /></td></tr>
          ))}{!rows.length && <tr><td colSpan="11" className="muted">لا بيانات لهذا الشهر</td></tr>}</tbody>
          <tfoot><tr><td></td><td>الإجمالي</td>{keys.map((k) => <td key={k}>{money(tot[k])}</td>)}<td></td></tr></tfoot>
        </table></div>
      </>
    );
  }

  const meterNo = (id) => db.main_meters.find((x) => x.id === id)?.meter_no || '';
  const bills = db.electricity_bills
    .filter((b) => b.year === y && (scope === 'year' || b.month === m))
    .sort((a, b) => a.month - b.month || a.main_meter_id - b.main_meter_id);
  const sum = (f) => r2(bills.reduce((s, b) => s + f(b), 0));
  const tAmount = sum((b) => Number(b.amount)), tPaid = sum((b) => Number(b.paid_amount || 0));
  const heads = ['الشهر', 'العداد', 'رقم العداد', 'مبلغ الفاتورة', 'المدفوع', 'المتبقي', 'الحالة'];
  const toExcel = () => {
    const data = bills.map((b) => [MONTHS[b.month - 1] + ' ' + b.year, b.main_meter_id, meterNo(b.main_meter_id), Number(b.amount), Number(b.paid_amount || 0), r2(b.amount - (b.paid_amount || 0)), STATUS[stat(b.amount, b.paid_amount)]]);
    data.push(['الإجمالي', '', '', tAmount, tPaid, r2(tAmount - tPaid), '']);
    excel(heads, data, `SAUD-ROOMS-electricity-${y}${scope === 'year' ? '' : '-' + String(m).padStart(2, '0')}`);
  };
  return (
    <>
      <h1>تقرير الكهرباء – {scope === 'year' ? 'سنة ' + y : MONTHS[m - 1] + ' ' + y}</h1>
      {tabs}{picker}
      <div className="monthpick no-print">
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="month">الشهر المحدد</option><option value="year">السنة كاملة</option>
        </select>
      </div>
      {actions(toExcel)}
      <div className="tablewrap"><table style={{ minWidth: 0 }}>
        <thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{bills.map((b) => (
          <tr key={b.id}><td>{MONTHS[b.month - 1]} {b.year}</td><td>{b.main_meter_id === 1 ? 'الأول' : 'الثاني'}</td><td>{meterNo(b.main_meter_id) || '—'}</td>
            <td>{money(b.amount)}</td><td>{money(b.paid_amount)}</td><td>{money(b.amount - (b.paid_amount || 0))}</td><td><Badge s={stat(b.amount, b.paid_amount)} /></td></tr>
        ))}{!bills.length && <tr><td colSpan="7" className="muted">لا فواتير</td></tr>}</tbody>
        <tfoot><tr><td colSpan="3">الإجمالي</td><td>{money(tAmount)}</td><td>{money(tPaid)}</td><td>{money(tAmount - tPaid)}</td><td></td></tr></tfoot>
      </table></div>
    </>
  );
}
EOF
cat > tests/contracts.test.js <<'EOF'
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
EOF
sed -i "s/'payments'\];/'payments', 'main_meters', 'contract_rooms', 'contracts', 'contract_payments'];/" lib/data.js
grep -q "'/contracts'" "app/(app)/layout.js" || sed -i "s#\['/rooms', 'الغرف'\],#['/rooms', 'الغرف'], ['/contracts', 'غير الشهرية'],#" "app/(app)/layout.js"
sed -i 's#node --test tests/calc.test.js#node --test tests/calc.test.js tests/contracts.test.js#' package.json
git add -A && git commit -m "groups, contracts, reports" && git push
