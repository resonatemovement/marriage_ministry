create or replace function private.enforce_chronological_session_meeting()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_sequence integer;
  previous_starts_at timestamptz;
begin
  -- Initial meetings have no predecessor; their future-time guard remains unchanged.
  if new.case_session_id is null then
    return new;
  end if;

  select couple_session.actual_sequence
  into current_sequence
  from public.case_sessions couple_session
  where couple_session.id = new.case_session_id
    and couple_session.counseling_case_id = new.counseling_case_id;

  if not found then
    raise exception 'The scheduled Session is unavailable.' using errcode = '22023';
  end if;

  select max(previous_meeting.starts_at)
  into previous_starts_at
  from public.case_session_meetings previous_meeting
  left join public.case_sessions previous_session
    on previous_session.id = previous_meeting.case_session_id
  where previous_meeting.counseling_case_id = new.counseling_case_id
    and previous_meeting.id is distinct from new.id
    and (
      (previous_meeting.case_session_id is null and current_sequence = 1)
      or previous_session.actual_sequence < current_sequence
      or previous_meeting.case_session_id = new.case_session_id
    );

  if previous_starts_at is not null
    and (new.starts_at at time zone 'America/Los_Angeles')::date
      <= (previous_starts_at at time zone 'America/Los_Angeles')::date then
    raise exception 'The next meeting must be scheduled after the previous meeting date.' using errcode = '22023';
  end if;

  return new;
end;
$$;
