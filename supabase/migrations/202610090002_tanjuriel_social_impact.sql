-- Add Tanjuriel Social Impact and its departments.

insert into public.subsidiaries (name, code, status, sort_order)
values ('Tanjuriel Social Impact', 'TSI', 'operating', 10)
on conflict (code) do update
set name = excluded.name,
    status = excluded.status,
    sort_order = excluded.sort_order;

insert into public.departments (name, code, subsidiary_id)
select seed.name, seed.code, s.id
from (
  values
    ('DISEF', 'DISEF', 'TSI'),
    ('KSEI', 'KSEI', 'TSI'),
    ('EL-COM', 'ELC', 'TSI')
) as seed(name, code, subsidiary_code)
join public.subsidiaries s on s.code = seed.subsidiary_code
where not exists (
  select 1 from public.departments existing where existing.code = seed.code
);
