-- If 202610140001 was already applied, run this to add ED approve/return rights.

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
  or (
    public.current_profile_role() = 'manager'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'returned')
  )
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
)
with check (
  public.is_executive()
  or (
    public.current_profile_role() = 'department_head'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'pending_chairman_review')
  )
  or (
    public.current_profile_role() = 'manager'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'pending_chairman_review')
  )
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
    and status in ('approved', 'returned', 'pending_chairman_review')
  )
);

drop policy if exists approval_actions_insert_by_executive on public.approval_actions;
create policy approval_actions_insert_by_executive on public.approval_actions
for insert to authenticated
with check (
  public.is_executive()
  or (
    public.current_profile_role() = 'executive_director'
    and exists (
      select 1
      from public.daily_reports report
      where report.id = report_id
        and public.department_in_caller_subsidiary(report.department_id)
    )
  )
);
