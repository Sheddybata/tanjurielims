-- Tanjuriel Corporation IMS
-- Operational workflow schema for auth, reports, approvals, marketing, summaries, and notifications.

do $$
begin
  create type public.ims_role as enum (
    'chairman',
    'general_manager',
    'department_head',
    'marketing_officer',
    'admin'
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
    'contacted',
    'quoted',
    'assigned',
    'in_execution',
    'won',
    'lost',
    'follow_up'
  );
exception
  when duplicate_object then null;
end;
$$;

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
  department_id uuid not null references public.departments(id) on delete restrict,
  submitted_by uuid references public.profiles(id) on delete set null,
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
  updated_at timestamptz not null default now(),

  constraint daily_reports_assets_flagged_nonnegative check (assets_flagged >= 0),
  constraint daily_reports_attendance_nonnegative check (attendance >= 0),
  constraint daily_reports_inquiries_nonnegative check (inquiries >= 0)
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
  approved_report_count integer not null default 0,
  total_revenue numeric(14, 2) not null default 0,
  total_cash_in numeric(14, 2) not null default 0,
  total_expenses numeric(14, 2) not null default 0,
  asset_alert_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  link_target text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_department_id_idx on public.profiles(department_id);
create index if not exists daily_reports_department_date_idx on public.daily_reports(department_id, reporting_date);
create index if not exists daily_reports_status_idx on public.daily_reports(status);
create index if not exists approval_actions_report_id_idx on public.approval_actions(report_id);
create index if not exists marketing_leads_assigned_department_idx on public.marketing_leads(assigned_department_id);
create index if not exists marketing_leads_status_idx on public.marketing_leads(status);
create index if not exists executive_summaries_reporting_date_idx on public.executive_summaries(reporting_date);
create index if not exists notifications_recipient_read_idx on public.notifications(recipient_id, read_at);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_daily_reports_updated_at on public.daily_reports;
create trigger set_daily_reports_updated_at
before update on public.daily_reports
for each row
execute function public.set_updated_at();

drop trigger if exists set_marketing_leads_updated_at on public.marketing_leads;
create trigger set_marketing_leads_updated_at
before update on public.marketing_leads
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.daily_reports enable row level security;
alter table public.daily_report_equipment_status enable row level security;
alter table public.approval_actions enable row level security;
alter table public.marketing_leads enable row level security;
alter table public.executive_summaries enable row level security;
alter table public.notifications enable row level security;

create or replace function public.current_profile_role()
returns public.ims_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_profile_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid();
$$;

drop policy if exists profiles_select_by_role on public.profiles;
create policy profiles_select_by_role
on public.profiles
for select
using (
  id = auth.uid()
  or public.current_profile_role() in ('chairman', 'general_manager', 'admin')
);

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
on public.profiles
for update
using (
  id = auth.uid()
  or public.current_profile_role() = 'admin'
)
with check (
  id = auth.uid()
  or public.current_profile_role() = 'admin'
);

drop policy if exists daily_reports_select_by_role on public.daily_reports;
create policy daily_reports_select_by_role
on public.daily_reports
for select
using (
  public.current_profile_role() in ('chairman', 'general_manager', 'admin')
  or department_id = public.current_profile_department_id()
);

drop policy if exists daily_reports_insert_by_department_head on public.daily_reports;
create policy daily_reports_insert_by_department_head
on public.daily_reports
for insert
with check (
  public.current_profile_role() in ('department_head', 'admin')
  and (
    public.current_profile_role() = 'admin'
    or department_id = public.current_profile_department_id()
  )
  and status in ('draft', 'pending_chairman_review')
);

drop policy if exists daily_reports_update_workflow on public.daily_reports;
create policy daily_reports_update_workflow
on public.daily_reports
for update
using (
  public.current_profile_role() in ('chairman', 'admin')
  or (
    public.current_profile_role() = 'department_head'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'returned')
  )
)
with check (
  public.current_profile_role() in ('chairman', 'admin')
  or (
    public.current_profile_role() = 'department_head'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'pending_chairman_review')
  )
);

drop policy if exists equipment_status_select_by_report_access on public.daily_report_equipment_status;
create policy equipment_status_select_by_report_access
on public.daily_report_equipment_status
for select
using (
  exists (
    select 1
    from public.daily_reports report
    where report.id = report_id
      and (
        public.current_profile_role() in ('chairman', 'general_manager', 'admin')
        or report.department_id = public.current_profile_department_id()
      )
  )
);

drop policy if exists equipment_status_insert_by_report_owner on public.daily_report_equipment_status;
create policy equipment_status_insert_by_report_owner
on public.daily_report_equipment_status
for insert
with check (
  exists (
    select 1
    from public.daily_reports report
    where report.id = report_id
      and (
        public.current_profile_role() = 'admin'
        or report.department_id = public.current_profile_department_id()
      )
  )
);

drop policy if exists approval_actions_select_by_role on public.approval_actions;
create policy approval_actions_select_by_role
on public.approval_actions
for select
using (
  public.current_profile_role() in ('chairman', 'general_manager', 'admin')
  or exists (
    select 1
    from public.daily_reports report
    where report.id = report_id
      and report.department_id = public.current_profile_department_id()
  )
);

drop policy if exists approval_actions_insert_by_chairman on public.approval_actions;
create policy approval_actions_insert_by_chairman
on public.approval_actions
for insert
with check (
  public.current_profile_role() in ('chairman', 'admin')
);

drop policy if exists marketing_leads_select_by_role on public.marketing_leads;
create policy marketing_leads_select_by_role
on public.marketing_leads
for select
using (
  public.current_profile_role() in ('chairman', 'general_manager', 'marketing_officer', 'admin')
  or assigned_department_id = public.current_profile_department_id()
);

drop policy if exists marketing_leads_insert_by_marketing on public.marketing_leads;
create policy marketing_leads_insert_by_marketing
on public.marketing_leads
for insert
with check (
  public.current_profile_role() in ('marketing_officer', 'admin')
);

drop policy if exists marketing_leads_update_by_marketing_or_gm on public.marketing_leads;
create policy marketing_leads_update_by_marketing_or_gm
on public.marketing_leads
for update
using (
  public.current_profile_role() in ('marketing_officer', 'general_manager', 'admin')
)
with check (
  public.current_profile_role() in ('marketing_officer', 'general_manager', 'admin')
);

drop policy if exists executive_summaries_select_by_executive on public.executive_summaries;
create policy executive_summaries_select_by_executive
on public.executive_summaries
for select
using (
  public.current_profile_role() in ('chairman', 'general_manager', 'admin')
);

drop policy if exists executive_summaries_insert_by_chairman on public.executive_summaries;
create policy executive_summaries_insert_by_chairman
on public.executive_summaries
for insert
with check (
  public.current_profile_role() in ('chairman', 'admin')
);

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
on public.notifications
for select
using (
  recipient_id = auth.uid()
  or public.current_profile_role() = 'admin'
);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
on public.notifications
for update
using (
  recipient_id = auth.uid()
  or public.current_profile_role() = 'admin'
)
with check (
  recipient_id = auth.uid()
  or public.current_profile_role() = 'admin'
);
