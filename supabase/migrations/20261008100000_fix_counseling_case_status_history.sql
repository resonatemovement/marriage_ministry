create or replace function public.schedule_case_session_meeting(
  target_case_id uuid, target_session_id uuid, target_starts_at timestamptz, target_ends_at timestamptz, target_location text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); meeting_id uuid; current_session_id uuid; current_sequence integer; next_session_id uuid; prior_status public.case_status;
begin
  if not private.current_user_can_manage_counseling_case(target_case_id) then raise exception 'Not authorized'; end if;
  if target_ends_at <= target_starts_at or btrim(coalesce(target_location, '')) = '' then raise exception 'Enter a valid meeting time and location'; end if;
  select status into prior_status from public.counseling_cases where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select id into meeting_id from public.case_session_meetings where counseling_case_id = target_case_id and session_id is not distinct from target_session_id for update;
  if meeting_id is not null then
    update public.case_session_meetings set starts_at = target_starts_at, ends_at = target_ends_at, location = btrim(target_location), scheduled_by = actor where id = meeting_id;
    return meeting_id;
  end if;
  if target_session_id is null then
    insert into public.case_session_meetings(counseling_case_id, session_id, starts_at, ends_at, location, scheduled_by)
    values(target_case_id, null, target_starts_at, target_ends_at, btrim(target_location), actor) returning id into meeting_id;
    return meeting_id;
  end if;

  select m.session_id, s.sequence_number into current_session_id, current_sequence
  from public.case_session_meetings m join public.sessions s on s.id = m.session_id
  where m.counseling_case_id = target_case_id and m.session_id is not null order by s.sequence_number desc limit 1 for update;
  if current_session_id is not null and not private.case_session_homework_complete(target_case_id, current_session_id) then raise exception 'Complete the current Session Homework before scheduling the next meeting'; end if;
  select id into next_session_id from public.sessions where status = 'published' and sequence_number > coalesce(current_sequence, -1) order by sequence_number limit 1;
  if next_session_id is null or next_session_id <> target_session_id then raise exception 'Meetings must be scheduled in Session order'; end if;
  perform private.activate_case_session_homework(target_case_id, target_session_id, actor);
  insert into public.case_session_meetings(counseling_case_id, session_id, starts_at, ends_at, location, scheduled_by)
  values(target_case_id, target_session_id, target_starts_at, target_ends_at, btrim(target_location), actor) returning id into meeting_id;
  update public.counseling_cases set status = case when status in ('requested', 'assessment', 'interviewed', 'matched') then 'active' else status end where id = target_case_id;
  if prior_status in ('requested', 'assessment', 'interviewed', 'matched') then
    insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason)
    values (target_case_id, prior_status, 'active', actor, 'Session meeting scheduled');
  end if;
  return meeting_id;
end;
$$;
