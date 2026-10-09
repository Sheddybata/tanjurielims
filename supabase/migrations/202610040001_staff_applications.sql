-- Public staff intake applications + full staff register fields.
-- Staff ID is issued only when HR or Director of Administration approves an application.

create extension if not exists "pgcrypto";

-- Ensure core staff table exists (safe if already created in production).
create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  staff_number text unique,
  department_id uuid references public.departments(id) on delete restrict,
  full_name text not null,
  job_title text,
  phone text,
  personal_email text,
  work_email text,
  preferred_name text,
  start_date date,
  status text not null default 'probation',
  date_of_birth date,
  sex text,
  nationality text,
  home_address text,
  next_of_kin_name text,
  next_of_kin_phone text,
  government_id_type text,
  government_id_number text,
  nin text,
  bvn text,
  bank_name text,
  bank_account text,
  highest_qualification text,
  blood_group text,
  reports_to_staff_id uuid references public.staff(id) on delete set null,
  proposed_ims_role text,
  employment_type text,
  staff_type text,
  work_location text,
  biometric_consent boolean default false,
  biometric_method text,
  biometric_ready boolean,
  biometric_note text,
  annual_leave_days integer not null default 10,
  photograph_path text,
  profile_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff add column if not exists work_email text;
alter table public.staff add column if not exists preferred_name text;
alter table public.staff add column if not exists nationality text;
alter table public.staff add column if not exists government_id_type text;
alter table public.staff add column if not exists nin text;
alter table public.staff add column if not exists bvn text;
alter table public.staff add column if not exists bank_name text;
alter table public.staff add column if not exists highest_qualification text;
alter table public.staff add column if not exists blood_group text;
alter table public.staff add column if not exists reports_to_staff_id uuid references public.staff(id) on delete set null;
alter table public.staff add column if not exists proposed_ims_role text;
alter table public.staff add column if not exists employment_type text;
alter table public.staff add column if not exists staff_type text;
alter table public.staff add column if not exists work_location text;
alter table public.staff add column if not exists biometric_consent boolean default false;
alter table public.staff add column if not exists biometric_method text;
alter table public.staff add column if not exists biometric_ready boolean;
alter table public.staff add column if not exists biometric_note text;
alter table public.staff add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create table if not exists public.staff_applications (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  status text not null default 'submitted',
  staff_type text not null default 'existing',
  employment_type text not null default 'full_time',
  employment_status text not null default 'probation',
  full_name text not null,
  preferred_name text,
  sex text not null,
  date_of_birth date not null,
  nationality text not null default 'Nigerian',
  phone text not null,
  personal_email text not null,
  work_email text,
  home_address text not null,
  next_of_kin_name text not null,
  next_of_kin_phone text not null,
  subsidiary_id uuid references public.subsidiaries(id) on delete set null,
  department_id uuid not null references public.departments(id) on delete restrict,
  job_title text not null,
  proposed_ims_role text not null,
  reports_to_name text,
  work_location text,
  start_date date not null,
  government_id_type text not null,
  government_id_number text,
  nin text,
  bvn text,
  bank_name text,
  bank_account text,
  highest_qualification text,
  blood_group text,
  biometric_consent boolean not null default false,
  biometric_method text,
  biometric_ready boolean,
  biometric_note text,
  annual_leave_days integer not null default 10,
  photograph_path text,
  id_document_path text,
  cv_path text,
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  staff_id uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_applications_status_check check (
    status in ('submitted', 'under_review', 'approved', 'rejected')
  ),
  constraint staff_applications_staff_type_check check (staff_type in ('existing', 'new')),
  constraint staff_applications_employment_type_check check (
    employment_type in ('full_time', 'part_time', 'contract', 'intern', 'nysc', 'consultant')
  ),
  constraint staff_applications_leave_check check (annual_leave_days between 10 and 20),
  constraint staff_applications_biometric_consent_check check (biometric_consent = true)
);

create index if not exists staff_applications_status_idx on public.staff_applications(status, created_at desc);
create index if not exists staff_applications_department_idx on public.staff_applications(department_id);
create index if not exists staff_applications_email_idx on public.staff_applications(lower(personal_email));

drop trigger if exists set_staff_applications_updated_at on public.staff_applications;
create trigger set_staff_applications_updated_at
before update on public.staff_applications
for each row execute function public.set_updated_at();

drop trigger if exists set_staff_updated_at on public.staff;
create trigger set_staff_updated_at
before update on public.staff
for each row execute function public.set_updated_at();

create or replace function public.allocate_staff_number(p_department_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  dept_code text;
  year_text text := to_char(current_date, 'YYYY');
  prefix text;
  next_seq integer;
  candidate text;
begin
  select coalesce(nullif(trim(code), ''), upper(substr(regexp_replace(name, '[^A-Za-z]', '', 'g'), 1, 3)), 'GEN')
  into dept_code
  from public.departments
  where id = p_department_id;

  if dept_code is null then
    raise exception 'Department not found';
  end if;

  prefix := 'TAN/EMP/' || upper(dept_code) || '/' || year_text || '/';

  select coalesce(max(nullif(substring(staff_number from '([0-9]+)$'), '')::integer), 0) + 1
  into next_seq
  from public.staff
  where staff_number like prefix || '%'
    and status not in ('resigned', 'retired', 'dismissed');

  candidate := prefix || lpad(next_seq::text, 3, '0');
  return candidate;
end;
$$;

-- RLS: do not leave public.staff open to anon/authenticated without policies.
alter table public.staff enable row level security;
alter table public.staff_applications enable row level security;

drop policy if exists staff_select_people_roles on public.staff;
create policy staff_select_people_roles
on public.staff
for select to authenticated
using (
  public.current_profile_role() in (
    'chairman',
    'managing_director',
    'executive_director',
    'general_manager',
    'director_of_administration',
    'human_resources'
  )
);

drop policy if exists staff_insert_hr_admin on public.staff;
create policy staff_insert_hr_admin
on public.staff
for insert to authenticated
with check (
  public.current_profile_role() in ('director_of_administration', 'human_resources')
);

drop policy if exists staff_update_hr_admin on public.staff;
create policy staff_update_hr_admin
on public.staff
for update to authenticated
using (
  public.current_profile_role() in ('director_of_administration', 'human_resources')
)
with check (
  public.current_profile_role() in ('director_of_administration', 'human_resources')
);

drop policy if exists staff_applications_select_reviewers on public.staff_applications;
create policy staff_applications_select_reviewers
on public.staff_applications
for select to authenticated
using (
  public.current_profile_role() in (
    'chairman',
    'managing_director',
    'director_of_administration',
    'human_resources',
    'general_manager'
  )
);

drop policy if exists staff_applications_update_reviewers on public.staff_applications;
create policy staff_applications_update_reviewers
on public.staff_applications
for update to authenticated
using (
  public.current_profile_role() in ('director_of_administration', 'human_resources')
)
with check (
  public.current_profile_role() in ('director_of_administration', 'human_resources')
);

-- No public insert policy: /apply writes via service role only.

insert into storage.buckets (id, name, public)
values ('staff-applications', 'staff-applications', false)
on conflict (id) do nothing;

grant execute on function public.allocate_staff_number(uuid) to authenticated, service_role;
