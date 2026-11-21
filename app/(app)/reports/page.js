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
