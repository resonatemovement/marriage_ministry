drop function public.cleanup_intake_permanent_delete_verifier_artifacts();

create function public.cleanup_intake_permanent_delete_verifier_artifacts(target_group_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  verifier_case_ids uuid[];
  document_count integer;
  history_count integer;
  audit_count integer;
  case_count integer;
begin
  if exists (
    select 1
    from public.groups
    where id = any(target_group_ids)
      and name !~ '^verify-intake-permanent-delete-[0-9]+([[:space:]-]|$)'
  ) then
    raise exception 'Verifier cleanup accepts only Intake permanent-delete verifier groups';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
    into verifier_case_ids
  from public.counseling_cases
  where couple_group_id = any(target_group_ids);

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

revoke all on function public.cleanup_intake_permanent_delete_verifier_artifacts(uuid[]) from public, anon, authenticated;
grant execute on function public.cleanup_intake_permanent_delete_verifier_artifacts(uuid[]) to service_role;
