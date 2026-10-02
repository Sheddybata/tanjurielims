-- Directorate KPI targets, and the result entered later.
-- Run after 202610010003_subsidiaries.sql.

create table if not exists public.directorate_kpis (
  id uuid primary key default gen_random_uuid(),
  subsidiary_id uuid not null references public.subsidiaries(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  measure text not null,
  target_value numeric not null,
  unit text not null default '',
  period_start date not null,
  period_end date not null,
  actual_value numeric,
  actual_note text,
  set_by uuid references public.profiles(id) on delete set null,
  result_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint directorate_kpis_period_check check (period_end >= period_start),
  constraint directorate_kpis_measure_check check (char_length(trim(measure)) > 0)
);

create index if not exists directorate_kpis_subsidiary_idx on public.directorate_kpis (subsidiary_id, period_start);

drop trigger if exists set_directorate_kpis_updated_at on public.directorate_kpis;
create trigger set_directorate_kpis_updated_at
before update on public.directorate_kpis
for each row execute function public.set_updated_at();

create or replace function public.caller_subsidiary_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select subsidiary_id from public.profiles where id = auth.uid() and is_active = true),
    (
      select department.subsidiary_id
      from public.profiles profile
      join public.departments department on department.id = profile.department_id
      where profile.id = auth.uid() and profile.is_active = true
    )
  );
$$;

alter table public.directorate_kpis enable row level security;

drop policy if exists directorate_kpis_select on public.directorate_kpis;
create policy directorate_kpis_select on public.directorate_kpis
for select to authenticated
using (
  public.current_profile_role() in (
    'chairman',
    'managing_director',
    'general_manager',
    'director_of_administration',
    'human_resources'
  )
  or subsidiary_id = public.caller_subsidiary_id()
);

drop policy if exists directorate_kpis_insert on public.directorate_kpis;
create policy directorate_kpis_insert on public.directorate_kpis
for insert to authenticated
with check (public.current_profile_role() = 'director_of_administration');

drop policy if exists directorate_kpis_update on public.directorate_kpis;
create policy directorate_kpis_update on public.directorate_kpis
for update to authenticated
using (
  public.current_profile_role() = 'director_of_administration'
  or (
    public.current_profile_role() in ('executive_director', 'manager', 'department_head')
    and subsidiary_id = public.caller_subsidiary_id()
  )
)
with check (
  public.current_profile_role() = 'director_of_administration'
  or (
    public.current_profile_role() in ('executive_director', 'manager', 'department_head')
    and subsidiary_id = public.caller_subsidiary_id()
  )
);
