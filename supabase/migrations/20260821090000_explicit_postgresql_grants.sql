-- RLS policies remain the authorization boundary for authenticated application users.
-- These grants supply the separate PostgreSQL privileges required by PostgREST.

grant usage on schema public to service_role, authenticated;

grant select, insert, update, delete on table
  public.campuses,
  public.profiles,
  public.profile_roles,
  public.groups,
  public.group_members,
  public.counseling_cases
to service_role;

grant select on table public.case_assignments to service_role;

grant select on table
  public.campuses,
  public.profiles,
  public.profile_roles,
  public.groups,
  public.group_members,
  public.counseling_cases,
  public.case_assignments,
  public.case_status_history,
  public.supervision_assignments,
  public.assessment_documents,
  public.audit_events
to authenticated;

grant insert, update, delete on table
  public.campuses,
  public.profiles,
  public.profile_roles,
  public.groups,
  public.group_members,
  public.counseling_cases,
  public.supervision_assignments,
  public.assessment_documents
to authenticated;

-- The RPC remains unavailable to anon and enforces Admin/Super Admin internally.
revoke execute on function public.assign_counseling_case(uuid, uuid, public.case_assignment_type, text) from anon;
grant execute on function public.assign_counseling_case(uuid, uuid, public.case_assignment_type, text) to authenticated;
