-- The DEV-only counseling reset may remove notification history only for its
-- locked target case. Ordinary notification lifecycle functions remain append-only.
create or replace function private.dev_reset_may_delete_homework_notification(
  target_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reset_case_id text := nullif(current_setting('app.dev_reset_counseling_case_id', true), '');
begin
  if reset_case_id is null
    or auth.uid() is null
    or auth.jwt() ->> 'iss' is distinct from 'https://lctkqjjkhpyootwvttvj.supabase.co/auth/v1'
    or not private.current_user_has_role(array['super_admin']::public.app_role[]) then
    return false;
  end if;

  return exists (
    select 1
    from public.homework_completion_notifications notification
    where notification.id = target_notification_id
      and notification.counseling_case_id::text = reset_case_id
  );
end;
$$;
revoke all on function private.dev_reset_may_delete_homework_notification(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.prevent_homework_completion_notification_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and private.dev_reset_may_delete_homework_notification(old.notification_id) then
    return old;
  end if;
  raise exception 'Homework completion notification history is append-only';
end;
$$;
revoke all on function private.prevent_homework_completion_notification_event_mutation()
  from public, anon, authenticated, service_role;

create or replace function private.prevent_homework_completion_notification_payload_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'homework_completion_notification_payloads' then
      notification_id := old.notification_id;
    elsif tg_table_name = 'homework_completion_notification_provider_evidence' then
      select attempt.notification_id
      into notification_id
      from public.homework_completion_notification_attempts attempt
      where attempt.id = old.attempt_id;
    end if;

    if notification_id is not null
      and private.dev_reset_may_delete_homework_notification(notification_id) then
      return old;
    end if;
    raise exception 'Homework completion notification payload and provider evidence are immutable';
  end if;

  if tg_op <> 'UPDATE' then
    raise exception 'Homework completion notification payload and provider evidence are immutable';
  end if;

  if tg_table_name = 'homework_completion_notification_payloads' then
    if new.id is distinct from old.id
      or new.notification_id is distinct from old.notification_id
      or new.payload_kind is distinct from old.payload_kind
      or new.provider_idempotency_key is distinct from old.provider_idempotency_key
      or new.provider_payload is distinct from old.provider_payload
      or new.payload_version is distinct from old.payload_version
      or new.created_at is distinct from old.created_at
      or (old.first_provider_started_at is not null and (
        new.first_provider_started_at is distinct from old.first_provider_started_at
        or new.idempotency_cutoff_at is distinct from old.idempotency_cutoff_at
      ))
      or (old.first_provider_started_at is null and (
        (new.first_provider_started_at is null) <> (new.idempotency_cutoff_at is null)
        or (new.first_provider_started_at is not null
          and new.idempotency_cutoff_at is distinct from new.first_provider_started_at + interval '23 hours')
      )) then
      raise exception 'Homework completion notification payload identity is immutable';
    end if;
    if old.first_provider_started_at is null and new.first_provider_started_at is null then
      raise exception 'Only the first provider start may bind the idempotency cutoff';
    end if;
    return new;
  end if;

  raise exception 'Homework completion notification payload and provider evidence are immutable';
end;
$$;
revoke all on function private.prevent_homework_completion_notification_payload_mutation()
  from public, anon, authenticated, service_role;

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

  -- The same transaction-local case scope is checked by the immutable-history
  -- triggers. The case row remains locked until the whole reset commits/rolls back.
  perform set_config('app.dev_reset_counseling_case_id', target_case_id::text, true);

  -- Remove the complete recipient delivery history from leaves toward the cycle.
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

  perform public.reset_counseling_journey_impl(target_case_id, reset_confirmation);

  -- Clear only test-run override audit rows tied to this case's Couple Sessions.
  delete from public.audit_events event
  where event.entity_type = 'case_session'
    and event.entity_id = any(lifecycle_session_ids);

  -- Preserve the existing narrowly scoped Homework audit-history exception.
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
