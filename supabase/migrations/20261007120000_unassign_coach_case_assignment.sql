create or replace function public.unassign_coach_case_assignment(
  target_case_id uuid,
  target_group_id uuid,
  unassignment_reason text default 'Unassigned by administrator'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_couple_group_id uuid;
  target_assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only an Admin or Super Admin may unassign Coach cases';
  end if;

  select counseling_case.couple_group_id
  into target_couple_group_id
  from public.counseling_cases counseling_case
  where counseling_case.id = target_case_id
  for update;

  if target_couple_group_id is null or not exists (
    select 1
    from public.groups coach_team
    join public.counseling_cases counseling_case
      on counseling_case.id = target_case_id
     and counseling_case.campus_id = coach_team.campus_id
    where coach_team.id = target_group_id
      and coach_team.group_type = 'coach_team'
  ) then
    return false;
  end if;

  select assignment.id
  into target_assignment_id
  from public.case_assignments assignment
  where assignment.counseling_case_id = target_case_id
    and assignment.assigned_group_id = target_group_id
    and assignment.assignment_type = 'coach'
    and assignment.ended_at is null
  for update;

  if target_assignment_id is null then
    return false;
  end if;

  update public.case_assignments
  set ended_at = now(),
      end_reason = coalesce(nullif(btrim(unassignment_reason), ''), 'Unassigned by administrator')
  where id = target_assignment_id
    and ended_at is null;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (
    actor,
    'case.unassigned',
    'counseling_case',
    target_case_id,
    jsonb_build_object(
      'assignment_id', target_assignment_id,
      'assignment_type', 'coach',
      'couple_group_id', target_couple_group_id,
      'prior_group_id', target_group_id
    )
  );

  return true;
end;
$$;

revoke execute on function public.unassign_coach_case_assignment(uuid, uuid, text) from public, anon;
grant execute on function public.unassign_coach_case_assignment(uuid, uuid, text) to authenticated;
