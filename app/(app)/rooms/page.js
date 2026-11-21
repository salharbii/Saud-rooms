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
