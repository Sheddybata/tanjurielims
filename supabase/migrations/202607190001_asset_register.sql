-- Tanjuriel Corporation IMS
-- Chairman Asset & Property Ledger schema

create extension if not exists "pgcrypto";

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),

  -- Chairman-required asset register fields
  asset_id text not null unique,
  purchase_date date,
  supplier_name text,
  serial_number text,
  department_id uuid references public.departments(id) on delete set null,
  custodian_name text not null,
  warranty_expiration date,
  maintenance_schedule_interval text,

  -- Core ledger fields used by the IMS frontend
  name text not null,
  classification text not null,
  location text,
  status text not null default 'Operational',
  book_value numeric(14, 2) default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assets_status_check check (
    status in (
      'Operational',
      'Maintenance Required',
      'Critical Fault',
      'Leased',
      'Under Construction'
    )
  ),
  constraint assets_maintenance_interval_not_blank check (
    maintenance_schedule_interval is null or length(trim(maintenance_schedule_interval)) > 0
  )
);

create index if not exists assets_department_id_idx on public.assets(department_id);
create index if not exists assets_custodian_name_idx on public.assets(custodian_name);
create index if not exists assets_warranty_expiration_idx on public.assets(warranty_expiration);
create index if not exists assets_status_idx on public.assets(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_assets_updated_at on public.assets;
create trigger set_assets_updated_at
before update on public.assets
for each row
execute function public.set_updated_at();

insert into public.departments (name)
values
  ('Asset & Property Ledger'),
  ('Microcredit & Thrift'),
  ('Renewable Energy'),
  ('ICT'),
  ('Printing'),
  ('Media'),
  ('Real Estate'),
  ('Logistics'),
  ('Corporate Administration')
on conflict (name) do nothing;
