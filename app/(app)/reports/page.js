'use client';
import { useState } from 'react';
import { useDB, useMonth, Load, Badge, money, MONTHS, STATUS } from '@/components/ui';
import { monthReport } from '@/lib/data';
import { r2 } from '@/lib/calc';

const est = (a, p) => { a = Number(a) || 0; p = Number(p) || 0; return p <= 0 ? 'unpaid' : p >= a ? 'paid' : 'partial'; };
const sum = (arr, f) => r2(arr.reduce((s, x) => s + f(x), 0));

export default function Reports() {
  const { db, err } = useDB();
  const { y, m, picker } = useMonth();
  const [scope, setScope] = useState('month');
  const [q, setQ] = useState('');
  const [sf, setSf] = useState('all');
  const [hidden, setHidden] = useState([]);
  const [showOld, setShowOld] = useState(false);
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
  const file = (k) => `SAUD-ROOMS-${k}-${y}${scope === 'year' && k !== 'rooms' ? '' : '-' + String(m).padStart(2, '0')}`;
  const inScope = (yy, mm) => yy === y && (scope === 'year' || mm === m);
  const qq = q.trim();
  const tn = (id) => db.tenants.find((t) => t.id === id)?.name || '—';

  // 1) تقرير الغرف (الإخفاء لكل شخص على حدة)
  const allRows = monthReport(db, y, m);
  const oldRows = allRows.filter((r) => !r.active);
  const rows = allRows.filter((r) =>
    (r.active || showOld) && !hidden.includes(r.tenant_id) && (sf === 'all' || r.status === sf) &&
    (!qq || (/^\d+$/.test(qq) ? r.room_id === +qq : r.tenant.includes(qq))));
  const rkeys = ['rent', 'previous_balance', 'total_due', 'paid', 'remaining'];
  const rtot = {}; rkeys.forEach((k) => (rtot[k] = sum(rows, (r) => r[k])));
  const rheads = ['الغرفة', 'المستأجر', 'الإيجار', 'مديونية سابقة', 'إجمالي المستحق', 'المدفوع', 'المتبقي', 'الحالة'];
  const rExcel = () => {
    const data = rows.map((r) => [r.room_id, r.tenant, ...rkeys.map((k) => r[k]), STATUS[r.status]]);
    data.push(['', 'الإجمالي', ...rkeys.map((k) => rtot[k]), '']);
    excel(rheads, data, file('rooms'));
  };

  // 2) تقرير الصيانة
  const maint = db.maintenance
    .filter((x) => !hidden.includes(x.tenant_id) && inScope(+x.date.slice(0, 4), +x.date.slice(5, 7)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const mAll = sum(maint, (x) => Number(x.amount));
  const mTen = sum(maint.filter((x) => x.payer === 'tenant'), (x) => Number(x.amount));
  const mLand = r2(mAll - mTen);
  const mheads = ['التاريخ', 'الغرفة', 'المستأجر', 'الوصف', 'المبلغ', 'المسؤول'];
  const mExcel = () => {
    const data = maint.map((x) => [x.date, x.room_id, tn(x.tenant_id), x.description, Number(x.amount), x.payer === 'tenant' ? 'المستأجر' : 'المؤجر']);
    data.push(['الإجمالي', '', '', '', mAll, '']);
    excel(mheads, data, file('maintenance'));
  };

  // 3) تقرير الكهرباء
  const meterNo = (id) => db.main_meters.find((x) => x.id === id)?.meter_no || '';
  const bills = db.electricity_bills.filter((b) => inScope(b.year, b.month)).sort((a, b) => a.month - b.month || a.main_meter_id - b.main_meter_id);
  const eAmt = sum(bills, (b) => Number(b.amount)), ePaid = sum(bills, (b) => Number(b.paid_amount || 0));
  const eheads = ['الشهر', 'العداد', 'رقم العداد', 'مبلغ الفاتورة', 'المدفوع', 'المتبقي', 'الحالة'];
  const eExcel = () => {
    const data = bills.map((b) => [MONTHS[b.month - 1] + ' ' + b.year, b.main_meter_id, meterNo(b.main_meter_id), Number(b.amount), Number(b.paid_amount || 0), r2(b.amount - (b.paid_amount || 0)), STATUS[est(b.amount, b.paid_amount)]]);
    data.push(['الإجمالي', '', '', eAmt, ePaid, r2(eAmt - ePaid), '']);
    excel(eheads, data, file('electricity'));
  };

  return (
    <>
      <h1>التقارير – {MONTHS[m - 1]} {y}</h1>
      {picker}
      <div className="card no-print" style={{ marginBottom: 12 }}>
        <div className="two">
          <label>الصيانة والكهرباء تعرض
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="month">الشهر المحدد</option><option value="year">السنة كاملة</option>
            </select>
          </label>
          <label>حالة الدفع (الغرف)
            <select value={sf} onChange={(e) => setSf(e.target.value)}>
              <option value="all">الكل</option><option value="paid">مدفوع</option><option value="partial">جزئي</option><option value="unpaid">غير مدفوع</option>
            </select>
          </label>
          <label>بحث (رقم الغرفة أو الاسم)<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        {hidden.length > 0 && <p className="muted">مخفي من التقارير: {hidden.map(tn).join('، ')} <button className="btn sm ghost" onClick={() => setHidden([])}>إظهار الكل</button></p>}
        {oldRows.length > 0 && (
          <p className="muted">
            {showOld ? 'المستأجرون السابقون (المخلون) ظاهرون في التقرير.' : `يوجد ${oldRows.length} مستأجر سابق (مخلى) عليهم متبقي ${money(sum(oldRows, (r) => r.remaining))} — مخفيون من التقرير.`}{' '}
            <button className="btn sm ghost" onClick={() => setShowOld(!showOld)}>{showOld ? 'إخفاء المخلين' : 'إظهار المخلين'}</button>
          </p>
        )}
        <div className="row"><button className="btn" onClick={() => window.print()}>طباعة / تحميل PDF</button></div>
        <p className="muted">لتحميل PDF: اضغط الزر ثم اختر «حفظ كـ PDF» من نافذة الطباعة.</p>
      </div>

      <section>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>1) تقرير الغرف</h3>
          <button className="btn sm no-print" onClick={rExcel}>تصدير Excel</button>
        </div>
        <div className="tablewrap" style={{ marginTop: 8 }}><table>
          <thead><tr>{rheads.map((h) => <th key={h}>{h}</th>)}<th className="no-print"></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.tenant_id}><td>{r.room_id}</td><td>{r.tenant}{!r.active && <span className="badge vac" style={{ marginInlineStart: 6 }}>سابق</span>}</td>{rkeys.map((k) => <td key={k}>{money(r[k])}</td>)}<td><Badge s={r.status} /></td>
              <td className="no-print"><button className="btn sm ghost" onClick={() => setHidden([...hidden, r.tenant_id])}>إخفاء</button></td></tr>
          ))}{!rows.length && <tr><td colSpan="9" className="muted">لا بيانات</td></tr>}</tbody>
          <tfoot><tr><td></td><td>الإجمالي</td>{rkeys.map((k) => <td key={k}>{money(rtot[k])}</td>)}<td></td><td className="no-print"></td></tr></tfoot>
        </table></div>
        <p className="muted">الإجمالي المستحق يشمل ما سُجّل على المستأجر من صيانة أو مصاريف أو خصومات.</p>
      </section>

      <section style={{ marginTop: 22 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>2) تقرير الصيانة {scope === 'year' ? '– سنة ' + y : ''}</h3>
          <button className="btn sm no-print" onClick={mExcel}>تصدير Excel</button>
        </div>
        <div className="tablewrap" style={{ marginTop: 8 }}><table style={{ minWidth: 0 }}>
          <thead><tr>{mheads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{maint.map((x) => (
            <tr key={x.id}><td>{x.date}</td><td>{x.room_id}</td><td>{tn(x.tenant_id)}</td><td>{x.description}</td><td>{money(x.amount)}</td><td>{x.payer === 'tenant' ? 'المستأجر' : 'المؤجر'}</td></tr>
          ))}{!maint.length && <tr><td colSpan="6" className="muted">لا سجلات</td></tr>}</tbody>
          <tfoot><tr><td colSpan="4">الإجمالي</td><td>{money(mAll)}</td><td></td></tr></tfoot>
        </table></div>
        <p>على المستأجرين: <b>{money(mTen)}</b> • على المؤجر: <b>{money(mLand)}</b></p>
      </section>

      <section style={{ marginTop: 22 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>3) تقرير الكهرباء {scope === 'year' ? '– سنة ' + y : ''}</h3>
          <button className="btn sm no-print" onClick={eExcel}>تصدير Excel</button>
        </div>
        <div className="tablewrap" style={{ marginTop: 8 }}><table style={{ minWidth: 0 }}>
          <thead><tr>{eheads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{bills.map((b) => (
            <tr key={b.id}><td>{MONTHS[b.month - 1]} {b.year}</td><td>{b.main_meter_id === 1 ? 'الأول' : 'الثاني'}</td><td>{meterNo(b.main_meter_id) || '—'}</td>
              <td>{money(b.amount)}</td><td>{money(b.paid_amount)}</td><td>{money(b.amount - (b.paid_amount || 0))}</td><td><Badge s={est(b.amount, b.paid_amount)} /></td></tr>
          ))}{!bills.length && <tr><td colSpan="7" className="muted">لا فواتير</td></tr>}</tbody>
          <tfoot><tr><td colSpan="3">الإجمالي</td><td>{money(eAmt)}</td><td>{money(ePaid)}</td><td>{money(eAmt - ePaid)}</td><td></td></tr></tfoot>
        </table></div>
      </section>
    </>
  );
}
