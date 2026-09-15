create or replace function public.unassign_counseling_case(
  target_couple_group_id uuid,
  unassignment_reason text default 'Unassigned by administrator'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_case_id uuid;
  prior_group_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only an Admin or Super Admin may unassign counseling cases';
  end if;

  select id into target_case_id
  from public.counseling_cases
  where couple_group_id = target_couple_group_id
  for update;

  if target_case_id is null then
    return false;
  end if;

  update public.case_assignments
  set ended_at = now(),
      end_reason = coalesce(nullif(btrim(unassignment_reason), ''), 'Unassigned by administrator')
  where counseling_case_id = target_case_id
    and assignment_type = 'counselor'
    and ended_at is null
  returning assigned_group_id into prior_group_id;

  if prior_group_id is null then
    return false;
  end if;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (
    actor,
    'case.unassigned',
    'counseling_case',
    target_case_id,
    jsonb_build_object(
      'assignment_type', 'counselor',
      'couple_group_id', target_couple_group_id,
      'prior_group_id', prior_group_id
    )
  );

  return true;
end;
$$;

revoke execute on function public.unassign_counseling_case(uuid, text) from public, anon;
grant execute on function public.unassign_counseling_case(uuid, text) to authenticated;
