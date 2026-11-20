'use client';
import { useEffect, useState } from 'react';
import { useDB, useMonth, Load, money } from '@/components/ui';
import { supabase, must } from '@/lib/supabase';
import { distributeBill, roomKwh } from '@/lib/calc';

const blank = (v) => (v === null || v === undefined ? '' : String(v));

export default function Electricity() {
  const { db, err, reload } = useDB();
  const { y, m, picker } = useMonth();
  const [bills, setBills] = useState({});
  const [rd, setRd] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!db) return;
    const b = {}, r = {};
    [1, 2].forEach((mid) => {
      const x = db.electricity_bills.find((q) => q.main_meter_id === mid && q.year === y && q.month === m);
      b[mid] = { amount: blank(x?.amount), fees: blank(x?.extra_fees), method: x?.fee_method || 'proportional' };
    });
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    db.rooms.forEach((room) => {
      const cur = db.electricity_readings.find((q) => q.room_id === room.id && q.year === y && q.month === m);
      const prev = db.electricity_readings.find((q) => q.room_id === room.id && q.year === py && q.month === pm);
      r[room.id] = { prev: blank(cur ? cur.prev_reading : prev?.curr_reading), curr: blank(cur?.curr_reading), manual: blank(cur?.manual_kwh) };
    });
    setBills(b); setRd(r); setMsg('');
  }, [db, y, m]);

  const bad = Load({ db, err });
  if (bad) return bad;
  if (!bills[1]) return null;
  const num = (v) => (v === '' ? null : Number(v));
  const kwhOf = (id) => roomKwh({ prev_reading: num(rd[id]?.prev), curr_reading: num(rd[id]?.curr), manual_kwh: num(rd[id]?.manual) });

  async function save(mid) {
    try {
      const b = bills[mid];
      if (b.amount === '') throw new Error('أدخل قيمة الفاتورة');
      must(await supabase.from('electricity_bills').upsert({ main_meter_id: mid, year: y, month: m, amount: +b.amount, extra_fees: +b.fees || 0, fee_method: b.method }, { onConflict: 'main_meter_id,year,month' }));
      const rows = db.rooms.filter((r) => r.main_meter_id === mid).map((r) => ({
        room_id: r.id, year: y, month: m, prev_reading: num(rd[r.id].prev), curr_reading: num(rd[r.id].curr), manual_kwh: num(rd[r.id].manual),
      }));
      must(await supabase.from('electricity_readings').upsert(rows, { onConflict: 'room_id,year,month' }));
      setMsg('تم حفظ فاتورة العداد ' + mid); reload();
    } catch (e) { setMsg('خطأ: ' + e.message); }
  }

  return (
    <>
      <h1>الكهرباء</h1>
      {picker}
      <p className="muted">التكلفة تُحسب حسب الاستهلاك الفعلي لكل غرفة. أدخل القراءتين، أو الاستهلاك يدوياً إن لم تتوفر قراءة (اليدوي له الأولوية).</p>
      {msg && <p className={msg.startsWith('خطأ') ? 'errbox' : 'badge paid'}>{msg}</p>}
      {[1, 2].map((mid) => {
        const rooms = db.rooms.filter((r) => r.main_meter_id === mid);
        const ids = rooms.map((r) => r.id);
        const kwh = {}; ids.forEach((id) => (kwh[id] = kwhOf(id)));
        const b = bills[mid];
        const dist = distributeBill({ amount: +b.amount || 0, extra_fees: +b.fees || 0, fee_method: b.method }, kwh, ids);
        const setB = (k) => (e) => setBills({ ...bills, [mid]: { ...b, [k]: e.target.value } });
        const setR = (id, k) => (e) => setRd({ ...rd, [id]: { ...rd[id], [k]: e.target.value } });
        const totalKwh = ids.reduce((s, id) => s + kwh[id], 0);
        return (
          <div key={mid} className="meterbox">
            <h3>العداد {mid === 1 ? 'الأول (غرف 1–10)' : 'الثاني (غرف 11–20)'}</h3>
            <div className="card two">
              <label>قيمة الفاتورة (ر.س)<input type="number" value={b.amount} onChange={setB('amount')} /></label>
              <label>رسوم إضافية (ر.س)<input type="number" value={b.fees} onChange={setB('fees')} /></label>
              <label>توزيع الرسوم
                <select value={b.method} onChange={setB('method')}>
                  <option value="proportional">حسب الاستهلاك</option><option value="equal">بالتساوي</option>
                </select>
              </label>
            </div>
            <div className="tablewrap" style={{ marginTop: 8 }}><table>
              <thead><tr><th>الغرفة</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>استهلاك يدوي</th><th>الاستهلاك (ك.و)</th><th>التكلفة</th><th>الرسوم</th><th>الإجمالي</th></tr></thead>
              <tbody>{rooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}{db.tenants.some((t) => t.room_id === r.id && t.active) ? '' : ' (شاغرة)'}</td>
                  <td><input type="number" value={rd[r.id].prev} onChange={setR(r.id, 'prev')} /></td>
                  <td><input type="number" value={rd[r.id].curr} onChange={setR(r.id, 'curr')} /></td>
                  <td><input type="number" value={rd[r.id].manual} onChange={setR(r.id, 'manual')} /></td>
                  <td>{kwh[r.id]}</td><td>{money(dist[r.id].consumption)}</td><td>{money(dist[r.id].fees)}</td><td><b>{money(dist[r.id].total)}</b></td>
                </tr>))}</tbody>
              <tfoot><tr><td colSpan="4">المجموع</td><td>{totalKwh}</td><td colSpan="3">{money(ids.reduce((s, id) => s + dist[id].total, 0))}</td></tr></tfoot>
            </table></div>
            <div className="row"><button className="btn" onClick={() => save(mid)}>حفظ فاتورة العداد {mid}</button></div>
          </div>
        );
      })}
      <p className="muted">فواتير الأشهر السابقة محفوظة؛ غيّر الشهر أعلاه لعرضها.</p>
    </>
  );
}
