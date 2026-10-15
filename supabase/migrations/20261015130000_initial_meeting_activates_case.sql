create or replace function public.schedule_initial_case_meeting(
  target_case_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  meeting_id uuid;
  prior_status public.case_status;
begin
  if not (
    private.current_user_can_manage_counseling_case(target_case_id)
    or (
      private.current_user_has_role(array['super_admin']::public.app_role[])
      and exists (
        select 1
        from public.counseling_cases counseling_case
        where counseling_case.id = target_case_id
      )
    )
  ) then
    raise exception 'Not authorized';
  end if;

  if target_ends_at <= target_starts_at then
    raise exception 'Enter a valid meeting time';
  end if;

  select counseling_case.status
  into prior_status
  from public.counseling_cases counseling_case
  where counseling_case.id = target_case_id
    and counseling_case.closed_at is null
  for update;

  if not found then
    raise exception 'This counseling case is closed or unavailable';
  end if;

  if prior_status not in ('matched', 'active') then
    raise exception 'This counseling case must be matched before scheduling the Initial Meeting';
  end if;

  if exists (
    select 1
    from public.case_sessions couple_session
    where couple_session.counseling_case_id = target_case_id
  ) then
    raise exception 'The initial meeting is already complete';
  end if;

  select meeting.id
  into meeting_id
  from public.case_session_meetings meeting
  where meeting.counseling_case_id = target_case_id
    and meeting.session_id is null
  for update;

  if meeting_id is null then
    insert into public.case_session_meetings (
      counseling_case_id,
      starts_at,
      ends_at,
      location,
      scheduled_by
    )
    values (
      target_case_id,
      target_starts_at,
      target_ends_at,
      'In person',
      actor
    )
    returning id into meeting_id;
  else
    update public.case_session_meetings
    set
      starts_at = target_starts_at,
      ends_at = target_ends_at,
      scheduled_by = actor
    where id = meeting_id;
  end if;

  if prior_status = 'matched' then
    update public.counseling_cases
    set status = 'active'
    where id = target_case_id
      and status = 'matched';
  end if;

  return meeting_id;
end;
$$;

comment on function public.schedule_initial_case_meeting(uuid, timestamptz, timestamptz) is
  'Schedules or reschedules Session 0 and atomically advances a matched counseling case to active.';
