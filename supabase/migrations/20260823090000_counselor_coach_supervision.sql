-- A Counselor team may have one current Coach while prior assignments remain historical.
create unique index supervision_assignments_one_active_counselor_idx
  on public.supervision_assignments (counselor_group_id)
  where ended_at is null;

create function public.assign_counselor_coach_supervision(
  target_counselor_group_id uuid,
  target_coach_group_id uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  current_assignment public.supervision_assignments%rowtype;
  new_assignment_id uuid;
begin
  if not (select private.current_user_has_role(
    array['super_admin', 'admin']::public.app_role[]
  )) then
    raise exception 'Only an Admin or Super Admin may assign Counselor supervision';
  end if;

  if target_counselor_group_id = target_coach_group_id then
    raise exception 'A Counselor team cannot be supervised by itself';
  end if;

  -- Lock the Counselor group to serialize assignments when no active row exists yet.
  perform 1
  from public.groups
  where id = target_counselor_group_id
    and group_type = 'counselor_team'
    and active
  for update;
  if not found then
    raise exception 'Active Counselor team not found';
  end if;

  perform 1
  from public.groups
  where id = target_coach_group_id
    and group_type = 'coach_team'
    and active;
  if not found then
    raise exception 'Active Coach team not found';
  end if;

  select *
  into current_assignment
  from public.supervision_assignments
  where counselor_group_id = target_counselor_group_id
    and ended_at is null
  for update;

  if found and current_assignment.coach_group_id = target_coach_group_id then
    return current_assignment.id;
  end if;

  if found then
    update public.supervision_assignments
    set ended_at = now()
    where id = current_assignment.id;
  end if;

  insert into public.supervision_assignments (
    coach_group_id,
    counselor_group_id,
    assigned_by
  ) values (
    target_coach_group_id,
    target_counselor_group_id,
    current_actor
  ) returning id into new_assignment_id;

  insert into public.audit_events (
    actor_id,
    event_type,
    entity_type,
    entity_id,
    details
  ) values (
    current_actor,
    'supervision.assigned',
    'supervision_assignment',
    new_assignment_id,
    jsonb_build_object(
      'counselor_group_id', target_counselor_group_id,
      'previous_coach_group_id', current_assignment.coach_group_id,
      'coach_group_id', target_coach_group_id
    )
  );

  return new_assignment_id;
end;
$$;

revoke execute on function public.assign_counselor_coach_supervision(uuid, uuid)
from public, anon;
grant execute on function public.assign_counselor_coach_supervision(uuid, uuid)
to authenticated;
