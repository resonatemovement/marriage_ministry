drop function public.record_meeting_notification_webhook(text, text, text, timestamptz, text);

create function public.record_meeting_notification_webhook(
  target_provider_event_id text,
  target_event_type text,
  target_provider_message_id text,
  target_occurred_at timestamptz,
  target_failure_message text default null,
  target_delivery_id uuid default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  matched_delivery_id uuid;
  next_status text;
  event_time timestamptz := coalesce(target_occurred_at, now());
begin
  if target_provider_event_id is null or btrim(target_provider_event_id) = ''
    or target_event_type is null or btrim(target_event_type) = '' then
    raise exception 'Webhook event identity is required';
  end if;

  select id into matched_delivery_id from public.notification_deliveries
  where id = target_delivery_id
    and meeting_id is not null
    and (provider_message_id is null or provider_message_id = target_provider_message_id)
  for update;

  insert into public.notification_webhook_events(provider_event_id, delivery_id, event_type)
  values(target_provider_event_id, matched_delivery_id, target_event_type)
  on conflict (provider_event_id) do nothing;
  if not found then return false; end if;
  if matched_delivery_id is null then return true; end if;

  next_status := case target_event_type
    when 'email.sent' then 'sent'
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.failed' then 'failed'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.suppressed' then 'suppressed'
    else null
  end;
  if next_status is null then return true; end if;

  update public.notification_deliveries set
    provider_message_id = coalesce(provider_message_id, target_provider_message_id),
    status = case
      when status in ('bounced', 'complained', 'suppressed') then status
      when status = 'delivered' and next_status in ('sent', 'delayed', 'failed') then status
      else next_status
    end,
    sent_at = case when next_status in ('sent', 'delivered') then coalesce(sent_at, event_time) else sent_at end,
    delivered_at = case when next_status = 'delivered' then coalesce(delivered_at, event_time) else delivered_at end,
    delayed_at = case when next_status = 'delayed' then event_time else delayed_at end,
    failed_at = case when next_status = 'failed' then event_time else failed_at end,
    bounced_at = case when next_status = 'bounced' then event_time else bounced_at end,
    complained_at = case when next_status = 'complained' then event_time else complained_at end,
    suppressed_at = case when next_status = 'suppressed' then event_time else suppressed_at end,
    error_category = case when next_status in ('failed', 'bounced', 'complained', 'suppressed') and target_failure_message is not null then 'provider_event' else error_category end,
    error_message = case when next_status in ('failed', 'bounced', 'complained', 'suppressed') and target_failure_message is not null then left(target_failure_message, 500) else error_message end,
    last_provider_event_at = greatest(coalesce(last_provider_event_at, event_time), event_time)
  where id = matched_delivery_id;
  return true;
end;
$$;

revoke all on function public.record_meeting_notification_webhook(text, text, text, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.record_meeting_notification_webhook(text, text, text, timestamptz, text, uuid) to service_role;
