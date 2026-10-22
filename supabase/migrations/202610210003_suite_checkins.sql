-- Suite managers record guest check-in and amount paid.
-- This is not the Banking and Finance cash book.

create table if not exists public.suite_checkins (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  guest_name text not null,
  suite_name text not null,
  check_in_date date not null default current_date,
  check_out_date date,
  amount_paid numeric(14, 2) not null default 0,
  payment_method text,
  note text,
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suite_checkins_department_date_idx
  on public.suite_checkins(department_id, check_in_date desc);

drop trigger if exists set_suite_checkins_updated_at on public.suite_checkins;
create trigger set_suite_checkins_updated_at
before update on public.suite_checkins
for each row execute function public.set_updated_at();

alter table public.suite_checkins enable row level security;

drop policy if exists suite_checkins_select on public.suite_checkins;
create policy suite_checkins_select on public.suite_checkins
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

drop policy if exists suite_checkins_write on public.suite_checkins;
create policy suite_checkins_write on public.suite_checkins
for all to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'manager', 'department_head', 'executive_director')
)
with check (
  public.is_executive()
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
  or public.current_profile_role() = 'director_of_administration'
);
