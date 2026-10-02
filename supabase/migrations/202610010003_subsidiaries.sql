-- Subsidiaries, and the departments that sit inside each one.
-- Run after 202610010002_staff_register.sql.

create table if not exists public.subsidiaries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  status text not null default 'operating',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint subsidiaries_status_check check (status in ('operating', 'planned'))
);

insert into public.subsidiaries (name, code, status, sort_order)
values
  ('Tanjuriel Corporation', 'HQ', 'operating', 1),
  ('Tanjuriel Admin', 'ADM', 'operating', 2),
  ('Tanjuriel Technologies', 'TECH', 'operating', 3),
  ('Tanjuriel Education', 'EDU', 'operating', 4),
  ('Tanjuriel Farms', 'FRM', 'operating', 5),
  ('Tanjuriel Banking and Finance', 'BIF', 'operating', 6),
  ('Tanjuriel Oil/Gas, Real Estate, Suite and Construction', 'CON', 'operating', 7),
  ('Tanjuriel Medicals', 'MED', 'planned', 8),
  ('Tanjuriel Legal', 'LEG', 'operating', 9)
on conflict (code) do update
set name = excluded.name,
    status = excluded.status,
    sort_order = excluded.sort_order;

alter table public.departments add column if not exists code text;
create unique index if not exists departments_code_uidx on public.departments (code) where code is not null;

update public.departments set code = 'ADM' where name = 'Corporate Administration' and code is null;
update public.departments set code = 'MCT' where name = 'Microcredit & Thrift' and code is null;
update public.departments set code = 'REN' where name = 'Renewable Energy' and code is null;
update public.departments set code = 'ICT' where name = 'ICT' and code is null;
update public.departments set code = 'PRT' where name = 'Printing' and code is null;
update public.departments set code = 'MDA' where name = 'Media' and code is null;
update public.departments set code = 'RES' where name = 'Real Estate' and code is null;
update public.departments set code = 'LOG' where name = 'Logistics' and code is null;

alter table public.departments add column if not exists subsidiary_id uuid references public.subsidiaries(id) on delete restrict;

alter table public.profiles add column if not exists subsidiary_id uuid references public.subsidiaries(id) on delete set null;

alter table public.departments drop constraint if exists departments_name_key;

update public.departments d
set subsidiary_id = s.id,
    code = coalesce(d.code, 'ADM')
from public.subsidiaries s
where s.code = 'ADM' and d.name = 'Corporate Administration';

update public.departments d
set subsidiary_id = s.id
from public.subsidiaries s
where s.code = 'BIF' and d.name = 'Microcredit & Thrift';

update public.departments d
set subsidiary_id = s.id
from public.subsidiaries s
where s.code = 'TECH' and d.name in ('Renewable Energy', 'ICT', 'Printing', 'Media');

update public.departments d
set name = 'Transport',
    code = 'TRN',
    subsidiary_id = s.id
from public.subsidiaries s
where s.code = 'TECH' and d.name = 'Logistics';

update public.departments d
set subsidiary_id = s.id
from public.subsidiaries s
where s.code = 'CON' and d.name = 'Real Estate';

insert into public.departments (name, code, subsidiary_id)
select seed.name, seed.code, s.id
from (
  values
    ('Head office', 'HDO', 'HQ'),
    ('HR', 'HR', 'ADM'),
    ('Audit', 'AUA', 'ADM'),
    ('Strategy and Partnerships', 'STP', 'ADM'),
    ('EBOMI schools', 'EBM', 'EDU'),
    ('TESMA', 'TES', 'EDU'),
    ('Greenhouse', 'GHG', 'FRM'),
    ('Farms and Livestock', 'LIV', 'FRM'),
    ('Investment', 'INV', 'BIF'),
    ('Audit', 'AUB', 'BIF'),
    ('Oil and Gas', 'OIL', 'CON'),
    ('Suite', 'SUI', 'CON'),
    ('Construction', 'CST', 'CON'),
    ('Clinic', 'CLN', 'MED'),
    ('Pharmaceuticals', 'PHA', 'MED'),
    ('Legal', 'LGL', 'LEG')
) as seed(name, code, subsidiary_code)
join public.subsidiaries s on s.code = seed.subsidiary_code
where not exists (
  select 1 from public.departments existing where existing.code = seed.code
);

create unique index if not exists departments_subsidiary_name_uidx
  on public.departments (subsidiary_id, name);

alter table public.subsidiaries enable row level security;

drop policy if exists subsidiaries_select_authenticated on public.subsidiaries;
create policy subsidiaries_select_authenticated on public.subsidiaries
for select to authenticated
using (true);
