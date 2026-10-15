-- PostgreSQL grants function execution to PUBLIC by default. Keep lifecycle writes authenticated-only.
revoke execute on function public.schedule_case_session_meeting(uuid, uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
revoke execute on function public.schedule_initial_case_meeting(uuid, timestamptz, timestamptz),
  public.activate_first_case_session(uuid, uuid, timestamptz, timestamptz),
  public.reschedule_case_session_meeting(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.schedule_initial_case_meeting(uuid, timestamptz, timestamptz),
  public.activate_first_case_session(uuid, uuid, timestamptz, timestamptz),
  public.reschedule_case_session_meeting(uuid, timestamptz, timestamptz)
  to authenticated;
