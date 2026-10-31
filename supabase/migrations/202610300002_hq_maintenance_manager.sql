-- Ameke Elijah Kalu is Maintenance Manager at Head office, not Construction / Jalingo.

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

update public.staff
set
  department_id = (select id from public.departments where code = 'HDO' limit 1),
  job_title = 'Maintenance Manager',
  profile_id = coalesce(staff.profile_id, (select id from public.profiles where full_name = 'Ameke Elijah Kalu' limit 1))
where id = '617b9dec-a5de-4215-8b7a-f5296fdda22f'
   or (full_name = 'Ameke Elijah Kalu' and staff_number = 'TAN/EMP/CST/2026/001');

update public.profiles
set department_id = (select id from public.departments where code = 'HDO' limit 1)
where id = 'cb7019ed-1829-4044-9e4d-be162df63339'
   or full_name = 'Ameke Elijah Kalu';

update public.construction_crew crew
set left_on = current_date
where crew.left_on is null
  and crew.staff_id in (
    select id from public.staff
    where full_name = 'Ameke Elijah Kalu'
  );
