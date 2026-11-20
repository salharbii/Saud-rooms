'use client';
import { useDB, useMonth, Load, Badge, money, MONTHS, STATUS } from '@/components/ui';
import { monthReport } from '@/lib/data';
import { r2 } from '@/lib/calc';

export default function Reports() {
  const { db, err } = useDB();
  const { y, m, picker } = useMonth();
  const bad = Load({ db, err });
  if (bad) return bad;
  const rows = monthReport(db, y, m);
  const keys = ['rent', 'electricity', 'maintenance', 'extras', 'discounts', 'previous_balance', 'total_due', 'paid', 'remaining'];
  const tot = {}; keys.forEach((k) => (tot[k] = r2(rows.reduce((s, r) => s + r[k], 0))));
  const heads = ['الغرفة', 'المستأجر', 'الإيجار', 'الكهرباء', 'الصيانة', 'مصاريف إضافية', 'الخصومات', 'مديونية سابقة', 'إجمالي المستحق', 'المدفوع', 'المتبقي', 'الحالة'];

  async function excel() {
    const XLSX = await import('xlsx');
    const data = rows.map((r) => [r.room_id, r.tenant, ...keys.map((k) => r[k]), STATUS[r.status]]);
    data.push(['', 'الإجمالي', ...keys.map((k) => tot[k]), '']);
    const ws = XLSX.utils.aoa_to_sheet([heads, ...data]);
    ws['!views'] = [{ rightToLeft: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
    XLSX.writeFile(wb, `SAUD-ROOMS-${y}-${String(m).padStart(2, '0')}.xlsx`);
  }
  return (
    <>
      <h1>التقرير الشهري – {MONTHS[m - 1]} {y}</h1>
      {picker}
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={() => window.print()}>طباعة</button>
        <button className="btn" onClick={() => window.print()}>تحميل PDF</button>
        <button className="btn" onClick={excel}>تصدير Excel</button>
      </div>
      <p className="muted no-print">لتحميل PDF: اضغط «تحميل PDF» ثم اختر «حفظ كـ PDF» من نافذة الطباعة.</p>
      <div className="tablewrap"><table>
        <thead><tr>{heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.tenant_id}><td>{r.room_id}</td><td>{r.tenant}</td>{keys.map((k) => <td key={k}>{money(r[k])}</td>)}<td><Badge s={r.status} /></td></tr>
        ))}{!rows.length && <tr><td colSpan="12" className="muted">لا بيانات لهذا الشهر</td></tr>}</tbody>
        <tfoot><tr><td></td><td>الإجمالي</td>{keys.map((k) => <td key={k}>{money(tot[k])}</td>)}<td></td></tr></tfoot>
      </table></div>
    </>
  );
}
