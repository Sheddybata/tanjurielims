-- Managers file daily reports for their own department, same as unit heads.
-- Needed for Construction desks (Project Manager, Supervisor, Admin, Finance and Procurement).

drop policy if exists daily_reports_insert_by_department_head on public.daily_reports;
create policy daily_reports_insert_by_department_head on public.daily_reports
for insert to authenticated
with check (
  public.current_profile_role() in ('department_head', 'manager')
  and department_id = public.current_profile_department_id()
  and status in ('draft', 'pending_chairman_review')
);
