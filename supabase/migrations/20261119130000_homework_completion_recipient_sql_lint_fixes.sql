-- Repair recipient RPC compilation/type errors without editing the applied
-- recipient-delivery migration. Signatures, security modes, search paths, and
-- grants intentionally remain unchanged.

create or replace function public.claim_due_homework_completion_recipient_deliveries(claim_limit integer default 25)
returns table(notification_id uuid, delivery_id uuid, claim_token uuid, manual_recovery boolean)
language plpgsql security definer set search_path = '' as $$
declare expired record; claimed record;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if claim_limit is null or claim_limit not between 1 and 100 then raise exception 'Claim limit is invalid'; end if;
  update public.homework_completion_notification_attempts attempt
  set status='uncertain',completed_at=clock_timestamp(),error_category='worker_lease_expired_after_cancellation'
  where attempt.delivery_id is not null and attempt.status='started' and attempt.lease_expires_at<=clock_timestamp()
    and exists (select 1 from public.homework_completion_notification_deliveries delivery
      where delivery.id=attempt.delivery_id and delivery.status='cancelled');
  for expired in
    select delivery.id, delivery.notification_id, delivery.claim_token
    from public.homework_completion_notification_deliveries delivery
    join public.homework_completion_notifications notification on notification.id = delivery.notification_id
    where delivery.status = 'claimed' and delivery.lease_expires_at <= clock_timestamp()
    order by delivery.lease_expires_at, delivery.id for update of notification, delivery skip locked
  loop
    if exists (select 1 from public.homework_completion_notification_attempts attempt
      where attempt.delivery_id = expired.id and attempt.claim_token = expired.claim_token and attempt.status = 'started') then
      update public.homework_completion_notification_attempts as attempt
      set status = 'uncertain', completed_at = clock_timestamp(), error_category = 'worker_lease_expired'
      where attempt.delivery_id = expired.id and attempt.claim_token = expired.claim_token and attempt.status = 'started';
      update public.homework_completion_notification_deliveries set status = 'uncertain', status_code = 'worker_lease_expired',
        claim_token = null, lease_expires_at = null, next_attempt_at = null, manual_recovery_pending = false where id = expired.id;
    else
      update public.homework_completion_notification_attempts as attempt
      set status = 'expired_before_start', error_category = 'worker_lease_expired_before_start'
      where attempt.delivery_id = expired.id and attempt.claim_token = expired.claim_token and attempt.status = 'claimed';
      update public.homework_completion_notification_deliveries set status = 'pending', status_code = 'worker_lease_expired_before_start',
        claim_token = null, lease_expires_at = null, next_attempt_at = clock_timestamp() where id = expired.id;
    end if;
    perform private.refresh_homework_completion_notification_status(expired.notification_id);
  end loop;

  perform private.cancel_homework_completion_notifications(null, null, null);

  for claimed in
    with due as (
      select notification.id as cycle_id, delivery.id as delivery_id
      from public.homework_completion_notifications notification
      join public.homework_completion_notification_deliveries delivery on delivery.notification_id = notification.id
      where notification.status <> 'cancelled' and delivery.status = 'pending' and delivery.next_attempt_at <= clock_timestamp()
        and private.homework_completion_delivery_is_eligible(delivery.id)
      order by delivery.next_attempt_at, delivery.created_at, delivery.id
      for update of notification, delivery skip locked limit claim_limit
    )
    update public.homework_completion_notification_deliveries delivery
    set status = 'claimed', status_code = null, claim_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + interval '15 minutes', next_attempt_at = null,
        claim_sequence = delivery.claim_sequence + 1
    from due where delivery.id = due.delivery_id
    returning delivery.notification_id, delivery.id, delivery.claim_token, delivery.manual_recovery_pending
  loop
    insert into public.homework_completion_notification_attempts(
      notification_id, delivery_id, claim_sequence, is_manual_recovery, claim_token, lease_expires_at,
      recipient_assignment_id, recipient_group_id, recipient_profile_ids, provider_idempotency_key, status
    ) select claimed.notification_id, delivery.id, delivery.claim_sequence, claimed.manual_recovery_pending,
      claimed.claim_token, delivery.lease_expires_at, delivery.recipient_assignment_id, delivery.recipient_group_id,
      array[delivery.recipient_profile_id]::uuid[],
      case when claimed.manual_recovery_pending then delivery.provider_idempotency_key || '/manual-recovery/1' else delivery.provider_idempotency_key end,
      'claimed'
    from public.homework_completion_notification_deliveries delivery where delivery.id = claimed.id;
    notification_id := claimed.notification_id; delivery_id := claimed.id; claim_token := claimed.claim_token;
    manual_recovery := claimed.manual_recovery_pending; return next;
  end loop;
