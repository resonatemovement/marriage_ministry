create or replace function public.cleanup_verifier_relationship_artifacts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare group_ids uuid[]; case_ids uuid[]; campus_lead_counselor_ids uuid[]; campus_lead_coach_ids uuid[]; supervision_ids uuid[]; lead_coach_count integer; supervision_count integer; assignment_count integer; case_history_count integer; case_count integer; campus_lead_counselor_count integer; audit_count integer;
begin
  select coalesce(array_agg(distinct id), '{}'::uuid[]) into group_ids
  from public.groups
  where name like 'verify-cross-campus-counseling-%'
    or name like 'verify-campus-lead-coach-campus-%'
    or name like 'verify-campus-lead-counselor-%'
    or name ~ '^verify-campus-lead-[0-9]+([[:space:]-]|$)'
    or id in (
      select group_id from public.invitations
      where group_id is not null and email ~ '^verify-campus-lead-[0-9]+-.*@example[.]test$'
    );
  select coalesce(array_agg(id), '{}'::uuid[]) into case_ids from public.counseling_cases where couple_group_id = any(group_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into campus_lead_counselor_ids from public.campus_lead_counselor_assignments where campus_lead_group_id = any(group_ids) or counselor_group_id = any(group_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into campus_lead_coach_ids from public.campus_lead_coach_assignments where campus_lead_group_id = any(group_ids) or coach_group_id = any(group_ids);
  select coalesce(array_agg(id), '{}'::uuid[]) into supervision_ids from public.supervision_assignments where coach_group_id = any(group_ids) or counselor_group_id = any(group_ids);
  delete from public.audit_events where (entity_type = 'campus_lead_counselor_assignment' and entity_id = any(campus_lead_counselor_ids)) or (entity_type = 'campus_lead_coach_assignment' and entity_id = any(campus_lead_coach_ids)) or (entity_type = 'supervision_assignment' and entity_id = any(supervision_ids)) or (entity_type = 'counseling_case' and entity_id = any(case_ids)); get diagnostics audit_count = row_count;
  delete from public.campus_lead_counselor_assignments where id = any(campus_lead_counselor_ids); get diagnostics campus_lead_counselor_count = row_count;
  delete from public.campus_lead_coach_assignments where id = any(campus_lead_coach_ids); get diagnostics lead_coach_count = row_count;
  delete from public.supervision_assignments where id = any(supervision_ids); get diagnostics supervision_count = row_count;
  delete from public.case_assignments where counseling_case_id = any(case_ids) or assigned_group_id = any(group_ids); get diagnostics assignment_count = row_count;
  delete from public.case_status_history where counseling_case_id = any(case_ids); get diagnostics case_history_count = row_count;
  delete from public.counseling_cases where id = any(case_ids); get diagnostics case_count = row_count;
  return jsonb_build_object('audit_events', audit_count, 'campus_lead_counselor_assignments', campus_lead_counselor_count, 'campus_lead_coach_assignments', lead_coach_count, 'supervision_assignments', supervision_count, 'case_assignments', assignment_count, 'case_status_history', case_history_count, 'counseling_cases', case_count);
end;
$$;
revoke all on function public.cleanup_verifier_relationship_artifacts() from public, anon, authenticated;
grant execute on function public.cleanup_verifier_relationship_artifacts() to service_role;
