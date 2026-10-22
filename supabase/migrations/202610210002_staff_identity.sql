-- Government ID and bank account are optional on apply, so the staff
-- register must accept the same blanks. Duplicates stay visible to DoA/HR
-- instead of failing the insert with a unique constraint.

alter table public.staff
  alter column government_id_number drop not null;

alter table public.staff
  alter column bank_account drop not null;

alter table public.staff
  alter column nin drop not null;

alter table public.staff
  drop constraint if exists staff_government_id_number_key;

alter table public.staff
  drop constraint if exists staff_nin_key;

drop index if exists staff_government_id_number_key;
drop index if exists staff_nin_key;
drop index if exists staff_government_id_number_idx;
drop index if exists staff_nin_idx;

alter table public.staff
  alter column sex drop not null;

alter table public.staff
  drop constraint if exists staff_sex_check;

alter table public.staff
  add constraint staff_sex_check
  check (sex is null or sex in ('Female', 'Male', 'Other'));
