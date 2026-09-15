create or replace function public.delete_disposable_team_graph(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group public.groups%rowtype;
  member_ids uuid[];
  invitation_ids uuid[];
  invitation_auth_ids uuid[];
begin
  select * into target_group
  from public.groups
  where id = target_group_id
    and group_type in ('couple', 'coach_team', 'counselor_team', 'campus_lead_team')
  for update;
  if not found then raise exception 'Team not found'; end if;

  select coalesce(array_agg(profile_id), '{}'::uuid[]) into member_ids
  from public.group_members
  where group_id = target_group_id and ended_at is null;
  select coalesce(array_agg(id), '{}'::uuid[]), coalesce(array_agg(auth_user_id) filter (where auth_user_id is not null), '{}'::uuid[])
    into invitation_ids, invitation_auth_ids
  from public.invitations where group_id = target_group_id;

  if exists (select 1 from public.intake_requests where invited_group_id = target_group_id) then
    raise exception 'team_delete_blocker:intake_request_history';
  end if;
  if exists (select 1 from public.counseling_cases where couple_group_id = target_group_id) then
    raise exception 'team_delete_blocker:counseling_case_history';
  end if;
  if exists (select 1 from public.case_assignments where assigned_group_id = target_group_id) then
    raise exception 'team_delete_blocker:counselor_assignment_history';
  end if;
  if exists (select 1 from public.supervision_assignments where coach_group_id = target_group_id or counselor_group_id = target_group_id) then
    raise exception 'team_delete_blocker:active_supervision_relationship';
  end if;
  if exists (select 1 from public.campus_lead_coach_assignments where campus_lead_group_id = target_group_id or coach_group_id = target_group_id) then
    raise exception 'team_delete_blocker:campus_lead_operational_assignment';
  end if;
  if exists (select 1 from public.group_members where profile_id = any(member_ids) and group_id <> target_group_id and ended_at is null) then
    raise exception 'team_delete_blocker:member_in_another_active_team';
  end if;
  if exists (select 1 from public.counseling_cases where created_by = any(member_ids))
    or exists (select 1 from public.case_assignments where assigned_by = any(member_ids) or assigned_profile_id = any(member_ids)) then
    raise exception 'team_delete_blocker:member_ministry_history';
  end if;
  if exists (select 1 from public.assessment_documents where profile_id = any(member_ids) or uploaded_by = any(member_ids)) then
    raise exception 'team_delete_blocker:assessment_documents';
  end if;
  if exists (select 1 from public.invitations where invited_by = any(member_ids) and group_id is distinct from target_group_id) then
    raise exception 'team_delete_blocker:shared_or_non_owned_invitation';
  end if;

  delete from public.audit_events where entity_type = 'invitation' and entity_id = any(invitation_ids);
  delete from public.invitations where id = any(invitation_ids);
  delete from public.campus_lead_assignments where profile_id = any(member_ids);
  delete from public.group_members where group_id = target_group_id;
  delete from public.groups where id = target_group_id;

  return jsonb_build_object('profile_ids', member_ids, 'auth_user_ids', array(select distinct id from unnest(member_ids || invitation_auth_ids) id));
end;
$$;

revoke all on function public.delete_disposable_team_graph(uuid) from public, anon, authenticated;
grant execute on function public.delete_disposable_team_graph(uuid) to service_role;
