-- The Sessions workspace's care-team predicate includes campus-scoped Campus Leads.
-- Use it for Counselor Version documents instead of the legacy assignment-only predicate.
drop policy assessment_documents_read_by_slot on public.assessment_documents;
create policy assessment_documents_read_by_slot on public.assessment_documents for select to authenticated
using (
  (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
  or (
    document_slot = 'counselor'
    and (select private.current_user_has_role(array['campus_lead', 'coach', 'counselor']::public.app_role[]))
    and (select private.current_user_can_manage_counseling_case(counseling_case_id))
  )
);

drop policy assessment_storage_read_by_slot on storage.objects;
create policy assessment_storage_read_by_slot on storage.objects for select to authenticated
using (
  bucket_id = 'assessment-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
    or (
      (storage.foldername(name))[2] = 'counselor'
      and (select private.current_user_has_role(array['campus_lead', 'coach', 'counselor']::public.app_role[]))
      and (select private.current_user_can_manage_counseling_case(((storage.foldername(name))[1])::uuid))
    )
  )
);
