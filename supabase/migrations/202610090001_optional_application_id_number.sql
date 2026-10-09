-- Make application ID number optional (form no longer collects it).
alter table public.staff_applications
  alter column government_id_number drop not null;
