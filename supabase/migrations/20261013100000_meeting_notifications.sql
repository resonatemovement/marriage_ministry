alter table public.notification_deliveries
  add column counseling_case_id uuid references public.counseling_cases(id) on delete cascade,
  add column meeting_id uuid references public.case_session_meetings(id) on delete cascade,
  add column attempt_number integer not null default 1 check (attempt_number > 0),
  add column resend_of_delivery_id uuid references public.notification_deliveries(id) on delete set null,
  add column delivery_key text,
  add column delivered_at timestamptz,
  add column delayed_at timestamptz,
  add column bounced_at timestamptz,
  add column complained_at timestamptz,
  add column suppressed_at timestamptz,
  add column last_provider_event_at timestamptz;

alter table public.notification_deliveries
  drop constraint notification_deliveries_status_valid,
  drop constraint notification_deliveries_completion_matches_status,
  drop constraint notification_deliveries_recipient_email_normalized;

alter table public.notification_deliveries
  add constraint notification_deliveries_status_valid check (status in (
    'pending', 'sent', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'suppressed', 'no_email'
  )),
  add constraint notification_deliveries_recipient_email_normalized check (
    recipient_email is null or (recipient_email = lower(btrim(recipient_email)) and btrim(recipient_email) <> '')
  );

create unique index notification_deliveries_delivery_key_unique
  on public.notification_deliveries(delivery_key) where delivery_key is not null;
create index notification_deliveries_case_meeting_created_idx
  on public.notification_deliveries(counseling_case_id, meeting_id, created_at desc)
  where meeting_id is not null;

create policy notification_deliveries_case_staff_read on public.notification_deliveries for select to authenticated
using (
  counseling_case_id is not null
  and private.current_user_can_manage_counseling_case(counseling_case_id)
);

create table public.notification_webhook_events (
  provider_event_id text primary key,
  delivery_id uuid references public.notification_deliveries(id) on delete set null,
  event_type text not null,
  received_at timestamptz not null default now(),
  constraint notification_webhook_events_provider_id_not_blank check (btrim(provider_event_id) <> ''),
  constraint notification_webhook_events_type_not_blank check (btrim(event_type) <> '')
);
alter table public.notification_webhook_events enable row level security;
revoke all on public.notification_webhook_events from public, anon, authenticated;
grant all on public.notification_webhook_events to service_role;

create or replace function public.record_meeting_notification_webhook(
  target_provider_event_id text,
  target_event_type text,
  target_provider_message_id text,
  target_occurred_at timestamptz
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
  where provider_message_id = target_provider_message_id and meeting_id is not null
  order by created_at desc limit 1;

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
    status = case
      when status in ('bounced', 'complained', 'suppressed') then status
      when status = 'delivered' and next_status in ('sent', 'delayed', 'failed') then status
      else next_status
    end,
    sent_at = case when next_status = 'sent' then coalesce(sent_at, event_time) else sent_at end,
    delivered_at = case when next_status = 'delivered' then coalesce(delivered_at, event_time) else delivered_at end,
    delayed_at = case when next_status = 'delayed' then event_time else delayed_at end,
    failed_at = case when next_status = 'failed' then event_time else failed_at end,
    bounced_at = case when next_status = 'bounced' then event_time else bounced_at end,
    complained_at = case when next_status = 'complained' then event_time else complained_at end,
    suppressed_at = case when next_status = 'suppressed' then event_time else suppressed_at end,
    last_provider_event_at = greatest(coalesce(last_provider_event_at, event_time), event_time)
  where id = matched_delivery_id;
  return true;
end;
$$;

revoke all on function public.record_meeting_notification_webhook(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_meeting_notification_webhook(text, text, text, timestamptz) to service_role;
