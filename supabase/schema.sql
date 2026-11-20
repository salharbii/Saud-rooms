-- SAUD ROOMS: الصق هذا الملف كاملاً في Supabase > SQL Editor ثم Run
create extension if not exists pgcrypto;

create table main_meters (
  id int primary key,
  name text not null,
  meter_no text
);
insert into main_meters(id,name) values (1,'العداد الأول (غرف 1-10)'),(2,'العداد الثاني (غرف 11-20)');

create table rooms (
  id int primary key check (id between 1 and 20),
  main_meter_id int not null references main_meters(id),
  sub_meter_no text,
  monthly_rent numeric(12,2) not null default 0
);
insert into rooms(id, main_meter_id)
select g, case when g<=10 then 1 else 2 end from generate_series(1,20) g;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  room_id int not null references rooms(id),
  name text not null,
  phone text,
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  created_at timestamptz default now()
);
create unique index one_active_tenant_per_room on tenants(room_id) where active;

create table rent_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  year int not null, month int not null check (month between 1 and 12),
  amount numeric(12,2) not null,
  unique (tenant_id, year, month)
);

create table electricity_bills (
  id uuid primary key default gen_random_uuid(),
  main_meter_id int not null references main_meters(id),
  year int not null, month int not null check (month between 1 and 12),
  amount numeric(12,2) not null,
  extra_fees numeric(12,2) not null default 0,
  fee_method text not null default 'proportional' check (fee_method in ('proportional','equal')),
  unique (main_meter_id, year, month)
);

create table electricity_readings (
  id uuid primary key default gen_random_uuid(),
  room_id int not null references rooms(id),
  year int not null, month int not null check (month between 1 and 12),
  prev_reading numeric(12,2),
  curr_reading numeric(12,2),
  manual_kwh numeric(12,2),
  unique (room_id, year, month)
);

create table maintenance (
  id uuid primary key default gen_random_uuid(),
  room_id int not null references rooms(id),
  tenant_id uuid references tenants(id),
  date date not null default current_date,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  payer text not null check (payer in ('tenant','landlord'))
);

create table adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  year int not null, month int not null check (month between 1 and 12),
  kind text not null check (kind in ('expense','discount')),
  reason text not null,
  amount numeric(12,2) not null check (amount >= 0)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_at date not null default current_date,
  method text not null default 'cash' check (method in ('cash','transfer','card','other')),
  note text
);

do $$
declare t text;
begin
  foreach t in array array['main_meters','rooms','tenants','rent_records','electricity_bills',
    'electricity_readings','maintenance','adjustments','payments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "admin_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
-- المديونية لا تُخزَّن؛ تُحسب من المستحقات والدفعات فلا تتكرر ولا تضيع.
