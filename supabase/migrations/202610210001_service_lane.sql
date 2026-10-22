-- Service lane: requests, fulfilment, announcements, asset work log, cash book.

create extension if not exists "pgcrypto";

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

create or replace function public.department_in_caller_subsidiary(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.departments
    where id = p_department_id
      and subsidiary_id is not null
      and subsidiary_id = public.caller_subsidiary_id()
  );
$$;

create table if not exists public.request_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  needs_fulfilment boolean not null default false,
  is_leave boolean not null default false,
  fulfil_department_code text,
  questions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.request_categories (slug, name, description, needs_fulfilment, is_leave, fulfil_department_code, questions, sort_order)
values
  (
    'leave',
    'Leave',
    'Done once approved. Uses Tanjuriel leave rules.',
    false,
    true,
    null,
    '[
      {"key":"leaveType","label":"Leave type","type":"leave_type","required":true},
      {"key":"startDate","label":"Start date","type":"date","required":true},
      {"key":"endDate","label":"End date","type":"date","required":true},
      {"key":"documentNote","label":"Supporting document note","type":"textarea","required":false}
    ]'::jsonb,
    1
  ),
  (
    'permission',
    'Permission',
    'Done once approved.',
    false,
    false,
    null,
    '[
      {"key":"fromDate","label":"From","type":"date","required":true},
      {"key":"toDate","label":"To","type":"date","required":true},
      {"key":"reason","label":"Reason","type":"textarea","required":true}
    ]'::jsonb,
    2
  ),
  (
    'equipment',
    'Equipment',
    'Approved, then issued or supplied.',
    true,
    false,
    'ICT',
    '[
      {"key":"item","label":"What do you need?","type":"text","required":true},
      {"key":"reason","label":"Why","type":"textarea","required":true},
      {"key":"urgency","label":"Urgency","type":"select","required":true,"options":["Normal","Soon","Urgent"]}
    ]'::jsonb,
    3
  ),
  (
    'maintenance',
    'Maintenance',
    'Approved, then someone carries it out. Writes onto the asset log when linked.',
    true,
    false,
    null,
    '[
      {"key":"assetCode","label":"Asset ID (if known)","type":"text","required":false},
      {"key":"fault","label":"What is wrong?","type":"textarea","required":true},
      {"key":"location","label":"Where","type":"text","required":false}
    ]'::jsonb,
    4
  ),
  (
    'it_support',
    'IT support',
    'Approved, then ICT carries it out.',
    true,
    false,
    'ICT',
    '[
      {"key":"system","label":"System or device","type":"text","required":true},
      {"key":"issue","label":"Issue","type":"textarea","required":true},
      {"key":"urgency","label":"Urgency","type":"select","required":true,"options":["Normal","Soon","Urgent"]}
    ]'::jsonb,
    5
  ),
  (
    'general_office',
    'General office',
    'Approved, then Admin carries it out.',
    true,
    false,
    'ADM',
    '[
      {"key":"what","label":"What do you need?","type":"text","required":true},
      {"key":"details","label":"Details","type":"textarea","required":true}
    ]'::jsonb,
    6
  )
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    needs_fulfilment = excluded.needs_fulfilment,
    is_leave = excluded.is_leave,
    fulfil_department_code = excluded.fulfil_department_code,
    questions = excluded.questions,
    sort_order = excluded.sort_order;

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  category_id uuid not null references public.request_categories(id) on delete restrict,
  status text not null default 'submitted',
  title text not null,
  answers jsonb not null default '{}'::jsonb,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  subsidiary_id uuid references public.subsidiaries(id) on delete set null,
  waiting_on_id uuid references public.profiles(id) on delete set null,
  assigned_to_id uuid references public.profiles(id) on delete set null,
  assigned_department_id uuid references public.departments(id) on delete set null,
  asset_uuid uuid references public.assets(id) on delete set null,
  leave_request_id uuid,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requests_status_check check (
    status in (
      'draft',
      'submitted',
      'under_review',
      'needs_information',
      'approved',
      'in_progress',
      'completed',
      'rejected',
      'cancelled'
    )
  )
);

create index if not exists service_requests_waiting_idx on public.service_requests(waiting_on_id, status);
create index if not exists service_requests_requester_idx on public.service_requests(requester_id, created_at desc);
create index if not exists service_requests_department_idx on public.service_requests(department_id);

create table if not exists public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'corp',
  subsidiary_id uuid references public.subsidiaries(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  is_pinned boolean not null default false,
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint announcements_audience_check check (audience in ('corp', 'subsidiary', 'department'))
);