end;
$$;
revoke all on function public.claim_due_homework_completion_recipient_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_due_homework_completion_recipient_deliveries(integer) to service_role;

create or replace function public.prepare_homework_completion_recipient_payload(
  target_notification_id uuid, target_delivery_id uuid, target_claim_token uuid, target_provider_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare delivery public.homework_completion_notification_deliveries%rowtype;
  attempt public.homework_completion_notification_attempts%rowtype;
  frozen public.homework_completion_notification_payloads%rowtype;
  expected_email text; kind text;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  perform 1 from public.homework_completion_notifications where id = target_notification_id for update;
  select * into delivery from public.homework_completion_notification_deliveries
    where id = target_delivery_id and notification_id = target_notification_id and status = 'claimed'
      and claim_token = target_claim_token and lease_expires_at > clock_timestamp() for update;
  if not found then return null; end if;
  select * into attempt from public.homework_completion_notification_attempts
    where delivery_id = delivery.id and claim_token = target_claim_token and status = 'claimed'
      and lease_expires_at > clock_timestamp() for update;
  if not found then return null; end if;
  kind := case when attempt.is_manual_recovery then 'manual_recovery' else 'automatic' end;
  select * into frozen from public.homework_completion_notification_payloads
    where delivery_id = delivery.id and payload_kind = kind and provider_idempotency_key = attempt.provider_idempotency_key;
  if found then return jsonb_build_object('idempotencyKey', frozen.provider_idempotency_key, 'payload', frozen.provider_payload,
    'cutoffAt', frozen.idempotency_cutoff_at, 'firstProviderStartedAt', frozen.first_provider_started_at); end if;
  select lower(btrim(profile.email)) into expected_email from public.profiles profile where profile.id = delivery.recipient_profile_id;
  if expected_email is null or expected_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    if expected_email is null then raise exception 'recipient_email_missing'; else raise exception 'recipient_email_invalid'; end if;
  end if;
  if jsonb_typeof(target_provider_payload) <> 'object'
    or target_provider_payload -> 'to' is distinct from jsonb_build_array(expected_email)
    or target_provider_payload ? 'cc' or target_provider_payload ? 'bcc'
    or jsonb_typeof(target_provider_payload -> 'tags') <> 'array'
    or not exists(select 1 from jsonb_array_elements(target_provider_payload -> 'tags') as tag(value)
      where tag.value ->> 'name'='notification_delivery_id' and tag.value ->> 'value'=delivery.id::text)
    or not exists(select 1 from jsonb_array_elements(target_provider_payload -> 'tags') as tag(value)
      where tag.value ->> 'name'='notification_id' and tag.value ->> 'value'=delivery.notification_id::text)
    or not exists(select 1 from jsonb_array_elements(target_provider_payload -> 'tags') as tag(value)
      where tag.value ->> 'name'='notification_attempt_id' and tag.value ->> 'value'=attempt.id::text)
    or private.homework_completion_payload_has_answer_fields(target_provider_payload)
    or nullif(btrim(target_provider_payload ->> 'from'), '') is null
    or nullif(btrim(target_provider_payload ->> 'subject'), '') is null
    or nullif(btrim(target_provider_payload ->> 'html'), '') is null
    or nullif(btrim(target_provider_payload ->> 'text'), '') is null then raise exception 'Canonical provider payload is invalid'; end if;
  if not private.homework_completion_delivery_is_eligible(delivery.id) then return null; end if;
  insert into public.homework_completion_notification_payloads(
    notification_id, delivery_id, payload_kind, provider_idempotency_key, provider_payload
  ) values (delivery.notification_id, delivery.id, kind, attempt.provider_idempotency_key, target_provider_payload)
  returning * into frozen;
  return jsonb_build_object('idempotencyKey', frozen.provider_idempotency_key, 'payload', frozen.provider_payload,
    'cutoffAt', frozen.idempotency_cutoff_at, 'firstProviderStartedAt', frozen.first_provider_started_at);
end;
$$;
revoke all on function public.prepare_homework_completion_recipient_payload(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_homework_completion_recipient_payload(uuid, uuid, uuid, jsonb) to service_role;

create or replace function public.authorize_homework_completion_recipient_delivery(
  target_notification_id uuid, target_delivery_id uuid, target_claim_token uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare notification public.homework_completion_notifications%rowtype;
  delivery public.homework_completion_notification_deliveries%rowtype;
  attempt public.homework_completion_notification_attempts%rowtype;
  frozen public.homework_completion_notification_payloads%rowtype;
  v_provider_started_at timestamptz := clock_timestamp();
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  select * into notification from public.homework_completion_notifications where id = target_notification_id for update;
  if not found or notification.status = 'cancelled' then return null; end if;
  select * into delivery from public.homework_completion_notification_deliveries
    where id = target_delivery_id and notification_id = notification.id and status = 'claimed'
      and claim_token = target_claim_token and lease_expires_at > v_provider_started_at for update;
  if not found then return null; end if;
  select * into attempt from public.homework_completion_notification_attempts
    where delivery_id = delivery.id and claim_token = target_claim_token and status = 'claimed'
      and lease_expires_at > v_provider_started_at for update;
  if not found then return null; end if;
  if not private.homework_completion_delivery_is_eligible(delivery.id) then
    update public.homework_completion_notification_deliveries set status = 'cancelled', status_code = 'eligibility_lost_before_delivery',
      claim_token = null, lease_expires_at = null, next_attempt_at = null, manual_recovery_pending = false where id = delivery.id;
    update public.homework_completion_notification_attempts set status = 'cancelled_before_start', error_category = 'eligibility_lost_before_delivery'
      where id = attempt.id;
    perform private.refresh_homework_completion_notification_status(notification.id);
    return null;
  end if;
  if not attempt.is_manual_recovery and delivery.attempt_count >= 5 then
    update public.homework_completion_notification_deliveries set status='failed', status_code='retry_limit_reached',
      claim_token=null, lease_expires_at=null, next_attempt_at=null where id=delivery.id;
    update public.homework_completion_notification_attempts set status='expired_before_start', error_category='retry_limit_reached' where id=attempt.id;
    perform private.refresh_homework_completion_notification_status(notification.id);
    return null;
  end if;
  select * into frozen from public.homework_completion_notification_payloads
    where delivery_id = delivery.id and provider_idempotency_key = attempt.provider_idempotency_key
      and payload_kind = case when attempt.is_manual_recovery then 'manual_recovery' else 'automatic' end;
  if not found or (frozen.first_provider_started_at is not null and frozen.idempotency_cutoff_at <= v_provider_started_at) then
    update public.homework_completion_notification_deliveries set status='failed', status_code='provider_idempotency_window_expired',
      claim_token=null, lease_expires_at=null, next_attempt_at=null where id=delivery.id;
    update public.homework_completion_notification_attempts set status='expired_before_start', error_category='provider_idempotency_window_expired' where id=attempt.id;
    perform private.refresh_homework_completion_notification_status(notification.id);
    return null;
  end if;
  if frozen.first_provider_started_at is null then
    update public.homework_completion_notification_payloads set first_provider_started_at=v_provider_started_at,
      idempotency_cutoff_at=v_provider_started_at + interval '23 hours' where id=frozen.id returning * into frozen;
  end if;
  update public.homework_completion_notification_attempts set status='started',
    attempt_number=case when attempt.is_manual_recovery then null else delivery.attempt_count+1 end,
    started_at=v_provider_started_at
    where id=attempt.id and status='claimed' and lease_expires_at>v_provider_started_at;
  if not found then return null; end if;
  update public.homework_completion_notification_deliveries set
    attempt_count=case when attempt.is_manual_recovery then attempt_count else attempt_count+1 end,
    manual_recovery_pending=case when attempt.is_manual_recovery then false else manual_recovery_pending end,
    manual_recovery_used_at=case when attempt.is_manual_recovery then v_provider_started_at else manual_recovery_used_at end,
    manual_recovery_used_by=case when attempt.is_manual_recovery then manual_recovery_reserved_by else manual_recovery_used_by end
    where id=delivery.id and status='claimed' and claim_token=target_claim_token and lease_expires_at>v_provider_started_at;
  if not found then raise exception 'Recipient delivery lease expired before provider start'; end if;
  return jsonb_build_object('attemptId',attempt.id,'notificationId',notification.id,'deliveryId',delivery.id,
    'recipientProfileId',delivery.recipient_profile_id,'idempotencyKey',attempt.provider_idempotency_key,
    'providerPayload',frozen.provider_payload,'idempotencyCutoffAt',frozen.idempotency_cutoff_at,
    'attemptNumber',case when attempt.is_manual_recovery then null else delivery.attempt_count+1 end,
    'manualRecovery',attempt.is_manual_recovery);
end;
$$;
revoke all on function public.authorize_homework_completion_recipient_delivery(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.authorize_homework_completion_recipient_delivery(uuid, uuid, uuid) to service_role;

create or replace function public.list_homework_completion_recipient_delivery_alerts(target_limit integer default 50)
returns table(
  delivery_id uuid, notification_id uuid, counseling_case_id uuid, case_session_id uuid,
  status text, status_code text, completion_cycle integer, created_at timestamptz,
  session_title text, session_number integer, recipient_profile_id uuid, recipient_name text
) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if target_limit is null or target_limit not between 1 and 100 then raise exception 'Alert limit is invalid'; end if;
  return query
    with alert_rows as (
      select delivery.id as delivery_id, notification.id as notification_id,
        notification.counseling_case_id, notification.case_session_id, delivery.status,
        delivery.status_code, notification.completion_cycle, delivery.created_at,
        session.title as session_title, session.template_sequence_number::integer as session_number,
        profile.id as recipient_profile_id,
        nullif(btrim(concat_ws(' ',profile.first_name,profile.last_name)),'') as recipient_name
      from public.homework_completion_notification_deliveries delivery
      join public.homework_completion_notifications notification on notification.id=delivery.notification_id
      join public.case_sessions session on session.id=notification.case_session_id
      join public.profiles profile on profile.id=delivery.recipient_profile_id
      where delivery.status in ('failed','uncertain')
      union all
      select null::uuid, notification.id, notification.counseling_case_id, notification.case_session_id,
        notification.status, notification.status_code, notification.completion_cycle, notification.created_at,
        session.title, session.template_sequence_number::integer, null::uuid, null::text
      from public.homework_completion_notifications notification
      join public.case_sessions session on session.id=notification.case_session_id
      where notification.status='blocked'
        and not exists(select 1 from public.homework_completion_notification_deliveries delivery
          where delivery.notification_id=notification.id and delivery.status in ('failed','uncertain'))
    )
    select alert_rows.delivery_id, alert_rows.notification_id, alert_rows.counseling_case_id,
      alert_rows.case_session_id, alert_rows.status, alert_rows.status_code,
      alert_rows.completion_cycle, alert_rows.created_at, alert_rows.session_title,
      alert_rows.session_number, alert_rows.recipient_profile_id, alert_rows.recipient_name
    from alert_rows order by alert_rows.created_at desc, alert_rows.delivery_id nulls last
    limit target_limit;
end;
$$;
revoke all on function public.list_homework_completion_recipient_delivery_alerts(integer) from public, anon, authenticated;
grant execute on function public.list_homework_completion_recipient_delivery_alerts(integer) to authenticated;
