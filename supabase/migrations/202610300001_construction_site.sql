-- Construction site book. Current Construction staff sit on the Jalingo road job in Taraba.

create table if not exists public.construction_projects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  display_code text not null unique,
  name text not null,
  location text not null,
  state text,
  work_type text not null default 'road',
  client text,
  start_date date,
  status text not null default 'active',
  is_default boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_projects_name_not_blank check (char_length(trim(name)) > 0),
  constraint construction_projects_status_check check (status in ('active', 'on_hold', 'completed')),
  constraint construction_projects_work_type_check check (work_type in ('road', 'building', 'civil', 'other'))
);

create unique index if not exists construction_projects_one_default_idx
  on public.construction_projects (department_id)
  where is_default;

create table if not exists public.construction_crew (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  role_on_site text,
  assigned_on date not null default current_date,
  left_on date,
  created_at timestamptz not null default now(),
  constraint construction_crew_unique unique (project_id, staff_id)
);

create table if not exists public.construction_site_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  log_date date not null default current_date,
  crew_present integer not null default 0,
  work_done text not null,
  equipment text,
  materials text,
  weather text,
  challenges text,
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint construction_site_logs_work_not_blank check (char_length(trim(work_done)) > 0),
  constraint construction_site_logs_crew_nonnegative check (crew_present >= 0)
);

create index if not exists construction_crew_project_idx
  on public.construction_crew(project_id, left_on);
create index if not exists construction_site_logs_project_date_idx
  on public.construction_site_logs(project_id, log_date desc);

drop trigger if exists set_construction_projects_updated_at on public.construction_projects;
create trigger set_construction_projects_updated_at
before update on public.construction_projects
for each row execute function public.set_updated_at();

insert into public.construction_projects (
  department_id, display_code, name, location, state, work_type, status, is_default, note, start_date
)
select
  d.id,
  'TAN-CST-JALINGO-2026',
  'Jalingo Road Construction',
  'Jalingo',
  'Taraba State',
  'road',
  'active',
  true,
  'Live road works. Everyone currently on the Construction register is on this job.',
  current_date
from public.departments d
where d.code = 'CST'
  and not exists (
    select 1 from public.construction_projects existing where existing.display_code = 'TAN-CST-JALINGO-2026'
  );

insert into public.construction_crew (project_id, staff_id, role_on_site)
select p.id, s.id, s.job_title
from public.staff s
join public.departments d on d.id = s.department_id
join public.construction_projects p on p.department_id = d.id and p.is_default
where d.code = 'CST'
  and s.status not in ('resigned', 'retired', 'dismissed')
on conflict (project_id, staff_id) do nothing;

create or replace function public.assign_construction_staff_to_default_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dept_code text;
  project uuid;
begin
  if new.department_id is not null then
    select code into dept_code from public.departments where id = new.department_id;
  end if;
  if new.department_id is null or dept_code is distinct from 'CST' or new.status in ('resigned', 'retired', 'dismissed') then
    update public.construction_crew crew
    set left_on = current_date
    where crew.staff_id = new.id and crew.left_on is null;
    return new;
  end if;
  select id into project
  from public.construction_projects
  where department_id = new.department_id and is_default and status = 'active'
  order by created_at desc
  limit 1;
  if project is null then
    return new;
  end if;
  insert into public.construction_crew (project_id, staff_id, role_on_site, left_on)
  values (project, new.id, new.job_title, null)
  on conflict (project_id, staff_id) do update
    set left_on = null,
        role_on_site = excluded.role_on_site;
  return new;
end;
$$;

drop trigger if exists assign_construction_staff_to_default_project on public.staff;
create trigger assign_construction_staff_to_default_project
after insert or update of department_id, status, job_title on public.staff
for each row execute function public.assign_construction_staff_to_default_project();

alter table public.construction_projects enable row level security;
alter table public.construction_crew enable row level security;
alter table public.construction_site_logs enable row level security;

drop policy if exists construction_projects_select on public.construction_projects;
create policy construction_projects_select on public.construction_projects
for select to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'managing_director')
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
);

drop policy if exists construction_crew_select on public.construction_crew;
create policy construction_crew_select on public.construction_crew
for select to authenticated
using (
  exists (
    select 1 from public.construction_projects p
    where p.id = project_id
      and (
        public.is_executive()
        or public.current_profile_role() in ('director_of_administration', 'managing_director')
        or p.department_id = public.current_profile_department_id()
        or (
          public.current_profile_role() = 'executive_director'
          and public.department_in_caller_subsidiary(p.department_id)
        )
      )
  )
);

drop policy if exists construction_site_logs_select on public.construction_site_logs;
create policy construction_site_logs_select on public.construction_site_logs
for select to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'managing_director')
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
);

drop policy if exists construction_site_logs_insert on public.construction_site_logs;
create policy construction_site_logs_insert on public.construction_site_logs
for insert to authenticated
with check (
  public.is_executive()
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
  or public.current_profile_role() = 'director_of_administration'
);