create table if not exists public.asset_work_log (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  request_id uuid references public.service_requests(id) on delete set null,
  work_date date not null default current_date,
  fault text,
  action text not null,
  parts text,
  cost numeric(14, 2) default 0,
  performed_by uuid references public.profiles(id) on delete set null,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create index if not exists asset_work_log_asset_idx on public.asset_work_log(asset_id, work_date desc);

create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  entry_date date not null default current_date,
  opening_balance numeric(14, 2) not null default 0,
  cash_in numeric(14, 2) not null default 0,
  cash_out numeric(14, 2) not null default 0,
  closing_balance numeric(14, 2) not null default 0,
  source text,
  purpose text,
  receipt_path text,
  entered_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists cash_entries_department_date_idx on public.cash_entries(department_id, entry_date desc);

drop trigger if exists set_request_categories_updated_at on public.request_categories;
create trigger set_request_categories_updated_at
before update on public.request_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_service_requests_updated_at on public.service_requests;
create trigger set_service_requests_updated_at
before update on public.service_requests
for each row execute function public.set_updated_at();

alter table public.request_categories enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_request_events enable row level security;
alter table public.announcements enable row level security;
alter table public.asset_work_log enable row level security;
alter table public.cash_entries enable row level security;

drop policy if exists request_categories_select on public.request_categories;
create policy request_categories_select on public.request_categories
for select to authenticated
using (is_active = true or public.current_profile_role() in ('director_of_administration', 'human_resources', 'chairman'));

drop policy if exists request_categories_write on public.request_categories;
create policy request_categories_write on public.request_categories
for all to authenticated
using (public.current_profile_role() in ('director_of_administration', 'human_resources'))
with check (public.current_profile_role() in ('director_of_administration', 'human_resources'));

drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests
for select to authenticated
using (
  requester_id = auth.uid()
  or waiting_on_id = auth.uid()
  or assigned_to_id = auth.uid()
  or public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'human_resources', 'managing_director')
  or (
    public.current_profile_role() = 'executive_director'
    and (subsidiary_id = public.caller_subsidiary_id() or public.department_in_caller_subsidiary(department_id))
  )
  or (
    public.current_profile_role() in ('manager', 'department_head')
    and department_id = public.current_profile_department_id()
  )
);

drop policy if exists service_requests_insert on public.service_requests;
create policy service_requests_insert on public.service_requests
for insert to authenticated
with check (requester_id = auth.uid());

drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests
for update to authenticated
using (
  requester_id = auth.uid()
  or waiting_on_id = auth.uid()
  or assigned_to_id = auth.uid()
  or public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'human_resources', 'executive_director', 'manager', 'department_head')
)
with check (true);

drop policy if exists service_request_events_select on public.service_request_events;
create policy service_request_events_select on public.service_request_events
for select to authenticated
using (
  exists (
    select 1 from public.service_requests r
    where r.id = service_request_events.request_id
  )
);

drop policy if exists service_request_events_insert on public.service_request_events;
create policy service_request_events_insert on public.service_request_events
for insert to authenticated
with check (actor_id = auth.uid() or public.is_executive() or public.current_profile_role() in ('director_of_administration', 'human_resources', 'executive_director'));

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
for select to authenticated
using (
  is_published = true
  and (
    audience = 'corp'
    or (audience = 'subsidiary' and subsidiary_id = public.caller_subsidiary_id())
    or (audience = 'department' and department_id = public.current_profile_department_id())
    or public.is_executive()
    or public.current_profile_role() in ('director_of_administration', 'executive_director')
  )
);

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements
for all to authenticated
using (public.current_profile_role() in ('chairman', 'general_manager', 'director_of_administration', 'executive_director'))
with check (public.current_profile_role() in ('chairman', 'general_manager', 'director_of_administration', 'executive_director'));

drop policy if exists asset_work_log_select on public.asset_work_log;
create policy asset_work_log_select on public.asset_work_log
for select to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'executive_director')
  or exists (
    select 1 from public.assets a
    where a.id = asset_work_log.asset_id
      and (
        a.department_id = public.current_profile_department_id()
        or public.department_in_caller_subsidiary(a.department_id)
      )
  )
);

drop policy if exists asset_work_log_insert on public.asset_work_log;
create policy asset_work_log_insert on public.asset_work_log
for insert to authenticated
with check (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'executive_director', 'manager', 'department_head')
);

drop policy if exists cash_entries_select on public.cash_entries;
create policy cash_entries_select on public.cash_entries
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

drop policy if exists cash_entries_write on public.cash_entries;
create policy cash_entries_write on public.cash_entries
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

insert into storage.buckets (id, name, public)
values ('cash-receipts', 'cash-receipts', false)
on conflict (id) do nothing;
