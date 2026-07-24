-- Tanjuriel Corporation IMS — launch schema aligned to locked product decisions.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  create type public.ims_role as enum (
    'chairman',
    'general_manager',
    'department_head',
    'marketing_officer'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.report_status as enum (
    'draft',
    'pending_chairman_review',
    'approved',
    'returned'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.report_priority as enum (
    'normal',
    'attention',
    'critical'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.marketing_status as enum (
    'new',
    'quoted',
    'assigned',
    'follow_up'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null unique,
  purchase_date date,
  supplier_name text,
  serial_number text,
  department_id uuid references public.departments(id) on delete set null,
  custodian_name text not null,
  warranty_expiration date,
  maintenance_schedule_interval text,
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
  )
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.ims_role not null,
  department_id uuid references public.departments(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  display_code text,
  department_id uuid not null references public.departments(id) on delete restrict,
  submitted_by uuid references public.profiles(id) on delete set null,
  parent_report_id uuid references public.daily_reports(id) on delete set null,
  reporting_date date not null default current_date,
  status public.report_status not null default 'draft',
  priority public.report_priority not null default 'normal',
  revenue numeric(14, 2) not null default 0,
  inquiries integer not null default 0,
  attendance integer not null default 0,
  active_operations integer not null default 0,
  cash_in numeric(14, 2) not null default 0,
  expenses numeric(14, 2) not null default 0,
  assets_flagged integer not null default 0,
  jobs_completed text,
  jobs_in_progress text,
  department_update text,
  current_projects text,
  upcoming_projects text,
  growth_ideas text,
  challenges text,
  summary text,
  submitted_at timestamptz,
  approved_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_report_equipment_status (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  equipment_label text not null,
  status_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status public.report_status not null,
  new_status public.report_status not null,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  visit_date date not null default current_date,
  proposal text not null,
  quotation numeric(14, 2) not null default 0,
  assigned_department_id uuid references public.departments(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  status public.marketing_status not null default 'new',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.executive_summaries (
  id uuid primary key default gen_random_uuid(),
  reporting_date date not null,
  generated_by uuid references public.profiles(id) on delete set null,
  title text not null default 'Chairman Executive Summary',
  summary_text text not null,
  pdf_path text,
  approved_report_count integer not null default 0,
  total_revenue numeric(14, 2) not null default 0,
  total_cash_in numeric(14, 2) not null default 0,
  total_expenses numeric(14, 2) not null default 0,
  asset_alert_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.daily_reports(id) on delete set null,
  title text not null,
  message text not null,
  link_target text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.departments (name)
values
  ('Corporate Administration'),
  ('Microcredit & Thrift'),
  ('Renewable Energy'),
  ('ICT'),
  ('Printing'),
  ('Media'),
  ('Real Estate'),
  ('Logistics')
on conflict (name) do nothing;

create index if not exists assets_department_id_idx on public.assets(department_id);
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_department_id_idx on public.profiles(department_id);
create index if not exists daily_reports_department_date_idx on public.daily_reports(department_id, reporting_date);
create index if not exists daily_reports_status_idx on public.daily_reports(status);
create index if not exists approval_actions_report_id_idx on public.approval_actions(report_id);
create index if not exists marketing_leads_assigned_department_idx on public.marketing_leads(assigned_department_id);
create index if not exists notifications_recipient_read_idx on public.notifications(recipient_id, read_at);

drop trigger if exists set_assets_updated_at on public.assets;
create trigger set_assets_updated_at before update on public.assets
for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_reports_updated_at on public.daily_reports;
create trigger set_daily_reports_updated_at before update on public.daily_reports
for each row execute function public.set_updated_at();

drop trigger if exists set_marketing_leads_updated_at on public.marketing_leads;
create trigger set_marketing_leads_updated_at before update on public.marketing_leads
for each row execute function public.set_updated_at();

create or replace function public.current_profile_role()
returns public.ims_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.current_profile_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_executive()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() in ('chairman', 'general_manager');
$$;

-- Notify department head + general managers on approve/return
create or replace function public.notify_on_approval_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report_row public.daily_reports%rowtype;
  dept_name text;
  actor_name text;
  title_text text;
  message_text text;
  recipient uuid;
begin
  if new.new_status not in ('approved', 'returned') then
    return new;
  end if;

  select * into report_row from public.daily_reports where id = new.report_id;
  select name into dept_name from public.departments where id = report_row.department_id;
  select full_name into actor_name from public.profiles where id = new.actor_id;

  if new.new_status = 'approved' then
    title_text := coalesce(dept_name, 'Department') || ' report approved';
    message_text := coalesce(new.comment, coalesce(actor_name, 'Executive') || ' approved this report.');
  else
    title_text := coalesce(dept_name, 'Department') || ' report returned for correction';
    message_text := coalesce(new.comment, coalesce(actor_name, 'Executive') || ' returned this report for correction.');
  end if;

  if report_row.submitted_by is not null then
    insert into public.notifications (recipient_id, report_id, title, message, link_target)
    values (report_row.submitted_by, report_row.id, title_text, message_text, report_row.id::text);
  end if;

  for recipient in
    select id from public.profiles
    where role = 'general_manager' and is_active = true and id is distinct from report_row.submitted_by
  loop
    insert into public.notifications (recipient_id, report_id, title, message, link_target)
    values (recipient, report_row.id, title_text, message_text, report_row.id::text);
  end loop;

  return new;
end;
$$;

drop trigger if exists approval_actions_notify on public.approval_actions;
create trigger approval_actions_notify
after insert on public.approval_actions
for each row execute function public.notify_on_approval_action();

alter table public.departments enable row level security;
alter table public.assets enable row level security;
alter table public.profiles enable row level security;
alter table public.daily_reports enable row level security;
alter table public.daily_report_equipment_status enable row level security;
alter table public.approval_actions enable row level security;
alter table public.marketing_leads enable row level security;
alter table public.executive_summaries enable row level security;
alter table public.notifications enable row level security;

-- Departments
drop policy if exists departments_select_authenticated on public.departments;
create policy departments_select_authenticated on public.departments
for select to authenticated using (true);

drop policy if exists departments_write_executive on public.departments;
create policy departments_write_executive on public.departments
for all to authenticated
using (public.is_executive())
with check (public.is_executive());

-- Profiles
drop policy if exists profiles_select_by_role on public.profiles;
create policy profiles_select_by_role on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_executive()
);

drop policy if exists profiles_insert_executive on public.profiles;
create policy profiles_insert_executive on public.profiles
for insert to authenticated
with check (public.is_executive());

drop policy if exists profiles_update_executive_or_self on public.profiles;
create policy profiles_update_executive_or_self on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_executive())
with check (id = auth.uid() or public.is_executive());

-- Daily reports
drop policy if exists daily_reports_select_by_role on public.daily_reports;
create policy daily_reports_select_by_role on public.daily_reports
for select to authenticated
using (
  public.is_executive()
  or department_id = public.current_profile_department_id()
);

drop policy if exists daily_reports_insert_by_department_head on public.daily_reports;
create policy daily_reports_insert_by_department_head on public.daily_reports
for insert to authenticated
with check (
  public.current_profile_role() = 'department_head'
  and department_id = public.current_profile_department_id()
  and status in ('draft', 'pending_chairman_review')
);

drop policy if exists daily_reports_update_workflow on public.daily_reports;
create policy daily_reports_update_workflow on public.daily_reports
for update to authenticated
using (
  public.is_executive()
  or (
    public.current_profile_role() = 'department_head'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'returned')
  )
)
with check (
  public.is_executive()
  or (
    public.current_profile_role() = 'department_head'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'pending_chairman_review')
  )
);

-- Equipment
drop policy if exists equipment_status_select_by_report_access on public.daily_report_equipment_status;
create policy equipment_status_select_by_report_access on public.daily_report_equipment_status
for select to authenticated
using (
  exists (
    select 1 from public.daily_reports report
    where report.id = report_id
      and (public.is_executive() or report.department_id = public.current_profile_department_id())
  )
);

drop policy if exists equipment_status_insert_by_report_owner on public.daily_report_equipment_status;
create policy equipment_status_insert_by_report_owner on public.daily_report_equipment_status
for insert to authenticated
with check (
  exists (
    select 1 from public.daily_reports report
    where report.id = report_id
      and report.department_id = public.current_profile_department_id()
  )
);

drop policy if exists equipment_status_delete_by_report_owner on public.daily_report_equipment_status;
create policy equipment_status_delete_by_report_owner on public.daily_report_equipment_status
for delete to authenticated
using (
  exists (
    select 1 from public.daily_reports report
    where report.id = report_id
      and (public.is_executive() or report.department_id = public.current_profile_department_id())
  )
);

-- Approvals: Chairman + GM
drop policy if exists approval_actions_select_by_role on public.approval_actions;
create policy approval_actions_select_by_role on public.approval_actions
for select to authenticated
using (
  public.is_executive()
  or exists (
    select 1 from public.daily_reports report
    where report.id = report_id
      and report.department_id = public.current_profile_department_id()
  )
);

drop policy if exists approval_actions_insert_by_executive on public.approval_actions;
create policy approval_actions_insert_by_executive on public.approval_actions
for insert to authenticated
with check (public.is_executive());

-- Marketing
drop policy if exists marketing_leads_select_by_role on public.marketing_leads;
create policy marketing_leads_select_by_role on public.marketing_leads
for select to authenticated
using (
  public.current_profile_role() in ('chairman', 'general_manager', 'marketing_officer')
  or assigned_department_id = public.current_profile_department_id()
);

drop policy if exists marketing_leads_write_marketing on public.marketing_leads;
create policy marketing_leads_write_marketing on public.marketing_leads
for all to authenticated
using (public.current_profile_role() = 'marketing_officer')
with check (public.current_profile_role() = 'marketing_officer');

-- Executive summaries
drop policy if exists executive_summaries_select_by_executive on public.executive_summaries;
create policy executive_summaries_select_by_executive on public.executive_summaries
for select to authenticated
using (public.is_executive());

drop policy if exists executive_summaries_insert_by_chairman on public.executive_summaries;
create policy executive_summaries_insert_by_chairman on public.executive_summaries
for insert to authenticated
with check (public.current_profile_role() = 'chairman');

-- Notifications
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (recipient_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

-- Assets
drop policy if exists assets_select_by_role on public.assets;
create policy assets_select_by_role on public.assets
for select to authenticated
using (
  public.is_executive()
  or department_id = public.current_profile_department_id()
);

drop policy if exists assets_write_by_role on public.assets;
create policy assets_write_by_role on public.assets
for all to authenticated
using (
  public.is_executive()
  or (
    public.current_profile_role() = 'department_head'
    and department_id = public.current_profile_department_id()
  )
)
with check (
  public.is_executive()
  or (
    public.current_profile_role() = 'department_head'
    and department_id = public.current_profile_department_id()
  )
);

insert into storage.buckets (id, name, public)
values ('executive-summaries', 'executive-summaries', false)
on conflict (id) do nothing;
