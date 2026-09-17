create or replace function public.cleanup_verifier_relationship_artifacts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare group_ids uuid[]; case_ids uuid[]; lead_coach_count integer; supervision_count integer; assignment_count integer; case_history_count integer; case_count integer; campus_lead_counselor_count integer;
begin
  select coalesce(array_agg(distinct id), '{}'::uuid[]) into group_ids
  from public.groups
  where name like 'verify-cross-campus-counseling-%'
    or name like 'verify-campus-lead-coach-campus-%'
    or name like 'verify-campus-lead-counselor-%'
    or name ~ '^verify-campus-lead-[0-9]+([[:space:]-]|$)'
    or id in (
      select group_id
      from public.invitations
      where group_id is not null
        and email ~ '^verify-campus-lead-[0-9]+-.*@example[.]test$'
    );
  select coalesce(array_agg(id), '{}'::uuid[]) into case_ids from public.counseling_cases where couple_group_id = any(group_ids);
  delete from public.campus_lead_counselor_assignments where campus_lead_group_id = any(group_ids) or counselor_group_id = any(group_ids); get diagnostics campus_lead_counselor_count = row_count;
  delete from public.campus_lead_coach_assignments where campus_lead_group_id = any(group_ids) or coach_group_id = any(group_ids); get diagnostics lead_coach_count = row_count;
  delete from public.supervision_assignments where coach_group_id = any(group_ids) or counselor_group_id = any(group_ids); get diagnostics supervision_count = row_count;
  delete from public.case_assignments where counseling_case_id = any(case_ids) or assigned_group_id = any(group_ids); get diagnostics assignment_count = row_count;
  delete from public.case_status_history where counseling_case_id = any(case_ids); get diagnostics case_history_count = row_count;
  delete from public.audit_events where entity_type = 'counseling_case' and entity_id = any(case_ids);
  delete from public.counseling_cases where id = any(case_ids); get diagnostics case_count = row_count;
  return jsonb_build_object('campus_lead_counselor_assignments', campus_lead_counselor_count, 'campus_lead_coach_assignments', lead_coach_count, 'supervision_assignments', supervision_count, 'case_assignments', assignment_count, 'case_status_history', case_history_count, 'counseling_cases', case_count);
end;
$$;
revoke all on function public.cleanup_verifier_relationship_artifacts() from public, anon, authenticated;
grant execute on function public.cleanup_verifier_relationship_artifacts() to service_role;
