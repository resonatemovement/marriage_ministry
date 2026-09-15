create or replace function public.cleanup_intake_permanent_delete_verifier_artifacts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  verifier_group_ids uuid[];
  verifier_case_ids uuid[];
  document_count integer;
  history_count integer;
  audit_count integer;
  case_count integer;
begin
  select coalesce(array_agg(id), '{}'::uuid[])
    into verifier_group_ids
  from public.groups
  where name ~ '^verify-intake-permanent-delete-[0-9]+([[:space:]-]|$)';

  select coalesce(array_agg(id), '{}'::uuid[])
    into verifier_case_ids
  from public.counseling_cases
  where couple_group_id = any(verifier_group_ids);

  delete from public.assessment_documents
  where counseling_case_id = any(verifier_case_ids);
  get diagnostics document_count = row_count;

  delete from public.case_status_history
  where counseling_case_id = any(verifier_case_ids);
  get diagnostics history_count = row_count;

  delete from public.audit_events
  where entity_type = 'counseling_case'
    and entity_id = any(verifier_case_ids);
  get diagnostics audit_count = row_count;

  delete from public.counseling_cases
  where id = any(verifier_case_ids);
  get diagnostics case_count = row_count;

  return jsonb_build_object(
    'assessment_documents', document_count,
    'case_status_history', history_count,
    'audit_events', audit_count,
    'counseling_cases', case_count
  );
end;
$$;

revoke all on function public.cleanup_intake_permanent_delete_verifier_artifacts() from public, anon, authenticated;
grant execute on function public.cleanup_intake_permanent_delete_verifier_artifacts() to service_role;
