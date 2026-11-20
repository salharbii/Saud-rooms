import { supabase, must } from './supabase';
import { buildStatement, distributeBill, roomKwh, r2 } from './calc';

export const ym = (y, m) => y * 12 + m - 1;
export const dYM = (s) => ym(+s.slice(0, 4), +s.slice(5, 7));
export const today = () => new Date().toLocaleDateString('en-CA');
export const nowYM = () => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1 }; };
const TABLES = ['rooms', 'tenants', 'rent_records', 'electricity_bills', 'electricity_readings', 'maintenance', 'adjustments', 'payments'];

export async function loadAll() {
  const res = await Promise.all(TABLES.map((t) => supabase.from(t).select('*').limit(10000)));
  const db = {};
  res.forEach((r, i) => { db[TABLES[i]] = must(r); });
  db.rooms.sort((a, b) => a.id - b.id);
  // إنشاء سجلات الإيجار الناقصة (لا يتكرر بفضل القيد الفريد)
  const { y, m } = nowYM(); const cur = ym(y, m);
  const have = new Set(db.rent_records.map((r) => r.tenant_id + '-' + ym(r.year, r.month)));
  const add = [];
  for (const t of db.tenants) {
    const rent = Number(db.rooms.find((r) => r.id === t.room_id)?.monthly_rent) || 0;
    if (rent <= 0) continue;
    const last = t.active || !t.end_date ? cur : dYM(t.end_date);
    for (let k = dYM(t.start_date); k <= last; k++) {
      if (!have.has(t.id + '-' + k)) add.push({ tenant_id: t.id, year: Math.floor(k / 12), month: (k % 12) + 1, amount: rent });
    }
  }
  if (add.length) {
    must(await supabase.from('rent_records').upsert(add, { onConflict: 'tenant_id,year,month', ignoreDuplicates: true }));
    db.rent_records.push(...add);
  }
  return db;
}

export const ROOM_ELECTRICITY = false;
export function electricityMap(db) {
  if (!ROOM_ELECTRICITY) return {};
  const map = {};
  for (const b of db.electricity_bills) {
    const ids = db.rooms.filter((r) => r.main_meter_id === b.main_meter_id).map((r) => r.id);
    const kwh = {};
    ids.forEach((id) => {
      kwh[id] = roomKwh(db.electricity_readings.find((x) => x.room_id === id && x.year === b.year && x.month === b.month));
    });
    const d = distributeBill(b, kwh, ids);
    ids.forEach((id) => { map[`${id}-${b.year}-${b.month}`] = d[id]; });
  }
  return map;
}

export function tenantStatement(db, emap, t, y, m) {
  const k0 = dYM(t.start_date), k1 = t.end_date ? dYM(t.end_date) : Infinity;
  const electricity = [];
  for (const [key, v] of Object.entries(emap)) {
    const [rid, yy, mm] = key.split('-').map(Number);
    const k = ym(yy, mm);
    if (rid === t.room_id && k >= k0 && k <= k1 && v.total > 0) electricity.push({ year: yy, month: mm, amount: v.total });
  }
  return buildStatement({
    rents: db.rent_records.filter((x) => x.tenant_id === t.id),
    electricity,
    maintenance: db.maintenance.filter((x) => x.tenant_id === t.id),
    adjustments: db.adjustments.filter((x) => x.tenant_id === t.id),
    payments: db.payments.filter((x) => x.tenant_id === t.id),
  }, y, m);
}

export function monthReport(db, y, m) {
  const emap = electricityMap(db);
  const rows = [];
  for (const t of db.tenants) {
    const row = tenantStatement(db, emap, t, y, m).find((r) => r.year === y && r.month === m);
    if (!row) continue;
    if (t.active || row.total_due !== 0 || row.paid !== 0) rows.push({ room_id: t.room_id, tenant_id: t.id, tenant: t.name, active: t.active, ...row });
  }
  return rows.sort((a, b) => a.room_id - b.room_id);
}

export function landlordMaintenance(db, y, m) {
  return r2(db.maintenance.filter((x) => x.payer === 'landlord' && dYM(x.date) === ym(y, m)).reduce((s, x) => s + Number(x.amount), 0));
}
