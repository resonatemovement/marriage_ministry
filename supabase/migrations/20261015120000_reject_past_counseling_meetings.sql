create or replace function private.reject_past_counseling_meeting_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at <= pg_catalog.clock_timestamp() then
    raise exception 'Meeting date and time must be in the future.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_past_counseling_meeting_start() from public, anon, authenticated;

create trigger case_session_meetings_future_start
before insert or update of starts_at on public.case_session_meetings
for each row execute function private.reject_past_counseling_meeting_start();
