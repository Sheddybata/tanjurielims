-- USB attendance from the Jalingo Hippoint F16. Admin uploads the Glog/TXT from the stick.

create table if not exists public.attendance_imports (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  project_id uuid references public.construction_projects(id) on delete set null,
  file_name text not null,
  source text not null default 'usb_f16',
  row_count integer not null default 0,
  matched_count integer not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_punches (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.attendance_imports(id) on delete set null,
  department_id uuid not null references public.departments(id) on delete restrict,
  project_id uuid references public.construction_projects(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  device_pin text not null,
  device_name text,
  person_name text,
  punched_at timestamptz not null,
  punch_type text not null default 'unknown',
  raw_line text,
  created_at timestamptz not null default now(),
  constraint attendance_punches_type_check check (punch_type in ('in', 'out', 'unknown')),
  constraint attendance_punches_unique unique (department_id, device_pin, punched_at)
);

create index if not exists attendance_punches_dept_time_idx
  on public.attendance_punches (department_id, punched_at desc);
create index if not exists attendance_punches_staff_time_idx
  on public.attendance_punches (staff_id, punched_at desc);

alter table public.attendance_imports enable row level security;
alter table public.attendance_punches enable row level security;
