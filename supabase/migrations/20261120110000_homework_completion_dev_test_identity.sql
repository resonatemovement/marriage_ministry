-- Allow the protected, target-only DEV test RPC to use an explicitly
-- configured synthetic Couple identity rather than a mutable display name.
-- Scope still requires the exact notification, Session, and Couple IDs plus
-- two allowlisted Mailinator recipients before any delivery rows are changed.
create or replace function public.claim_homework_completion_dev_test_notification(
  target_notification_id uuid,
  target_case_session_id uuid,
  target_couple_group_id uuid,
  target_recipient_emails text[]
) returns table(
  notification_id uuid,
  delivery_id uuid,
  claim_token uuid,
  manual_recovery boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_notification public.homework_completion_notifications%rowtype;
  selected_count integer;
  selected_emails text[];
  selected_profile_ids uuid[];
  claimed_delivery record;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Not authorized';
  end if;
  if target_notification_id is null or target_case_session_id is null or target_couple_group_id is null
    or target_recipient_emails is null or cardinality(target_recipient_emails) <> 2
    or target_recipient_emails[1] is null or target_recipient_emails[2] is null
    or target_recipient_emails[1] = target_recipient_emails[2]
    or exists (
      select 1 from unnest(target_recipient_emails) as supplied(email)
      where supplied.email <> lower(btrim(supplied.email))
        or supplied.email !~ '^[a-z0-9._+-]+@mailinator\.com$'
    ) then
    raise exception 'DEV test notification configuration is invalid';
  end if;

  -- The three server-configured IDs establish test identity. Group names are
  -- mutable presentation data and are not an authorization boundary.
  select notification.* into selected_notification
  from public.homework_completion_notifications as notification
  join public.case_sessions as session
    on session.id = notification.case_session_id
   and session.counseling_case_id = notification.counseling_case_id
  join public.counseling_cases as counseling_case
    on counseling_case.id = session.counseling_case_id
  join public.groups as couple
    on couple.id = counseling_case.couple_group_id
  where notification.id = target_notification_id
    and notification.case_session_id = target_case_session_id
    and counseling_case.couple_group_id = target_couple_group_id
    and couple.group_type = 'couple'::public.group_type
    and couple.active
    and session.status = 'active'
    and notification.status = 'pending'
    and notification.next_attempt_at <= clock_timestamp()
  for update of notification;
  if not found then
    raise exception 'DEV test notification identity or eligibility check failed';
  end if;

  if (select count(*) from public.group_members as member
      where member.group_id = target_couple_group_id and member.ended_at is null) <> 2 then
    raise exception 'DEV test Couple membership check failed';
  end if;

  perform 1
  from public.homework_completion_notification_deliveries as delivery
  where delivery.notification_id = target_notification_id
  for update;

  select count(*),
    array_agg(lower(btrim(profile.email)) order by lower(btrim(profile.email))),
    array_agg(delivery.recipient_profile_id order by delivery.recipient_profile_id)
  into selected_count, selected_emails, selected_profile_ids
  from public.homework_completion_notification_deliveries as delivery
  join public.profiles as profile on profile.id = delivery.recipient_profile_id
  where delivery.notification_id = target_notification_id;

  if selected_count <> 2
    or selected_emails is distinct from (select array_agg(supplied.email order by supplied.email)
      from unnest(target_recipient_emails) as supplied(email))
    or exists (
      select 1 from public.homework_completion_notification_deliveries as delivery
      where delivery.notification_id = target_notification_id
        and (delivery.status <> 'pending' or delivery.next_attempt_at > clock_timestamp()
          or delivery.recipient_assignment_id is distinct from selected_notification.recipient_assignment_id
          or delivery.recipient_group_id is distinct from selected_notification.recipient_group_id
          or not private.homework_completion_delivery_is_eligible(delivery.id))
    )
    or selected_profile_ids is distinct from (
      select array_agg(expected.profile_id order by expected.profile_id)
      from unnest(selected_notification.recipient_profile_ids) as expected(profile_id)
    ) then
    raise exception 'DEV test Counselor recipient check failed';
  end if;

  for claimed_delivery in
    update public.homework_completion_notification_deliveries as delivery
    set status = 'claimed', status_code = null, claim_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + interval '15 minutes', next_attempt_at = null,
        claim_sequence = delivery.claim_sequence + 1, updated_at = clock_timestamp()
    where delivery.notification_id = target_notification_id
      and delivery.recipient_profile_id = any(selected_profile_ids)
      and delivery.status = 'pending'
    returning delivery.notification_id, delivery.id, delivery.claim_token,
      delivery.manual_recovery_pending, delivery.claim_sequence, delivery.lease_expires_at,
      delivery.recipient_assignment_id, delivery.recipient_group_id,
      delivery.recipient_profile_id, delivery.provider_idempotency_key
  loop
    insert into public.homework_completion_notification_attempts(
      notification_id, delivery_id, claim_sequence, is_manual_recovery, claim_token,
      lease_expires_at, recipient_assignment_id, recipient_group_id,
      recipient_profile_ids, provider_idempotency_key, status
    ) values (
      claimed_delivery.notification_id, claimed_delivery.id, claimed_delivery.claim_sequence,
      claimed_delivery.manual_recovery_pending, claimed_delivery.claim_token,
      claimed_delivery.lease_expires_at, claimed_delivery.recipient_assignment_id,
      claimed_delivery.recipient_group_id, array[claimed_delivery.recipient_profile_id]::uuid[],
      case when claimed_delivery.manual_recovery_pending
        then claimed_delivery.provider_idempotency_key || '/manual-recovery/1'
        else claimed_delivery.provider_idempotency_key end,
      'claimed'
    );
    notification_id := claimed_delivery.notification_id;
    delivery_id := claimed_delivery.id;
    claim_token := claimed_delivery.claim_token;
    manual_recovery := claimed_delivery.manual_recovery_pending;
    return next;
  end loop;

  if not found then
    raise exception 'DEV test notification could not be claimed';
  end if;
end;
$$;

revoke all on function public.claim_homework_completion_dev_test_notification(uuid, uuid, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.claim_homework_completion_dev_test_notification(uuid, uuid, uuid, text[])
  to service_role;
