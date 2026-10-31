-- Remember which F16 enroll number is which Construction staff member.

create table if not exists public.attendance_pin_map (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  device_pin text not null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  person_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_pin_map_unique unique (department_id, device_pin)
);

create index if not exists attendance_pin_map_staff_idx
  on public.attendance_pin_map (staff_id);

drop trigger if exists set_attendance_pin_map_updated_at on public.attendance_pin_map;
create trigger set_attendance_pin_map_updated_at
before update on public.attendance_pin_map
for each row execute function public.set_updated_at();

alter table public.attendance_pin_map enable row level security;
