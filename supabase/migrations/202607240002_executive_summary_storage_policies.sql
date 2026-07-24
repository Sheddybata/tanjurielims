-- Storage policies for archived executive summary PDFs

insert into storage.buckets (id, name, public)
values ('executive-summaries', 'executive-summaries', false)
on conflict (id) do nothing;

drop policy if exists executive_summaries_storage_select on storage.objects;
create policy executive_summaries_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'executive-summaries'
  and public.current_profile_role() in ('chairman', 'general_manager')
);

drop policy if exists executive_summaries_storage_insert on storage.objects;
create policy executive_summaries_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'executive-summaries'
  and public.current_profile_role() = 'chairman'
);
