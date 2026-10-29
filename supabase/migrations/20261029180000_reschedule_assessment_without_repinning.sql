-- Move the Case Session/gate without changing a schedule's immutable version
-- or deleting participant assignments, attempts, responses, or result history.
create function public.reschedule_case_assessment_schedule(
  target_case_id uuid,
  target_assessment_id uuid,
  target_session_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  schedule_id uuid;
  active_case_session_id uuid;
begin
  if actor is null or not private.assessment_can_manage_case(target_case_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from public.sessions where id = target_session_id and status = 'published') then
    raise exception 'Select a published Session';
  end if;

  select id into schedule_id
  from public.assessment_case_schedules
  where counseling_case_id = target_case_id and assessment_id = target_assessment_id
  for update;
  if schedule_id is null then raise exception 'Assessment schedule is unavailable'; end if;

  select id into active_case_session_id
  from public.case_sessions
  where counseling_case_id = target_case_id and session_id = target_session_id and status = 'active';
  if active_case_session_id is null and exists (
    select 1 from public.case_sessions
    where counseling_case_id = target_case_id and session_id = target_session_id and status = 'completed'
  ) then raise exception 'Assessment cannot be assigned to a completed Session'; end if;

  insert into public.assessment_case_overrides(assessment_id, counseling_case_id, session_id, configured_by)
  values(target_assessment_id, target_case_id, target_session_id, actor)
  on conflict (assessment_id, counseling_case_id) do update
    set session_id = excluded.session_id, configured_by = excluded.configured_by, configured_at = now();

  update public.assessment_case_schedules
  set session_id = target_session_id,
      progression_case_session_id = active_case_session_id,
      schedule_source = 'case_override',
      configured_by = actor,
      updated_at = now()
  where id = schedule_id;

  if active_case_session_id is not null then
    perform private.activate_case_assessment_schedule(schedule_id, active_case_session_id, actor);
  end if;
  return schedule_id;
end;
$$;

revoke all on function public.reschedule_case_assessment_schedule(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reschedule_case_assessment_schedule(uuid, uuid, uuid) to authenticated;
comment on function public.reschedule_case_assessment_schedule(uuid, uuid, uuid) is
  'Changes an authorized Case schedule Session while retaining its pinned Assessment version, participant assignments, attempts, responses, and score history.';
