-- Give Executive Directors read access to everything in their subsidiary.

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

drop policy if exists daily_reports_select_by_role on public.daily_reports;
create policy daily_reports_select_by_role on public.daily_reports
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

drop policy if exists equipment_status_select_by_report_access on public.daily_report_equipment_status;
create policy equipment_status_select_by_report_access on public.daily_report_equipment_status
for select to authenticated
using (
  exists (
    select 1 from public.daily_reports report
    where report.id = report_id
      and (
        public.is_executive()
        or public.current_profile_role() in ('director_of_administration', 'managing_director')
        or report.department_id = public.current_profile_department_id()
        or (
          public.current_profile_role() = 'executive_director'
          and public.department_in_caller_subsidiary(report.department_id)
        )
      )
  )
);

drop policy if exists approval_actions_select_by_role on public.approval_actions;
create policy approval_actions_select_by_role on public.approval_actions
for select to authenticated
using (
  public.is_executive()
  or public.current_profile_role() in ('director_of_administration', 'managing_director')
  or exists (
    select 1 from public.daily_reports report
    where report.id = report_id
      and (
        report.department_id = public.current_profile_department_id()
        or (
          public.current_profile_role() = 'executive_director'
          and public.department_in_caller_subsidiary(report.department_id)
        )
      )
  )
);

drop policy if exists assets_select_by_role on public.assets;
create policy assets_select_by_role on public.assets
for select to authenticated
using (
  public.is_executive()
  or department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(department_id)
  )
);

drop policy if exists marketing_leads_select_by_role on public.marketing_leads;
create policy marketing_leads_select_by_role on public.marketing_leads
for select to authenticated
using (
  public.current_profile_role() in ('chairman', 'general_manager', 'marketing_officer')
  or assigned_department_id = public.current_profile_department_id()
  or (
    public.current_profile_role() = 'executive_director'
    and public.department_in_caller_subsidiary(assigned_department_id)
  )
);

-- Executive Directors can approve/return reports inside their subsidiary.
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
