-- Keep the DEV automatic Homework worker bounded to the one Couple and the
-- two explicitly approved synthetic Counselor identities until expansion is
-- separately approved. Every mutation below is scoped before it is written.
create or replace function public.claim_due_homework_completion_dev_recipient_deliveries(
  claim_limit integer default 25,
  target_recipient_emails text[] default null
) returns table(notification_id uuid, delivery_id uuid, claim_token uuid, manual_recovery boolean)
language plpgsql security definer set search_path = '' as $$
declare
  approved_couple_group_id constant uuid := '23f1ac05-7090-4081-bf42-78f92a8da5d1';
  approved_recipient_profile_ids constant uuid[] := array[
    '8e5aacb2-c645-4922-892d-50a4ee65d464'::uuid,
    'b7bf9f7b-45f8-4780-9243-b0a1d22ef095'::uuid
  ];
  actual_recipient_emails text[];
  configured_recipient_emails text[];
  target_case record;
  expired record;
  claimed record;
  recipient_profile_id uuid;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Not authorized';
  end if;
  if claim_limit is null or claim_limit not between 1 and 25 then
    raise exception 'Claim limit is invalid';
  end if;
  if target_recipient_emails is null or cardinality(target_recipient_emails) <> 2
    or exists (
      select 1 from unnest(target_recipient_emails) as configured(email)
      where configured.email is null or lower(btrim(configured.email)) !~ '^[a-z0-9._+-]+@mailinator\.com$'
    ) then
    raise exception 'Approved DEV recipient configuration is invalid';
  end if;

  select array_agg(lower(btrim(configured.email)) order by lower(btrim(configured.email)))
  into configured_recipient_emails
  from unnest(target_recipient_emails) as configured(email);
  if configured_recipient_emails[1] = configured_recipient_emails[2] then
    raise exception 'Approved DEV recipient configuration must contain two unique addresses';
  end if;

  select array_agg(lower(btrim(profile.email)) order by lower(btrim(profile.email)))
  into actual_recipient_emails
  from public.profiles profile
  where profile.id = any(approved_recipient_profile_ids)
    and profile.status = 'active'
    and profile.email is not null;
  if actual_recipient_emails is distinct from configured_recipient_emails
    or cardinality(actual_recipient_emails) <> 2 then
    raise exception 'Approved DEV recipient identities do not match the current Counselor profiles';
  end if;

  if claim_limit is null then
    raise exception 'Claim limit is invalid';
  end if;

  -- Cancel only deliveries for the approved Couple and the two approved
  -- recipient profiles when current assignment eligibility has been lost.
  for target_case in
    select counseling_case.id
    from public.counseling_cases counseling_case
    where counseling_case.couple_group_id = approved_couple_group_id
  loop
    foreach recipient_profile_id in array approved_recipient_profile_ids loop
      perform private.cancel_homework_completion_notifications(
        target_case.id, null, recipient_profile_id
      );
    end loop;
  end loop;

  update public.homework_completion_notification_attempts attempt
  set status = 'uncertain', completed_at = clock_timestamp(),
      error_category = 'worker_lease_expired_after_cancellation'
  where attempt.delivery_id is not null
    and attempt.status = 'started'
    and attempt.lease_expires_at <= clock_timestamp()
    and attempt.recipient_profile_ids && approved_recipient_profile_ids
    and exists (
      select 1
      from public.homework_completion_notification_deliveries delivery
      join public.homework_completion_notifications notification on notification.id = delivery.notification_id
      join public.counseling_cases counseling_case on counseling_case.id = notification.counseling_case_id
      where delivery.id = attempt.delivery_id
        and delivery.status = 'cancelled'
        and delivery.recipient_profile_id = any(approved_recipient_profile_ids)
        and counseling_case.couple_group_id = approved_couple_group_id
    );

  for expired in
    select delivery.id, delivery.notification_id, delivery.claim_token
    from public.homework_completion_notification_deliveries delivery
    join public.homework_completion_notifications notification on notification.id = delivery.notification_id
    join public.counseling_cases counseling_case on counseling_case.id = notification.counseling_case_id
    where counseling_case.couple_group_id = approved_couple_group_id
      and delivery.recipient_profile_id = any(approved_recipient_profile_ids)
      and delivery.status = 'claimed'
      and delivery.lease_expires_at <= clock_timestamp()
    order by delivery.lease_expires_at, delivery.id
    for update of notification, delivery skip locked
  loop
    if exists (
      select 1 from public.homework_completion_notification_attempts attempt
      where attempt.delivery_id = expired.id
        and attempt.claim_token = expired.claim_token
        and attempt.status = 'started'
    ) then
      update public.homework_completion_notification_attempts
      set status = 'uncertain', completed_at = clock_timestamp(), error_category = 'worker_lease_expired'
      where delivery_id = expired.id and claim_token = expired.claim_token and status = 'started';
      update public.homework_completion_notification_deliveries
      set status = 'uncertain', status_code = 'worker_lease_expired', claim_token = null,
          lease_expires_at = null, next_attempt_at = null, manual_recovery_pending = false
      where id = expired.id;
    else
      update public.homework_completion_notification_attempts
      set status = 'expired_before_start', error_category = 'worker_lease_expired_before_start'
      where delivery_id = expired.id and claim_token = expired.claim_token and status = 'claimed';
      update public.homework_completion_notification_deliveries
      set status = 'pending', status_code = 'worker_lease_expired_before_start', claim_token = null,
          lease_expires_at = null, next_attempt_at = clock_timestamp()
      where id = expired.id;
    end if;
    perform private.refresh_homework_completion_notification_status(expired.notification_id);
  end loop;

  for claimed in
    with due as (
      select notification.id as cycle_id, delivery.id as delivery_id
      from public.homework_completion_notifications notification
      join public.counseling_cases counseling_case on counseling_case.id = notification.counseling_case_id
      join public.homework_completion_notification_deliveries delivery on delivery.notification_id = notification.id
      where counseling_case.couple_group_id = approved_couple_group_id
        and delivery.recipient_profile_id = any(approved_recipient_profile_ids)
        and notification.status <> 'cancelled'
        and delivery.status = 'pending'
        and delivery.next_attempt_at <= clock_timestamp()
        and private.homework_completion_delivery_is_eligible(delivery.id)
      order by delivery.next_attempt_at, delivery.created_at, delivery.id
      for update of notification, delivery skip locked
      limit claim_limit
    )
    update public.homework_completion_notification_deliveries delivery
    set status = 'claimed', status_code = null, claim_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + interval '15 minutes', next_attempt_at = null,
        claim_sequence = delivery.claim_sequence + 1
    from due
    where delivery.id = due.delivery_id
    returning delivery.notification_id, delivery.id, delivery.claim_token, delivery.manual_recovery_pending
  loop
    insert into public.homework_completion_notification_attempts(
      notification_id, delivery_id, claim_sequence, is_manual_recovery, claim_token, lease_expires_at,
      recipient_assignment_id, recipient_group_id, recipient_profile_ids, provider_idempotency_key, status
    )
    select claimed.notification_id, delivery.id, delivery.claim_sequence, claimed.manual_recovery_pending,
      claimed.claim_token, delivery.lease_expires_at, delivery.recipient_assignment_id,
      delivery.recipient_group_id, array[delivery.recipient_profile_id]::uuid[],
      case when claimed.manual_recovery_pending
        then delivery.provider_idempotency_key || '/manual-recovery/1'
        else delivery.provider_idempotency_key end,
      'claimed'
    from public.homework_completion_notification_deliveries delivery
    where delivery.id = claimed.id;
    notification_id := claimed.notification_id;
    delivery_id := claimed.id;
    claim_token := claimed.claim_token;
    manual_recovery := claimed.manual_recovery_pending;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_due_homework_completion_dev_recipient_deliveries(integer, text[]) from public, anon, authenticated;
grant execute on function public.claim_due_homework_completion_dev_recipient_deliveries(integer, text[]) to service_role;
