-- Run this file on its own, then run 202610010002_staff_register.sql.
-- New enum values cannot be used in the same transaction that adds them.

alter type public.ims_role add value if not exists 'managing_director';
alter type public.ims_role add value if not exists 'executive_director';
alter type public.ims_role add value if not exists 'director_of_administration';
alter type public.ims_role add value if not exists 'human_resources';
alter type public.ims_role add value if not exists 'manager';
