-- Preserve retained Session-level records while removing their Case Session
-- dependency as part of the existing DEV-only reset.
create or replace function public.reset_counseling_journey(
  target_case_id uuid,
  reset_confirmation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_status public.case_status;
  lifecycle_session_ids uuid[];
begin
  if actor is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if auth.jwt() ->> 'iss' is distinct from 'https://lctkqjjkhpyootwvttvj.supabase.co/auth/v1' then
    raise exception 'Counseling journey reset is available only in DEV';
  end if;
  if reset_confirmation is distinct from 'RESET' then
    raise exception 'Type exact uppercase RESET to continue';
  end if;

  select case_row.status
  into current_status
  from public.counseling_cases case_row
  where case_row.id = target_case_id
  for update;
  if not found then raise exception 'Counseling case is unavailable'; end if;
  if current_status not in ('matched', 'active', 'pending_final', 'finished', 'inactive') then
    raise exception 'Only a matched or previously active counseling case can be reset';
  end if;

  select coalesce(array_agg(session_row.id), array[]::uuid[])
  into lifecycle_session_ids
  from public.case_sessions session_row
  where session_row.counseling_case_id = target_case_id;

  perform set_config('app.dev_reset_counseling_case_id', target_case_id::text, true);

  delete from public.homework_completion_notification_provider_evidence evidence
  using public.homework_completion_notification_attempts attempt,
    public.homework_completion_notifications notification
  where evidence.attempt_id = attempt.id
    and attempt.notification_id = notification.id
    and notification.counseling_case_id = target_case_id;

  delete from public.homework_completion_notification_events event
  using public.homework_completion_notifications notification
  where event.notification_id = notification.id
    and notification.counseling_case_id = target_case_id;

  delete from public.homework_completion_notification_payloads payload
  using public.homework_completion_notifications notification
  where payload.notification_id = notification.id
    and notification.counseling_case_id = target_case_id;

  delete from public.homework_completion_notification_attempts attempt
  using public.homework_completion_notifications notification
  where attempt.notification_id = notification.id
    and notification.counseling_case_id = target_case_id;

  delete from public.homework_completion_notification_deliveries delivery
  using public.homework_completion_notifications notification
  where delivery.notification_id = notification.id
    and notification.counseling_case_id = target_case_id;

  delete from public.homework_completion_notifications notification
  where notification.counseling_case_id = target_case_id;

  -- Inbox notifications belong to the removed Session lifecycle, not to the
  -- Couple identity; delete only messages attached to this case's Sessions.
  delete from public.in_app_notifications notification
  where notification.case_session_id = any(lifecycle_session_ids);

  -- Keep assessment schedules, participant assignments, and results. Only
  -- detach references to Case Sessions that this reset is about to remove.
  update public.assessment_case_schedules schedule
  set case_session_id = null,
      progression_case_session_id = null,
      updated_at = now()
  where schedule.counseling_case_id = target_case_id
    and (schedule.case_session_id = any(lifecycle_session_ids)
      or schedule.progression_case_session_id = any(lifecycle_session_ids));

  perform public.reset_counseling_journey_impl(target_case_id, reset_confirmation);

  delete from public.audit_events event
  where event.entity_type = 'case_session'
    and event.entity_id = any(lifecycle_session_ids);

  delete from public.homework_audit_events event
  using public.homework_assignments assignment
  where event.homework_assignment_id = assignment.id
    and assignment.counseling_case_id = target_case_id;

  perform set_config('app.dev_reset_counseling_case_id', '', true);

  delete from public.homework_assignments assignment
  where assignment.counseling_case_id = target_case_id;
end;
$$;

revoke execute on function public.reset_counseling_journey(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reset_counseling_journey(uuid, text) to authenticated;
