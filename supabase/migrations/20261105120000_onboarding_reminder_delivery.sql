create table public.onboarding_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  intake_request_id uuid not null references public.intake_requests(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id) on delete restrict,
  invited_status_history_id bigint not null references public.intake_request_status_history(id) on delete restrict,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  state text not null default 'processing',
  attempt_count integer not null default 1 check (attempt_count > 0),
  claim_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default now(),
  provider_message_id text,
  sent_at timestamptz,
  finished_at timestamptz,
  error_category text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_reminder_deliveries_state_valid check (state in ('processing', 'sent', 'failed', 'uncertain', 'skipped')),
  constraint onboarding_reminder_deliveries_email_normalized check (recipient_email = lower(btrim(recipient_email)) and recipient_email <> ''),
  constraint onboarding_reminder_deliveries_state_timestamps check (
    (state = 'processing' and finished_at is null and sent_at is null)
    or (state = 'sent' and finished_at is not null and sent_at is not null)
    or (state in ('failed', 'uncertain', 'skipped') and finished_at is not null and sent_at is null)
  ),
  constraint onboarding_reminder_deliveries_identity_cycle_unique unique (intake_request_id, invitation_id, invited_status_history_id)
);

create index onboarding_reminder_deliveries_request_created_idx
  on public.onboarding_reminder_deliveries(intake_request_id, created_at desc);

create trigger set_onboarding_reminder_deliveries_updated_at
before update on public.onboarding_reminder_deliveries
for each row execute function private.set_updated_at();

alter table public.onboarding_reminder_deliveries enable row level security;
revoke all on public.onboarding_reminder_deliveries from public, anon, authenticated;
grant all on public.onboarding_reminder_deliveries to service_role;

