-- Managers and unit heads register assets for their own department.

drop policy if exists assets_write_by_role on public.assets;
create policy assets_write_by_role on public.assets
for all to authenticated
using (
  (
    public.current_profile_role() in ('manager', 'department_head')
    and department_id = public.current_profile_department_id()
  )
  or public.is_executive()
)
with check (
  (
    public.current_profile_role() in ('manager', 'department_head')
    and department_id = public.current_profile_department_id()
  )
  or public.is_executive()
);
