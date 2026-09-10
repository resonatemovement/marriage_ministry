create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  related_entity_type text not null,
  related_entity_id uuid not null,
  template_key text not null,
  channel text not null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  status text not null default 'pending',
  provider_message_id text,
  error_category text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  constraint notification_deliveries_event_type_not_blank check (btrim(event_type) <> ''),
  constraint notification_deliveries_entity_type_not_blank check (btrim(related_entity_type) <> ''),
  constraint notification_deliveries_template_key_not_blank check (btrim(template_key) <> ''),
  constraint notification_deliveries_recipient_email_normalized check (recipient_email = lower(btrim(recipient_email)) and btrim(recipient_email) <> ''),
  constraint notification_deliveries_channel_valid check (channel in ('email', 'sms')),
  constraint notification_deliveries_status_valid check (status in ('pending', 'sent', 'failed')),
  constraint notification_deliveries_completion_matches_status check (
    (status = 'pending' and sent_at is null and failed_at is null)
    or (status = 'sent' and sent_at is not null and failed_at is null)
    or (status = 'failed' and sent_at is null and failed_at is not null)
  )
);

create index notification_deliveries_entity_created_idx
  on public.notification_deliveries (related_entity_type, related_entity_id, created_at desc);
create index notification_deliveries_recipient_created_idx
  on public.notification_deliveries (recipient_email, created_at desc);

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;
grant select on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;

create policy notification_deliveries_admin_read on public.notification_deliveries for select to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));
