-- The Director of Administration and the Managing Director can read every daily report.
-- Run after the earlier October migrations.

drop policy if exists daily_reports_select_by_role on public.daily_reports;
create policy daily_reports_select_by_role on public.daily_reports
for select to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'managing_director')
  or department_id = public.current_profile_department_id()
);
