create or replace function public.schedule_followup_case_session_meeting(
  target_case_session_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  target_case_id uuid;
  current_session public.case_sessions%rowtype;
  current_meeting public.case_session_meetings%rowtype;
  new_meeting_id uuid;
begin
  select counseling_case_id into target_case_id
  from public.case_sessions where id = target_case_session_id;
  if target_case_id is null or not private.current_user_can_manage_counseling_case(target_case_id) then
    raise exception 'Not authorized';
  end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;

  perform 1 from public.counseling_cases
  where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select * into current_session from public.case_sessions
  where id = target_case_session_id and counseling_case_id = target_case_id and status = 'active'
  for update;
  if not found then raise exception 'The Couple Session is no longer active'; end if;

  select * into current_meeting from public.case_session_meetings
  where case_session_id = target_case_session_id and session_id = current_session.session_id
  order by created_at desc, id desc limit 1 for update;
  if not found then raise exception 'The active Session has no Meeting to follow up'; end if;

  if current_meeting.completed_at is null then
    update public.case_session_meetings
    set completed_at = transition_at, completed_by = actor
    where id = current_meeting.id;
  end if;

  insert into public.case_session_meetings(
    counseling_case_id, session_id, case_session_id, starts_at, ends_at, location, scheduled_by
  ) values (
    target_case_id, current_session.session_id, target_case_session_id,
    target_starts_at, target_ends_at, 'In person', actor
  ) returning id into new_meeting_id;

  return new_meeting_id;
end;
$$;

create or replace function public.reschedule_case_session_meeting(
  target_meeting_id uuid, target_starts_at timestamptz, target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_case_id uuid;
begin
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;
  select meeting.counseling_case_id into target_case_id
  from public.case_session_meetings meeting
  join public.case_sessions couple_session on couple_session.id = meeting.case_session_id
  where meeting.id = target_meeting_id
    and couple_session.status = 'active'
    and meeting.completed_at is null
    and meeting.id = (
      select upcoming.id from public.case_session_meetings upcoming
      where upcoming.case_session_id = couple_session.id and upcoming.completed_at is null
      order by upcoming.created_at desc, upcoming.id desc limit 1
    )
  for update of meeting, couple_session;
  if not found or not private.current_user_can_manage_counseling_case(target_case_id) then raise exception 'Not authorized'; end if;
  update public.case_session_meetings
  set starts_at = target_starts_at, ends_at = target_ends_at, scheduled_by = actor
  where id = target_meeting_id;
  return target_meeting_id;
end;
$$;

revoke execute on function public.schedule_followup_case_session_meeting(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.schedule_followup_case_session_meeting(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.reschedule_case_session_meeting(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.reschedule_case_session_meeting(uuid, timestamptz, timestamptz) to authenticated;