create or replace function public.claim_due_onboarding_reminder_deliveries(
  allowed_recipients text[],
  claim_limit integer default 50
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  intake_request_id uuid,
  invitation_id uuid,
  invited_status_history_id bigint,
  recipient_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_allowlist text[];
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Not authorized';
  end if;
  if claim_limit is null or claim_limit not between 1 and 100 then
    raise exception 'Claim limit must be between 1 and 100';
  end if;

  select coalesce(array_agg(distinct lower(btrim(email))), array[]::text[])
  into normalized_allowlist
  from unnest(coalesce(allowed_recipients, array[]::text[])) as email
  where lower(btrim(email)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@mailinator\.com$';

  if cardinality(normalized_allowlist) = 0 then
    return;
  end if;

  -- A worker that disappeared while a provider request may have been in flight
  -- is not retried automatically: the provider may already have accepted it.
  update public.onboarding_reminder_deliveries delivery
  set state = 'uncertain', finished_at = clock_timestamp(),
      error_category = 'worker_lost', error_message = 'Processing lease expired; delivery outcome requires review.'
  where delivery.state = 'processing'
    and delivery.claimed_at < clock_timestamp() - interval '15 minutes';

  return query
  with settings as (
    select intake_invited_onboarding_hours
    from public.global_reminder_settings
    where id = 'global'
  ), active_cycle as (
    select request.id as request_id, request.invited_group_id, history.id as cycle_id
    from public.intake_requests request
    join lateral (
      select status_history.id, status_history.changed_at
      from public.intake_request_status_history status_history
      where status_history.intake_request_id = request.id
        and status_history.to_status = 'invited'::public.intake_request_status
      order by status_history.changed_at desc, status_history.id desc
      limit 1
    ) history on true
    cross join settings
    where request.status = 'invited'::public.intake_request_status
      and request.invited_group_id is not null
      and history.changed_at <= clock_timestamp() - make_interval(hours => settings.intake_invited_onboarding_hours)
  ), valid_cycles as (
    select cycle.request_id, cycle.invited_group_id, cycle.cycle_id
    from active_cycle cycle
    join public.groups couple on couple.id = cycle.invited_group_id and couple.group_type = 'couple'::public.group_type
    join public.intake_request_people person on person.intake_request_id = cycle.request_id
    join public.invitations invitation
      on invitation.group_id = cycle.invited_group_id
      and invitation.intended_role = 'couple'::public.app_role
      and lower(invitation.email) = lower(person.email)
    group by cycle.request_id, cycle.invited_group_id, cycle.cycle_id
    having count(distinct lower(invitation.email)) = 2
      and count(distinct person.person_position) = 2
  ), eligible as (
    select cycle.request_id, cycle.cycle_id, invitation.id as invitation_id,
      invitation.email as recipient_email, invitation.auth_user_id as recipient_profile_id,
      invitation.first_name
    from valid_cycles cycle
    join public.intake_request_people person on person.intake_request_id = cycle.request_id
    join public.invitations invitation
      on invitation.group_id = cycle.invited_group_id
      and invitation.intended_role = 'couple'::public.app_role
      and lower(invitation.email) = lower(person.email)
    left join public.profiles profile on profile.id = invitation.auth_user_id
    where invitation.status in ('pending'::public.invitation_status, 'accepted'::public.invitation_status)
      and coalesce(invitation.last_sent_at, invitation.sent_at) is not null
      and profile.onboarding_completed_at is null
      and lower(invitation.email) = any(normalized_allowlist)
  ), inserted as (
    insert into public.onboarding_reminder_deliveries as delivery (
      intake_request_id, invitation_id, invited_status_history_id,
      recipient_profile_id, recipient_email, state, attempt_count,
      claim_token, claimed_at, finished_at, sent_at, provider_message_id,
      error_category, error_message
    )
    select eligible.request_id, eligible.invitation_id, eligible.cycle_id,
      eligible.recipient_profile_id, lower(eligible.recipient_email), 'processing', 1,
      gen_random_uuid(), clock_timestamp(), null, null, null, null, null
    from eligible
    order by eligible.request_id, eligible.invitation_id
    limit claim_limit
    on conflict (intake_request_id, invitation_id, invited_status_history_id)
    do update set
      state = 'processing', attempt_count = delivery.attempt_count + 1,
      claim_token = gen_random_uuid(), claimed_at = clock_timestamp(),
      finished_at = null, sent_at = null, provider_message_id = null,
      error_category = null, error_message = null
    where delivery.state = 'failed'
    returning delivery.id, delivery.claim_token, delivery.intake_request_id,
      delivery.invitation_id, delivery.invited_status_history_id,
      delivery.recipient_profile_id, delivery.recipient_email
  )
  select inserted.id, inserted.claim_token, inserted.intake_request_id,
    inserted.invitation_id, inserted.invited_status_history_id,
    inserted.recipient_email
  from inserted
  join public.invitations invitation on invitation.id = inserted.invitation_id;
end;
$$;

create or replace function public.authorize_onboarding_reminder_delivery(
  target_delivery_id uuid,
  target_claim_token uuid,
  allowed_recipients text[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.onboarding_reminder_deliveries%rowtype;
  request public.intake_requests%rowtype;
  invitation public.invitations%rowtype;
  status_entry public.intake_request_status_history%rowtype;
  configured_hours integer;
  normalized_allowlist text[];
  is_eligible boolean := false;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(distinct lower(btrim(email))), array[]::text[])
  into normalized_allowlist
  from unnest(coalesce(allowed_recipients, array[]::text[])) as email
  where lower(btrim(email)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@mailinator\.com$';

  select * into delivery from public.onboarding_reminder_deliveries
  where id = target_delivery_id and claim_token = target_claim_token and state = 'processing'
  for update;
  if not found then return false; end if;

  select * into request from public.intake_requests where id = delivery.intake_request_id;
  select * into invitation from public.invitations where id = delivery.invitation_id;
  select * into status_entry from public.intake_request_status_history
  where id = delivery.invited_status_history_id and intake_request_id = delivery.intake_request_id;
  select intake_invited_onboarding_hours into configured_hours
  from public.global_reminder_settings where id = 'global';

  is_eligible := request.id is not null
    and request.status = 'invited'::public.intake_request_status
    and request.invited_group_id = invitation.group_id
    and status_entry.id is not null
    and status_entry.to_status = 'invited'::public.intake_request_status
    and exists (
      select 1 from public.groups couple
      where couple.id = request.invited_group_id and couple.group_type = 'couple'::public.group_type
    )
    and (
      select count(distinct lower(invitee.email))
      from public.invitations invitee
      where invitee.group_id = request.invited_group_id
        and invitee.intended_role = 'couple'::public.app_role
    ) = 2
    and not exists (
      select 1 from public.intake_request_status_history newer
      where newer.intake_request_id = request.id
        and newer.to_status = 'invited'::public.intake_request_status
        and (newer.changed_at, newer.id) > (status_entry.changed_at, status_entry.id)
    )
    and status_entry.changed_at <= clock_timestamp() - make_interval(hours => configured_hours)
    and invitation.id is not null
    and invitation.intended_role = 'couple'::public.app_role
    and invitation.status in ('pending'::public.invitation_status, 'accepted'::public.invitation_status)
    and coalesce(invitation.last_sent_at, invitation.sent_at) is not null
    and lower(invitation.email) = delivery.recipient_email
    and lower(invitation.email) = any(normalized_allowlist)
    and exists (
      select 1 from public.intake_request_people person
      where person.intake_request_id = request.id
        and lower(person.email) = lower(invitation.email)
    )
    and not exists (
      select 1 from public.profiles profile
      where profile.id = invitation.auth_user_id
        and profile.onboarding_completed_at is not null
    );

  if not is_eligible then
    update public.onboarding_reminder_deliveries set state = 'skipped', finished_at = clock_timestamp(),
      error_category = 'eligibility_changed', error_message = 'Current invitation eligibility no longer matches.'
    where id = delivery.id and claim_token = target_claim_token and state = 'processing';
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.finish_onboarding_reminder_delivery(
  target_delivery_id uuid,
  target_claim_token uuid,
  next_state text,
  next_provider_message_id text default null,
  next_error_category text default null,
  next_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'Not authorized';
  end if;
  if next_state not in ('sent', 'failed', 'uncertain') then
    raise exception 'Invalid onboarding reminder delivery state';
  end if;

  update public.onboarding_reminder_deliveries delivery
  set state = next_state,
    provider_message_id = case when next_state = 'sent' then next_provider_message_id else null end,
    sent_at = case when next_state = 'sent' then clock_timestamp() else null end,
    finished_at = clock_timestamp(),
    error_category = case when next_state = 'sent' then null else left(coalesce(next_error_category, 'provider_failure'), 100) end,
    error_message = case when next_state = 'sent' then null else left(coalesce(next_error_message, 'Delivery did not complete.'), 500) end
  where delivery.id = target_delivery_id
    and delivery.claim_token = target_claim_token
    and delivery.state = 'processing';
  return found;
end;
$$;

revoke all on function public.claim_due_onboarding_reminder_deliveries(text[], integer) from public, anon, authenticated;
grant execute on function public.claim_due_onboarding_reminder_deliveries(text[], integer) to service_role;
revoke all on function public.authorize_onboarding_reminder_delivery(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.authorize_onboarding_reminder_delivery(uuid, uuid, text[]) to service_role;
revoke all on function public.finish_onboarding_reminder_delivery(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_onboarding_reminder_delivery(uuid, uuid, text, text, text, text) to service_role;
