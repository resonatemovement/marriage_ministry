create or replace function public.unassign_campus_lead_coach(
  target_campus_lead_group_id uuid,
  target_coach_group_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only an Admin or Super Admin may unassign Campus Lead Coaches';
  end if;

  perform 1 from public.groups where id = target_campus_lead_group_id for update;
  if not found then return false; end if;

  select id into assignment_id
  from public.campus_lead_coach_assignments
  where campus_lead_group_id = target_campus_lead_group_id
    and coach_group_id = target_coach_group_id
    and ended_at is null
  for update;
  if assignment_id is null then return false; end if;

  update public.campus_lead_coach_assignments set ended_at = now() where id = assignment_id;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'campus_lead_coach.unassigned', 'campus_lead_coach_assignment', assignment_id, jsonb_build_object('campus_lead_group_id', target_campus_lead_group_id, 'coach_group_id', target_coach_group_id));
  return true;
end;
$$;

create or replace function public.unassign_counselor_coach_supervision(
  target_counselor_group_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_assignment public.supervision_assignments%rowtype;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only an Admin or Super Admin may unassign Counselor supervision';
  end if;

  perform 1 from public.groups where id = target_counselor_group_id for update;
  if not found then return false; end if;

  select * into current_assignment
  from public.supervision_assignments
  where counselor_group_id = target_counselor_group_id and ended_at is null
  for update;
  if not found then return false; end if;

  update public.supervision_assignments set ended_at = now() where id = current_assignment.id;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'supervision.unassigned', 'supervision_assignment', current_assignment.id, jsonb_build_object('counselor_group_id', target_counselor_group_id, 'coach_group_id', current_assignment.coach_group_id));
  return true;
end;
$$;

revoke execute on function public.unassign_campus_lead_coach(uuid, uuid) from public, anon;
grant execute on function public.unassign_campus_lead_coach(uuid, uuid) to authenticated;
revoke execute on function public.unassign_counselor_coach_supervision(uuid) from public, anon;
grant execute on function public.unassign_counselor_coach_supervision(uuid) to authenticated;
