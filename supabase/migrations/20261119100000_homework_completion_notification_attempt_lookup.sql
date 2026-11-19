-- Keep provider callbacks joinable to their durable attempt without exposing
-- the worker's claim token to the email provider.
create or replace function public.get_homework_completion_notification_attempt_id(
  target_notification_id uuid,
  target_claim_token uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_id uuid;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Not authorized';
  end if;

  select attempt.id into result_id
  from public.homework_completion_notification_attempts attempt
  join public.homework_completion_notifications notification
    on notification.id = attempt.notification_id
  where attempt.notification_id = target_notification_id
    and attempt.claim_token = target_claim_token
    and attempt.status = 'claimed'
    and notification.status = 'claimed'
    and notification.claim_token = target_claim_token
    and attempt.lease_expires_at > clock_timestamp()
    and notification.lease_expires_at > clock_timestamp();

  return result_id;
end;
$$;

revoke all on function public.get_homework_completion_notification_attempt_id(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_homework_completion_notification_attempt_id(uuid, uuid) to service_role;

-- Correlate a signed provider callback to the exact immutable request before
-- the general outcome reconciler can mutate an attempt. Keep this private to
-- service_role; the function returns no recipient or payload data.
create or replace function public.verify_homework_completion_notification_webhook(
  target_notification_id uuid,
  target_attempt_id uuid,
  target_provider_message_id text,
  target_provider_recipients text[]
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.homework_completion_notification_attempts%rowtype;
  notification public.homework_completion_notifications%rowtype;
  frozen public.homework_completion_notification_payloads%rowtype;
  payload_recipient text;
  payload_tags jsonb;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Not authorized';
  end if;

  if nullif(btrim(target_provider_message_id), '') is null
    or coalesce(cardinality(target_provider_recipients), 0) <> 1
    or nullif(btrim(target_provider_recipients[1]), '') is null then
    return 'unmatched';
  end if;

  select * into attempt
  from public.homework_completion_notification_attempts current_attempt
  where current_attempt.id = target_attempt_id
    and current_attempt.notification_id = target_notification_id
    and current_attempt.status in ('started', 'uncertain', 'accepted', 'delivered', 'bounced', 'rejected_retryable', 'rejected_permanent');
  if not found then return 'unmatched'; end if;

  if attempt.provider_message_id is not null
    and attempt.provider_message_id is distinct from target_provider_message_id then
    return 'unmatched';
  end if;

  select * into notification
  from public.homework_completion_notifications current_notification
  where current_notification.id = target_notification_id;
  if not found then return 'unmatched'; end if;

  select * into frozen
  from public.homework_completion_notification_payloads payload
  where payload.notification_id = target_notification_id
    and payload.provider_idempotency_key = attempt.provider_idempotency_key
    and payload.payload_kind = case when attempt.is_manual_recovery then 'manual_recovery' else 'automatic' end;
  if not found or jsonb_typeof(frozen.provider_payload -> 'to') <> 'array'
    or jsonb_array_length(frozen.provider_payload -> 'to') <> 1
    or jsonb_typeof(frozen.provider_payload -> 'tags') <> 'array' then
    return 'unmatched';
  end if;

  payload_recipient := lower(btrim(frozen.provider_payload #>> '{to,0}'));
  payload_tags := frozen.provider_payload -> 'tags';
  if payload_recipient = '' or payload_recipient is distinct from lower(btrim(target_provider_recipients[1])) then
    return 'unmatched';
  end if;
  if not exists (select 1 from jsonb_array_elements(payload_tags) as tag_entries(tag_entry)
      where tag_entries.tag_entry ->> 'name' = 'notification_id'
        and tag_entries.tag_entry ->> 'value' = notification.id::text)
    or not exists (select 1 from jsonb_array_elements(payload_tags) as tag_entries(tag_entry)
      where tag_entries.tag_entry ->> 'name' = 'notification_attempt_id'
        and tag_entries.tag_entry ->> 'value' = attempt.id::text)
    or not exists (select 1 from jsonb_array_elements(payload_tags) as tag_entries(tag_entry)
      where tag_entries.tag_entry ->> 'name' = 'notification_type'
        and tag_entries.tag_entry ->> 'value' = 'homework_completion')
    or not exists (select 1 from jsonb_array_elements(payload_tags) as tag_entries(tag_entry)
      where tag_entries.tag_entry ->> 'name' = 'completion_cycle'
        and tag_entries.tag_entry ->> 'value' = notification.completion_cycle::text) then
    return 'unmatched';
  end if;

  return 'verified';
end;
$$;

revoke all on function public.verify_homework_completion_notification_webhook(uuid, uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.verify_homework_completion_notification_webhook(uuid, uuid, text, text[]) to service_role;
