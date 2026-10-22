-- Daily-report pulse: where collections sat, if any.
-- Each department banks with its Executive Director. This is not the BIF cash book.

alter table public.daily_reports
  add column if not exists funds_destination text;

alter table public.daily_reports
  drop constraint if exists daily_reports_funds_destination_check;

alter table public.daily_reports
  add constraint daily_reports_funds_destination_check
  check (
    funds_destination is null
    or funds_destination in ('department_account', 'held_at_desk')
  );
