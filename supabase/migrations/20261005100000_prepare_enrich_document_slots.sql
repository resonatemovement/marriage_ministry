-- Prepare & Enrich documents are case-scoped, with one current document per slot.
alter table public.assessment_documents
  add column document_slot text;

-- The pre-existing table was not surfaced in the application. Keep any legacy row
-- as a Counselor Version rather than discarding data during this narrow migration.
update public.assessment_documents
set document_slot = 'counselor'
where document_slot is null;

alter table public.assessment_documents
  alter column document_slot set not null,
  add constraint assessment_documents_slot_check
    check (document_slot in ('counselor', 'couple'));

create unique index assessment_documents_one_slot_per_case_idx
  on public.assessment_documents (counseling_case_id, document_slot);

drop policy assessment_documents_read_authorized on public.assessment_documents;
create policy assessment_documents_read_by_slot on public.assessment_documents for select to authenticated
using (
  (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
  or (
    document_slot = 'counselor'
    and (select private.current_user_has_role(array['campus_lead', 'coach', 'counselor']::public.app_role[]))
    and (select private.current_user_can_access_case(counseling_case_id))
  )
);

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'assessment-documents';

drop policy assessment_storage_read_authorized on storage.objects;
create policy assessment_storage_read_by_slot on storage.objects for select to authenticated
using (
  bucket_id = 'assessment-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
    or (
      (storage.foldername(name))[2] = 'counselor'
      and (select private.current_user_has_role(array['campus_lead', 'coach', 'counselor']::public.app_role[]))
      and (select private.current_user_can_access_case(((storage.foldername(name))[1])::uuid))
    )
  )
);
