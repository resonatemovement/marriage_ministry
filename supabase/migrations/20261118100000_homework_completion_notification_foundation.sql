-- Durable, one-row-per-completion-cycle Homework notification outbox.
-- Sending is intentionally performed by a later server-only worker.

create table public.homework_completion_notifications (
  id uuid primary key default gen_random_uuid(),
  case_session_id uuid not null references public.case_sessions(id) on delete restrict,
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  assignment_revision_id uuid not null references public.homework_assignment_revisions(id) on delete restrict,
  completion_cycle integer not null check (completion_cycle > 0),
  partner_progress_ids uuid[] not null,
  completed_at timestamptz not null default clock_timestamp(),
  recipient_assignment_id uuid references public.case_assignments(id) on delete restrict,
  recipient_group_id uuid references public.groups(id) on delete restrict,
  recipient_profile_ids uuid[] not null default '{}'::uuid[],
  status text not null,
  status_code text,
  -- attempt_count counts provider calls durably started, not lease claims.
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claim_sequence integer not null default 0 check (claim_sequence >= 0),
  next_attempt_at timestamptz,
  claim_token uuid,
  lease_expires_at timestamptz,
  provider_idempotency_key text not null unique,
  provider_message_id text,
  last_error_category text,
  sent_at timestamptz,
  delivered_at timestamptz,
  manual_recovery_reserved_at timestamptz,
  manual_recovery_reserved_by uuid references public.profiles(id) on delete restrict,
  manual_recovery_recipient_assignment_id uuid references public.case_assignments(id) on delete restrict,
  manual_recovery_recipient_group_id uuid references public.groups(id) on delete restrict,
  manual_recovery_recipient_profile_ids uuid[] not null default '{}'::uuid[],
  manual_recovery_idempotency_key text,
  manual_recovery_used_at timestamptz,
  manual_recovery_used_by uuid references public.profiles(id) on delete restrict,
  manual_recovery_pending boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint homework_completion_notification_cycle_unique unique (case_session_id, completion_cycle),
  constraint homework_completion_notification_partner_ids_valid check (
    cardinality(partner_progress_ids) = 2
    and partner_progress_ids[1] <> partner_progress_ids[2]
  ),
  constraint homework_completion_notification_recipient_ids_valid check (
    cardinality(recipient_profile_ids) in (0, 2)
    and (cardinality(recipient_profile_ids) = 0 or recipient_profile_ids[1] <> recipient_profile_ids[2])
  ),
  constraint homework_completion_notification_state_valid check (status in (
    'pending', 'claimed', 'sent', 'delivered', 'failed', 'blocked', 'skipped', 'cancelled', 'uncertain'
  )),
  constraint homework_completion_notification_claim_shape check (
    (status = 'claimed') = (claim_token is not null and lease_expires_at is not null)
  ),
  constraint homework_completion_notification_schedule_shape check (
    (status = 'pending') = (next_attempt_at is not null)
  ),
  constraint homework_completion_notification_recipient_shape check (
    (status in ('pending', 'claimed', 'sent', 'delivered', 'uncertain')
      and recipient_assignment_id is not null and recipient_group_id is not null
      and cardinality(recipient_profile_ids) = 2)
    or status in ('failed', 'blocked', 'skipped', 'cancelled')
  ),
  constraint homework_completion_notification_manual_recovery_shape check (
    (manual_recovery_reserved_at is null) = (manual_recovery_reserved_by is null)
    and (manual_recovery_used_at is null) = (manual_recovery_used_by is null)
    and (manual_recovery_used_at is null or manual_recovery_reserved_at is not null)
    and (not manual_recovery_pending or (manual_recovery_reserved_at is not null and manual_recovery_used_at is null))
    and ((manual_recovery_reserved_at is null) = (manual_recovery_idempotency_key is null))
    and ((manual_recovery_reserved_at is null) = (manual_recovery_recipient_assignment_id is null))
    and ((manual_recovery_reserved_at is null) = (manual_recovery_recipient_group_id is null))
    and ((manual_recovery_reserved_at is null) = (cardinality(manual_recovery_recipient_profile_ids) = 0))
  )
);

create index homework_completion_notifications_due_idx
  on public.homework_completion_notifications(next_attempt_at, created_at)
  where status = 'pending';
create index homework_completion_notifications_case_session_idx
  on public.homework_completion_notifications(case_session_id, completion_cycle desc);
create index homework_completion_notifications_recipient_ids_idx
  on public.homework_completion_notifications using gin(recipient_profile_ids);

create table public.homework_completion_notification_events (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.homework_completion_notifications(id) on delete restrict,
  event_type text not null,
  resulting_status text not null,
  attempt_number integer not null default 0 check (attempt_number >= 0),
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  detail_code text,
  provider_event_id text,
  created_at timestamptz not null default clock_timestamp(),
  constraint homework_completion_notification_event_type_not_blank check (btrim(event_type) <> ''),
  constraint homework_completion_notification_event_status_valid check (resulting_status in (
    'pending', 'claimed', 'sent', 'delivered', 'failed', 'blocked', 'skipped', 'cancelled', 'uncertain'
  )),
  constraint homework_completion_notification_event_provider_id_unique unique (provider_event_id)
);
create index homework_completion_notification_events_history_idx
  on public.homework_completion_notification_events(notification_id, created_at, id);

-- One durable record per provider-call attempt. A lease may be canceled or
-- expire while an external request is in flight; this row preserves its actual
-- outcome independently from the parent cycle's terminal cancellation state.
create table public.homework_completion_notification_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.homework_completion_notifications(id) on delete restrict,
  claim_sequence integer not null check (claim_sequence > 0),
  attempt_number integer check (attempt_number > 0),
  is_manual_recovery boolean not null default false,
  claim_token uuid not null unique,
  lease_expires_at timestamptz not null,
  recipient_assignment_id uuid not null references public.case_assignments(id) on delete restrict,
  recipient_group_id uuid not null references public.groups(id) on delete restrict,
  recipient_profile_ids uuid[] not null,
  provider_idempotency_key text not null,
  status text not null check (status in (
    'claimed', 'started', 'accepted', 'delivered', 'rejected_retryable',
    'rejected_permanent', 'uncertain', 'bounced', 'skipped', 'rejected_before_start',
    'cancelled_before_start', 'expired_before_start'
  )),
  provider_message_id text,
  provider_event_id text unique,
  error_category text,
  claimed_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  cancellation_requested_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint homework_completion_notification_attempt_claim_unique unique (notification_id, claim_sequence),
  constraint homework_completion_notification_attempt_number_unique unique (notification_id, attempt_number),
  constraint homework_completion_notification_attempt_recipient_ids_valid check (
    cardinality(recipient_profile_ids) = 2 and recipient_profile_ids[1] <> recipient_profile_ids[2]
  ),
  constraint homework_completion_notification_attempt_start_shape check (
    (status in ('claimed', 'rejected_before_start', 'expired_before_start', 'cancelled_before_start')) = (started_at is null)
  ),
  constraint homework_completion_notification_attempt_completion_shape check (
    (status in ('accepted', 'delivered', 'rejected_retryable', 'rejected_permanent', 'uncertain', 'bounced', 'skipped', 'rejected_before_start')) = (completed_at is not null)
  )
);
create index homework_completion_notification_attempts_history_idx
  on public.homework_completion_notification_attempts(notification_id, claim_sequence);
create unique index homework_completion_notification_manual_key_unique
  on public.homework_completion_notifications(manual_recovery_idempotency_key)
  where manual_recovery_idempotency_key is not null;
alter table public.homework_completion_notification_attempts enable row level security;
revoke all on public.homework_completion_notification_attempts from public, anon, authenticated, service_role;

-- A canonical provider request is frozen before the durable provider-start
-- boundary. Automatic retries and the one manual recovery use distinct keys
-- and immutable snapshots; no client or service role receives table access.
create table public.homework_completion_notification_payloads (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.homework_completion_notifications(id) on delete restrict,
  payload_kind text not null check (payload_kind in ('automatic', 'manual_recovery')),
  provider_idempotency_key text not null unique,
  provider_payload jsonb not null check (jsonb_typeof(provider_payload) = 'object'),
  payload_version integer not null default 1 check (payload_version = 1),
  first_provider_started_at timestamptz,
  idempotency_cutoff_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint homework_completion_notification_payload_kind_unique unique (notification_id, payload_kind),
  constraint homework_completion_notification_payload_cutoff check (
    (first_provider_started_at is null) = (idempotency_cutoff_at is null)
    and (idempotency_cutoff_at is null
      or idempotency_cutoff_at = first_provider_started_at + interval '23 hours')
  )
);
alter table public.homework_completion_notification_payloads enable row level security;
revoke all on public.homework_completion_notification_payloads from public, anon, authenticated, service_role;

-- Provider evidence is append-only and deduplicated by a provider-scoped
-- stable evidence identifier. Distinct verified events may advance delivery.
create table public.homework_completion_notification_provider_evidence (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.homework_completion_notification_attempts(id) on delete restrict,
  provider_name text not null check (provider_name = 'resend'),
  evidence_identifier text not null check (btrim(evidence_identifier) <> ''),
  event_id text,
  message_id text,
  outcome text not null check (outcome in ('accepted', 'delivered', 'rejected_retryable', 'rejected_permanent', 'uncertain', 'bounced')),
  error_category text,
  received_at timestamptz not null default clock_timestamp(),
  constraint homework_completion_notification_provider_evidence_unique unique (provider_name, evidence_identifier),
  constraint homework_completion_notification_provider_evidence_has_id check (
    (event_id is not null and btrim(event_id) <> '') or (message_id is not null and btrim(message_id) <> '')
  )
);
alter table public.homework_completion_notification_provider_evidence enable row level security;
revoke all on public.homework_completion_notification_provider_evidence from public, anon, authenticated, service_role;

create or replace function private.prevent_homework_completion_notification_payload_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
revoke all on function private.prevent_homework_completion_notification_payload_mutation() from public, anon, authenticated;
create trigger prevent_homework_completion_notification_payload_mutation
before update or delete on public.homework_completion_notification_payloads
for each row execute function private.prevent_homework_completion_notification_payload_mutation();
create trigger prevent_homework_completion_notification_provider_evidence_mutation
before update or delete on public.homework_completion_notification_provider_evidence
for each row execute function private.prevent_homework_completion_notification_payload_mutation();

create or replace function private.prevent_homework_completion_notification_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Homework completion notification history is append-only';
end;
$$;
revoke all on function private.prevent_homework_completion_notification_event_mutation() from public, anon, authenticated;
create trigger prevent_homework_completion_notification_event_mutation
before update or delete on public.homework_completion_notification_events
for each row execute function private.prevent_homework_completion_notification_event_mutation();

alter table public.homework_completion_notifications enable row level security;
alter table public.homework_completion_notification_events enable row level security;
revoke all on public.homework_completion_notifications, public.homework_completion_notification_events from public, anon, authenticated, service_role;
grant select on public.homework_completion_notifications, public.homework_completion_notification_events to authenticated;
create policy homework_completion_notifications_admin_read
  on public.homework_completion_notifications for select to authenticated
  using ((select private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])));
create policy homework_completion_notification_events_admin_read
  on public.homework_completion_notification_events for select to authenticated
  using ((select private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])));

create or replace function private.homework_completion_notification_log(
  target_notification_id uuid,
  target_event_type text,
  target_status text,
  target_detail_code text default null,
  target_actor uuid default null,
  target_provider_event_id text default null
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.homework_completion_notification_events(
    notification_id, event_type, resulting_status, attempt_number,
    actor_profile_id, detail_code, provider_event_id
  )
  select notification.id, target_event_type, target_status, notification.attempt_count,
    target_actor, target_detail_code, target_provider_event_id
  from public.homework_completion_notifications notification
  where notification.id = target_notification_id
  on conflict (provider_event_id) do nothing;
$$;
revoke all on function private.homework_completion_notification_log(uuid, text, text, text, uuid, text) from public, anon, authenticated;

-- The immutable identity fields define the historical completion cycle. Delivery
-- state may change, but a cycle cannot be repointed to another Couple/Session.
create or replace function private.guard_homework_completion_notification_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.case_session_id is distinct from old.case_session_id
    or new.counseling_case_id is distinct from old.counseling_case_id
    or new.assignment_revision_id is distinct from old.assignment_revision_id
    or new.completion_cycle is distinct from old.completion_cycle
    or new.partner_progress_ids is distinct from old.partner_progress_ids
    or new.completed_at is distinct from old.completed_at
    or new.recipient_assignment_id is distinct from old.recipient_assignment_id
    or new.recipient_group_id is distinct from old.recipient_group_id
    or new.recipient_profile_ids is distinct from old.recipient_profile_ids
    or new.provider_idempotency_key is distinct from old.provider_idempotency_key
    or new.created_at is distinct from old.created_at then
    raise exception 'Homework completion cycle identity is immutable';
  end if;
  if old.manual_recovery_used_at is not null
    and (new.manual_recovery_used_at is distinct from old.manual_recovery_used_at
      or new.manual_recovery_used_by is distinct from old.manual_recovery_used_by) then
    raise exception 'Homework notification recovery audit is immutable';
  end if;
  if old.manual_recovery_reserved_at is not null
    and (new.manual_recovery_reserved_at is distinct from old.manual_recovery_reserved_at
      or new.manual_recovery_reserved_by is distinct from old.manual_recovery_reserved_by
      or new.manual_recovery_recipient_assignment_id is distinct from old.manual_recovery_recipient_assignment_id
      or new.manual_recovery_recipient_group_id is distinct from old.manual_recovery_recipient_group_id
      or new.manual_recovery_recipient_profile_ids is distinct from old.manual_recovery_recipient_profile_ids
      or new.manual_recovery_idempotency_key is distinct from old.manual_recovery_idempotency_key) then
    raise exception 'Homework notification recovery reservation is immutable';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.guard_homework_completion_notification_identity() from public, anon, authenticated;
create trigger guard_homework_completion_notification_identity
before update on public.homework_completion_notifications
for each row execute function private.guard_homework_completion_notification_identity();

create or replace function private.guard_homework_completion_notification_attempt_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.notification_id is distinct from old.notification_id
    or new.claim_sequence is distinct from old.claim_sequence
    or new.is_manual_recovery is distinct from old.is_manual_recovery
    or new.claim_token is distinct from old.claim_token
    or new.lease_expires_at is distinct from old.lease_expires_at
    or new.recipient_assignment_id is distinct from old.recipient_assignment_id
    or new.recipient_group_id is distinct from old.recipient_group_id
    or new.recipient_profile_ids is distinct from old.recipient_profile_ids
    or new.provider_idempotency_key is distinct from old.provider_idempotency_key
    or new.claimed_at is distinct from old.claimed_at
    or new.created_at is distinct from old.created_at then
    raise exception 'Homework notification attempt identity is immutable';
  end if;
  if old.attempt_number is not null and new.attempt_number is distinct from old.attempt_number then
    raise exception 'Homework notification attempt number is immutable';
  end if;
  if old.started_at is not null and new.started_at is distinct from old.started_at then
    raise exception 'Homework notification attempt start is immutable';
  end if;
  if old.completed_at is not null and old.status <> 'uncertain' and new.completed_at is distinct from old.completed_at then
    raise exception 'Homework notification attempt outcome is immutable';
  end if;
  if old.status <> 'uncertain' and old.completed_at is not null
    and not (old.status = 'accepted' and new.status in ('delivered', 'bounced'))
    and (new.status is distinct from old.status or new.provider_message_id is distinct from old.provider_message_id
      or new.provider_event_id is distinct from old.provider_event_id) then
    raise exception 'Homework notification attempt outcome is immutable';
  end if;
  if old.status = 'accepted' and new.status in ('delivered', 'bounced')
    and (new.provider_message_id is distinct from old.provider_message_id
      or new.provider_event_id is distinct from old.provider_event_id) then
    raise exception 'Provider evidence identity is append-only';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_homework_completion_notification_attempt_identity() from public, anon, authenticated;
create trigger guard_homework_completion_notification_attempt_identity
before update on public.homework_completion_notification_attempts
for each row execute function private.guard_homework_completion_notification_attempt_identity();
create trigger prevent_homework_completion_notification_attempt_delete
before delete on public.homework_completion_notification_attempts
for each row execute function private.prevent_homework_completion_notification_event_mutation();

create or replace function private.homework_completion_recipient_snapshot_is_eligible(
  target_case_id uuid,
  target_revision_id uuid,
  target_assignment_id uuid,
  target_group_id uuid,
  target_profile_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.case_assignments assignment
    join public.groups team on team.id = assignment.assigned_group_id and team.active
    where assignment.id = target_assignment_id
      and assignment.counseling_case_id = target_case_id
      and assignment.assignment_type = 'counselor'
      and assignment.ended_at is null
      and assignment.assigned_group_id = target_group_id
      and cardinality(target_profile_ids) = 2
      and (select count(*) from public.case_assignments active_assignment
        where active_assignment.counseling_case_id = target_case_id
          and active_assignment.assignment_type = 'counselor'
          and active_assignment.ended_at is null) = 1
      and exists (
        select 1
        from public.homework_assignment_revisions active_revision
        join public.homework_assignments active_assignment
          on active_assignment.id = active_revision.homework_assignment_id
        where active_revision.id = target_revision_id
          and active_revision.ended_at is null
          and active_assignment.unassigned_at is null
      )
      and team.group_type in ('counselor_team', 'coach_team', 'campus_lead_team')
      and (select count(*) from public.group_members active_member
        where active_member.group_id = team.id and active_member.ended_at is null) = 2
      and (select coalesce(array_agg(member.profile_id order by member.profile_id), '{}'::uuid[])
        from public.group_members member
        join public.profiles profile on profile.id = member.profile_id and profile.status = 'active'
        join public.profile_roles role_map on role_map.profile_id = profile.id
          and role_map.role = case team.group_type
            when 'counselor_team' then 'counselor'::public.app_role
            when 'coach_team' then 'coach'::public.app_role
            when 'campus_lead_team' then 'campus_lead'::public.app_role
          end
        where member.group_id = team.id and member.ended_at is null
      ) = target_profile_ids
  );
$$;
revoke all on function private.homework_completion_recipient_snapshot_is_eligible(uuid, uuid, uuid, uuid, uuid[]) from public, anon, authenticated;

create or replace function private.homework_completion_recipient_is_eligible(target_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.homework_completion_recipient_snapshot_is_eligible(
      notification.counseling_case_id,
      notification.assignment_revision_id,
      case when notification.manual_recovery_reserved_at is not null then notification.manual_recovery_recipient_assignment_id else notification.recipient_assignment_id end,
      case when notification.manual_recovery_reserved_at is not null then notification.manual_recovery_recipient_group_id else notification.recipient_group_id end,
      case when notification.manual_recovery_reserved_at is not null then notification.manual_recovery_recipient_profile_ids else notification.recipient_profile_ids end
    )
    and not exists (
      select 1
      from public.homework_completion_notification_payloads payload
      join public.homework_completion_notification_attempts attempt
        on attempt.notification_id = notification.id
        and attempt.provider_idempotency_key = payload.provider_idempotency_key
      where payload.notification_id = notification.id
        and payload.payload_kind = case when attempt.is_manual_recovery then 'manual_recovery' else 'automatic' end
        and payload.provider_payload -> 'to' is distinct from (
          select jsonb_agg(to_jsonb(lower(btrim(profile.email))) order by profile.id)
          from public.profiles profile
          where profile.id = any(attempt.recipient_profile_ids)
        )
    )
  from public.homework_completion_notifications notification
  where notification.id = target_notification_id;
$$;
revoke all on function private.homework_completion_recipient_is_eligible(uuid) from public, anon, authenticated;

create or replace function private.cancel_homework_completion_notifications(
  target_case_id uuid default null,
  target_group_id uuid default null,
  target_profile_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare changed record; cancelled_count integer := 0;
begin
  for changed in
    update public.homework_completion_notifications notification
    set status = 'cancelled', status_code = 'recipient_eligibility_lost',
      next_attempt_at = null, claim_token = null, lease_expires_at = null,
      manual_recovery_pending = false
    where notification.status in ('pending', 'claimed')
      and (target_case_id is null or notification.counseling_case_id = target_case_id)
      and (target_group_id is null
        or notification.recipient_group_id = target_group_id
        or (notification.manual_recovery_reserved_at is not null
          and notification.manual_recovery_recipient_group_id = target_group_id))
      and (target_profile_id is null
        or notification.recipient_profile_ids @> array[target_profile_id]
        or (notification.manual_recovery_reserved_at is not null
          and notification.manual_recovery_recipient_profile_ids @> array[target_profile_id]))
      and (
        not private.homework_completion_recipient_is_eligible(notification.id)
        or not exists (
          select 1
          from public.homework_assignment_revisions active_revision
          join public.homework_assignments active_assignment
            on active_assignment.id = active_revision.homework_assignment_id
          where active_revision.id = notification.assignment_revision_id
            and active_revision.ended_at is null
            and active_assignment.unassigned_at is null
        )
      )
    returning notification.id
  loop
    update public.homework_completion_notification_attempts attempt
    set status = case when attempt.started_at is null then 'cancelled_before_start' else attempt.status end,
      cancellation_requested_at = case when attempt.started_at is not null then clock_timestamp() else attempt.cancellation_requested_at end
    where attempt.notification_id = changed.id and attempt.status in ('claimed', 'started');
    perform private.homework_completion_notification_log(
      changed.id, 'cancelled', 'cancelled', 'recipient_eligibility_lost'
    );
    cancelled_count := cancelled_count + 1;
  end loop;
  return cancelled_count;
end;
$$;
revoke all on function private.cancel_homework_completion_notifications(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.cancel_homework_notifications_for_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_case uuid;
begin
  if tg_op = 'DELETE' then target_case := old.counseling_case_id;
  else target_case := new.counseling_case_id; end if;
  perform private.cancel_homework_completion_notifications(target_case, null, null);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.cancel_homework_notifications_for_assignment_change() from public, anon, authenticated;
create trigger cancel_homework_notifications_after_assignment_change
after insert or update or delete on public.case_assignments
for each row execute function private.cancel_homework_notifications_for_assignment_change();

create or replace function private.cancel_homework_notifications_for_group_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_group uuid;
begin
  if tg_op = 'DELETE' then target_group := old.id;
  else target_group := new.id; end if;
  perform private.cancel_homework_completion_notifications(null, target_group, null);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.cancel_homework_notifications_for_group_change() from public, anon, authenticated;
create trigger cancel_homework_notifications_after_group_change
after update of active, group_type on public.groups
for each row execute function private.cancel_homework_notifications_for_group_change();

create or replace function private.cancel_homework_notifications_for_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare affected record;
begin
  for affected in
    select distinct changed.group_id, changed.profile_id
    from (values
      ((to_jsonb(old) ->> 'group_id')::uuid, (to_jsonb(old) ->> 'profile_id')::uuid),
      ((to_jsonb(new) ->> 'group_id')::uuid, (to_jsonb(new) ->> 'profile_id')::uuid)
    ) as changed(group_id, profile_id)
    where changed.group_id is not null and changed.profile_id is not null
  loop
    perform private.cancel_homework_completion_notifications(null, affected.group_id, affected.profile_id);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.cancel_homework_notifications_for_membership_change() from public, anon, authenticated;
create trigger cancel_homework_notifications_after_membership_change
after insert or update or delete on public.group_members
for each row execute function private.cancel_homework_notifications_for_membership_change();

create or replace function private.cancel_homework_notifications_for_profile_eligibility_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_profile uuid;
begin
  target_profile := coalesce(
    (to_jsonb(new) ->> 'profile_id')::uuid,
    (to_jsonb(old) ->> 'profile_id')::uuid,
    (to_jsonb(new) ->> 'id')::uuid,
    (to_jsonb(old) ->> 'id')::uuid
  );
  perform private.cancel_homework_completion_notifications(null, null, target_profile);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.cancel_homework_notifications_for_profile_eligibility_change() from public, anon, authenticated;
create trigger cancel_homework_notifications_after_profile_role_change
after insert or update or delete on public.profile_roles
for each row execute function private.cancel_homework_notifications_for_profile_eligibility_change();
create trigger cancel_homework_notifications_after_profile_status_change
after update of status on public.profiles
for each row when (old.status is distinct from new.status)
execute function private.cancel_homework_notifications_for_profile_eligibility_change();
create trigger cancel_homework_notifications_after_profile_email_change
after update of email on public.profiles
for each row when (old.email is distinct from new.email)
execute function private.cancel_homework_notifications_for_profile_eligibility_change();

create or replace function private.cancel_homework_notifications_for_assignment_lifecycle_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_id uuid := (to_jsonb(new) ->> 'id')::uuid; target_case_id uuid;
begin
  if tg_table_name = 'homework_assignments' then
    select assignment.counseling_case_id into target_case_id
    from public.homework_assignments assignment where assignment.id = target_id;
  else
    select assignment.counseling_case_id into target_case_id
    from public.homework_assignment_revisions revision
    join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
    where revision.id = target_id;
  end if;
  perform private.cancel_homework_completion_notifications(target_case_id, null, null);
  return new;
end;
$$;
revoke all on function private.cancel_homework_notifications_for_assignment_lifecycle_change() from public, anon, authenticated;
create trigger cancel_homework_notifications_after_homework_unassign
after update of unassigned_at on public.homework_assignments
for each row when (old.unassigned_at is distinct from new.unassigned_at)
execute function private.cancel_homework_notifications_for_assignment_lifecycle_change();
create trigger cancel_homework_notifications_after_revision_end
after update of ended_at on public.homework_assignment_revisions
for each row when (old.ended_at is distinct from new.ended_at)
execute function private.cancel_homework_notifications_for_assignment_lifecycle_change();

create or replace function private.enqueue_homework_completion_notification(target_progress_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session_id uuid;
  target_case_id uuid;
  target_revision_id uuid;
  couple_group_id uuid;
  progress_ids uuid[];
  couple_profile_ids uuid[];
  completion_number integer;
  eligible_assignment_count integer := 0;
  eligible_assignment_id uuid;
  eligible_group_id uuid;
  eligible_profile_ids uuid[] := '{}'::uuid[];
  new_notification_id uuid := gen_random_uuid();
  inserted_id uuid;
  initial_status text;
  initial_code text;
begin
  select session.id, assignment.counseling_case_id, revision.id, counseling_case.couple_group_id
  into target_session_id, target_case_id, target_revision_id, couple_group_id
  from public.homework_participant_progress progress
  join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
  join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
  join public.case_sessions session on session.homework_assignment_revision_id = revision.id
    and session.counseling_case_id = assignment.counseling_case_id
  join public.counseling_cases counseling_case on counseling_case.id = assignment.counseling_case_id
  where progress.id = target_progress_id and assignment.unassigned_at is null
    and revision.ended_at is null;
  if target_session_id is null then return null; end if;

  select coalesce(array_agg(member.profile_id order by member.profile_id), '{}'::uuid[])
  into couple_profile_ids
  from public.group_members member
  where member.group_id = couple_group_id and member.ended_at is null;
  if cardinality(couple_profile_ids) <> 2 then return null; end if;

  select coalesce(array_agg(progress.id order by progress.profile_id), '{}'::uuid[])
  into progress_ids
  from public.homework_participant_progress progress
  where progress.assignment_revision_id = target_revision_id
    and progress.profile_id = any(couple_profile_ids)
    and progress.status in ('submitted', 'reviewed');
  if cardinality(progress_ids) <> 2
    or (select count(*) from public.homework_participant_progress progress
      where progress.assignment_revision_id = target_revision_id) <> 2
    or exists (
      select 1 from public.homework_participant_progress progress
      where progress.assignment_revision_id = target_revision_id
        and progress.profile_id = any(couple_profile_ids)
        and progress.status not in ('submitted', 'reviewed')
    ) then return null; end if;

  select count(*)::integer into eligible_assignment_count
  from public.case_assignments assignment
  where assignment.counseling_case_id = target_case_id
    and assignment.assignment_type = 'counselor' and assignment.ended_at is null;

  if eligible_assignment_count = 1 then
    select assignment.id, team.id,
      coalesce(array_agg(member.profile_id order by member.profile_id), '{}'::uuid[])
    into eligible_assignment_id, eligible_group_id, eligible_profile_ids
    from public.case_assignments assignment
    join public.groups team on team.id = assignment.assigned_group_id and team.active
      and team.group_type in ('counselor_team', 'coach_team', 'campus_lead_team')
    join public.group_members member on member.group_id = team.id and member.ended_at is null
    join public.profiles profile on profile.id = member.profile_id and profile.status = 'active'
    join public.profile_roles role_map on role_map.profile_id = profile.id
      and role_map.role = case team.group_type
        when 'counselor_team' then 'counselor'::public.app_role
        when 'coach_team' then 'coach'::public.app_role
        when 'campus_lead_team' then 'campus_lead'::public.app_role
      end
    where assignment.counseling_case_id = target_case_id
      and assignment.assignment_type = 'counselor' and assignment.ended_at is null
    group by assignment.id, team.id
    having count(*) = 2
      and (select count(*) from public.group_members active_member
        where active_member.group_id = team.id and active_member.ended_at is null) = 2;
  end if;

  select coalesce(max(notification.completion_cycle), 0) + 1
  into completion_number
  from public.homework_completion_notifications notification
  where notification.case_session_id = target_session_id;

  if eligible_assignment_count <> 1 or eligible_assignment_id is null or cardinality(eligible_profile_ids) <> 2 then
    initial_status := 'blocked';
    initial_code := 'no_eligible_counselor';
    eligible_profile_ids := '{}'::uuid[];
    eligible_group_id := null;
    eligible_assignment_id := null;
  else
    initial_status := 'pending';
    initial_code := null;
  end if;

  insert into public.homework_completion_notifications(
    id, case_session_id, counseling_case_id, assignment_revision_id,
    completion_cycle, partner_progress_ids, recipient_assignment_id,
    recipient_group_id, recipient_profile_ids, status, status_code,
    next_attempt_at, provider_idempotency_key
  ) values (
    new_notification_id, target_session_id, target_case_id, target_revision_id,
    completion_number, progress_ids, eligible_assignment_id,
    eligible_group_id, eligible_profile_ids, initial_status, initial_code,
    case when initial_status = 'pending' then clock_timestamp() end,
    'homework-completion-cycle/' || new_notification_id::text
  ) returning id into inserted_id;
  perform private.homework_completion_notification_log(
    inserted_id, case when initial_status = 'pending' then 'queued' else 'blocked' end,
    initial_status, initial_code, auth.uid()
  );
  return inserted_id;
end;
$$;
revoke all on function private.enqueue_homework_completion_notification(uuid) from public, anon, authenticated;

-- Keep the paired-response validation and all existing submission behavior in
-- the existing wrapper. Add only the atomic post-submit cycle hook around it.
alter function public.persist_participant_homework(uuid, jsonb, text)
  rename to persist_participant_homework_with_paired_validation;
alter function public.persist_participant_homework_with_paired_validation(uuid, jsonb, text)
  set schema private;
revoke all on function private.persist_participant_homework_with_paired_validation(uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.persist_participant_homework(
  target_progress_id uuid,
  target_answers jsonb,
  target_intent text
) returns public.homework_progress_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_status public.homework_progress_status;
  final_status public.homework_progress_status;
  target_session_id uuid;
begin
  -- Session-first lock order matches Session completion/reopen paths. The
  -- existing assignment+progress lock below serializes both partner submits.
  select session.id into target_session_id
  from public.homework_participant_progress progress
  join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
  join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
  join public.case_sessions session on session.homework_assignment_revision_id = revision.id
    and session.counseling_case_id = assignment.counseling_case_id
  where progress.id = target_progress_id and progress.profile_id = (select auth.uid())
  for update of session;

  select progress.status into prior_status
  from public.homework_participant_progress progress
  join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
  join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
  where progress.id = target_progress_id and progress.profile_id = (select auth.uid())
    and assignment.unassigned_at is null and revision.ended_at is null
  for update of assignment, progress;

  final_status := private.persist_participant_homework_with_paired_validation(
    target_progress_id, target_answers, target_intent
  );
  if target_intent = 'submit'
    and prior_status not in ('submitted', 'reviewed')
    and final_status = 'submitted'
    and target_session_id is not null then
    perform private.enqueue_homework_completion_notification(target_progress_id);
  end if;
  return final_status;
end;
$$;
revoke all on function public.persist_participant_homework(uuid, jsonb, text) from public, anon;
grant execute on function public.persist_participant_homework(uuid, jsonb, text) to authenticated;

-- Reuse the existing authorized reopen transaction, then cancel only undelivered
-- completion cycles containing the progress row that was reopened.
alter function public.reopen_participant_homework(uuid, uuid) set schema private;
revoke all on function private.reopen_participant_homework(uuid, uuid) from public, anon, authenticated;

create or replace function public.reopen_participant_homework(
  target_case_id uuid,
  target_progress_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target_session_id uuid; changed record;
begin
  target_session_id := private.reopen_participant_homework(target_case_id, target_progress_id);
  for changed in
    update public.homework_completion_notifications notification
    set status = 'cancelled', status_code = 'homework_reopened',
      next_attempt_at = null, claim_token = null, lease_expires_at = null,
      manual_recovery_pending = false
    where notification.case_session_id = target_session_id
      and notification.partner_progress_ids @> array[target_progress_id]
      and notification.status in ('pending', 'claimed')
    returning notification.id
  loop
    update public.homework_completion_notification_attempts attempt
    set status = case when attempt.started_at is null then 'cancelled_before_start' else attempt.status end,
      cancellation_requested_at = case when attempt.started_at is not null then clock_timestamp() else attempt.cancellation_requested_at end
    where attempt.notification_id = changed.id and attempt.status in ('claimed', 'started');
    perform private.homework_completion_notification_log(
      changed.id, 'cancelled', 'cancelled', 'homework_reopened', auth.uid()
    );
  end loop;
  return target_session_id;
end;
$$;
revoke all on function public.reopen_participant_homework(uuid, uuid) from public, anon;
grant execute on function public.reopen_participant_homework(uuid, uuid) to authenticated;

create or replace function public.claim_due_homework_completion_notifications(claim_limit integer default 25)
returns table (notification_id uuid, claim_token uuid, manual_recovery boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare expired record; claimed record;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if claim_limit is null or claim_limit not between 1 and 100 then raise exception 'Claim limit is invalid'; end if;

  for expired in
    select notification.id, notification.claim_token
    from public.homework_completion_notifications notification
    where notification.status = 'claimed' and notification.lease_expires_at <= clock_timestamp()
    order by notification.lease_expires_at, notification.id
    for update skip locked
  loop
    if exists (select 1 from public.homework_completion_notification_attempts attempt
      where attempt.notification_id = expired.id and attempt.claim_token = expired.claim_token
        and attempt.status = 'started') then
      update public.homework_completion_notification_attempts attempt
      set status = 'uncertain', completed_at = clock_timestamp(), error_category = 'worker_lease_expired'
      where attempt.notification_id = expired.id and attempt.claim_token = expired.claim_token and attempt.status = 'started';
      update public.homework_completion_notifications notification
      set status = 'uncertain', status_code = 'worker_lease_expired',
        claim_token = null, lease_expires_at = null, next_attempt_at = null,
        manual_recovery_pending = false
      where notification.id = expired.id;
      perform private.homework_completion_notification_log(expired.id, 'uncertain', 'uncertain', 'worker_lease_expired');
    else
      update public.homework_completion_notification_attempts attempt
      set status = 'expired_before_start', error_category = 'worker_lease_expired_before_start'
      where attempt.notification_id = expired.id and attempt.claim_token = expired.claim_token and attempt.status = 'claimed';
      update public.homework_completion_notifications notification
      set status = 'pending', status_code = 'worker_lease_expired_before_start',
        claim_token = null, lease_expires_at = null, next_attempt_at = clock_timestamp()
      where notification.id = expired.id;
      perform private.homework_completion_notification_log(expired.id, 'claim_expired_before_start', 'pending', 'worker_lease_expired_before_start');
    end if;
  end loop;

  perform private.cancel_homework_completion_notifications(null, null, null);

  for claimed in
    with due as (
      select notification.id
      from public.homework_completion_notifications notification
      where notification.status = 'pending' and notification.next_attempt_at <= clock_timestamp()
      order by notification.next_attempt_at, notification.created_at, notification.id
      for update skip locked
      limit claim_limit
    )
    update public.homework_completion_notifications notification
    set status = 'claimed', status_code = null, claim_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + interval '15 minutes',
      next_attempt_at = null, claim_sequence = notification.claim_sequence + 1
    from due where notification.id = due.id
    returning notification.id, notification.claim_token, notification.manual_recovery_pending
  loop
    insert into public.homework_completion_notification_attempts(
      notification_id, claim_sequence, is_manual_recovery, claim_token, lease_expires_at,
      recipient_assignment_id, recipient_group_id, recipient_profile_ids, provider_idempotency_key, status
    )
    select claimed.id, notification.claim_sequence, claimed.manual_recovery_pending,
      claimed.claim_token, notification.lease_expires_at,
      case when claimed.manual_recovery_pending then notification.manual_recovery_recipient_assignment_id else notification.recipient_assignment_id end,
      case when claimed.manual_recovery_pending then notification.manual_recovery_recipient_group_id else notification.recipient_group_id end,
      case when claimed.manual_recovery_pending then notification.manual_recovery_recipient_profile_ids else notification.recipient_profile_ids end,
      case when claimed.manual_recovery_pending then notification.manual_recovery_idempotency_key else notification.provider_idempotency_key end,
      'claimed'
    from public.homework_completion_notifications notification
    where notification.id = claimed.id;
    perform private.homework_completion_notification_log(
      claimed.id, 'attempt_claimed', 'claimed',
      case when claimed.manual_recovery_pending then 'manual_recovery' else 'automatic' end
    );
    notification_id := claimed.id;
    claim_token := claimed.claim_token;
    manual_recovery := claimed.manual_recovery_pending;
    return next;
  end loop;
end;
$$;
revoke all on function public.claim_due_homework_completion_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_due_homework_completion_notifications(integer) to service_role;

create or replace function private.homework_completion_payload_has_answer_fields(target_payload jsonb)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case jsonb_typeof(target_payload)
    when 'object' then exists (
      select 1 from jsonb_each(target_payload) as field(key, value)
      where lower(field.key) in ('answers', 'homework_answers', 'homeworkanswers', 'response_pairs', 'responsepairs')
        or private.homework_completion_payload_has_answer_fields(field.value)
    )
    when 'array' then exists (
      select 1 from jsonb_array_elements(target_payload) as element(value)
      where private.homework_completion_payload_has_answer_fields(element.value)
    )
    else false
  end;
$$;
revoke all on function private.homework_completion_payload_has_answer_fields(jsonb) from public, anon, authenticated, service_role;

create or replace function public.prepare_homework_completion_notification_payload(
  target_notification_id uuid,
  target_claim_token uuid,
  target_provider_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification public.homework_completion_notifications%rowtype;
  attempt public.homework_completion_notification_attempts%rowtype;
  frozen public.homework_completion_notification_payloads%rowtype;
  v_payload_kind text;
  expected_to jsonb;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;

  select * into notification from public.homework_completion_notifications
  where id = target_notification_id and status = 'claimed'
    and claim_token = target_claim_token and lease_expires_at > clock_timestamp()
  for update;
  if not found then return null; end if;
  select * into attempt from public.homework_completion_notification_attempts
  where notification_id = notification.id and claim_token = target_claim_token
    and status = 'claimed' and lease_expires_at > clock_timestamp()
  for update;
  if not found then return null; end if;
  v_payload_kind := case when attempt.is_manual_recovery then 'manual_recovery' else 'automatic' end;

  select * into frozen from public.homework_completion_notification_payloads
  where notification_id = notification.id and payload_kind = v_payload_kind
    and provider_idempotency_key = attempt.provider_idempotency_key;
  if found then
    return jsonb_build_object('idempotencyKey', frozen.provider_idempotency_key,
      'payload', frozen.provider_payload, 'cutoffAt', frozen.idempotency_cutoff_at,
      'firstProviderStartedAt', frozen.first_provider_started_at);
  end if;

  select jsonb_agg(to_jsonb(lower(btrim(profile.email))) order by profile.id)
  into expected_to
  from public.profiles profile
  where profile.id = any(attempt.recipient_profile_ids)
    and profile.email is not null
    and lower(btrim(profile.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
  if jsonb_typeof(expected_to) <> 'array' or jsonb_array_length(expected_to) <> 2 then
    if exists (select 1 from public.profiles profile
      where profile.id = any(attempt.recipient_profile_ids)
        and (profile.email is null or btrim(profile.email) = '')) then
      raise exception 'recipient_email_missing';
    end if;
    raise exception 'recipient_email_invalid';
  end if;
  if jsonb_typeof(target_provider_payload) <> 'object'
    or target_provider_payload -> 'to' is distinct from expected_to
    or nullif(btrim(target_provider_payload ->> 'from'), '') is null
    or nullif(btrim(target_provider_payload ->> 'subject'), '') is null
    or nullif(btrim(target_provider_payload ->> 'html'), '') is null
    or nullif(btrim(target_provider_payload ->> 'text'), '') is null
    or private.homework_completion_payload_has_answer_fields(target_provider_payload) then
    raise exception 'Canonical provider payload is invalid';
  end if;
  if not private.homework_completion_recipient_snapshot_is_eligible(
    notification.counseling_case_id, notification.assignment_revision_id,
    attempt.recipient_assignment_id, attempt.recipient_group_id, attempt.recipient_profile_ids
  ) then return null; end if;

  insert into public.homework_completion_notification_payloads(
    notification_id, payload_kind, provider_idempotency_key, provider_payload,
    first_provider_started_at, idempotency_cutoff_at
  ) values (
    notification.id, v_payload_kind, attempt.provider_idempotency_key, target_provider_payload,
    null, null
  ) returning * into frozen;
  return jsonb_build_object('idempotencyKey', frozen.provider_idempotency_key,
    'payload', frozen.provider_payload, 'cutoffAt', frozen.idempotency_cutoff_at,
    'firstProviderStartedAt', frozen.first_provider_started_at);
end;
$$;
revoke all on function public.prepare_homework_completion_notification_payload(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.prepare_homework_completion_notification_payload(uuid, uuid, jsonb) to service_role;

create or replace function public.fail_homework_completion_notification_before_delivery(
  target_notification_id uuid,
  target_claim_token uuid,
  failure_code text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification public.homework_completion_notifications%rowtype;
  attempt public.homework_completion_notification_attempts%rowtype;
  email_problem_exists boolean;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if failure_code is null or failure_code not in ('recipient_email_missing', 'recipient_email_invalid') then
    raise exception 'Pre-delivery failure is invalid';
  end if;
  select * into notification from public.homework_completion_notifications
  where id = target_notification_id and status = 'claimed'
    and claim_token = target_claim_token and lease_expires_at > clock_timestamp()
  for update;
  if not found then return false; end if;
  select * into attempt from public.homework_completion_notification_attempts
  where notification_id = notification.id and claim_token = target_claim_token
    and status = 'claimed' and attempt_number is null and lease_expires_at > clock_timestamp()
  for update;
  if not found or attempt.started_at is not null then return false; end if;

  select exists (
    select 1 from public.profiles profile
    where profile.id = any(attempt.recipient_profile_ids)
      and case failure_code
        when 'recipient_email_missing' then profile.email is null or btrim(profile.email) = ''
        else profile.email is not null and btrim(profile.email) <> ''
          and lower(btrim(profile.email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      end
  ) into email_problem_exists;
  if not email_problem_exists
    or not private.homework_completion_recipient_snapshot_is_eligible(
      notification.counseling_case_id, notification.assignment_revision_id,
      attempt.recipient_assignment_id, attempt.recipient_group_id, attempt.recipient_profile_ids
    ) then return false; end if;

  update public.homework_completion_notification_attempts
  set status = 'rejected_before_start', completed_at = clock_timestamp(), error_category = failure_code
  where id = attempt.id and status = 'claimed' and attempt_number is null and started_at is null
    and lease_expires_at > clock_timestamp();
  if not found then return false; end if;
  update public.homework_completion_notifications
  set status = 'failed', status_code = failure_code, last_error_category = failure_code,
    claim_token = null, lease_expires_at = null, next_attempt_at = null,
    manual_recovery_pending = false
  where id = notification.id and status = 'claimed' and claim_token = target_claim_token
    and lease_expires_at > clock_timestamp();
  if not found then raise exception 'Worker lease expired while recording pre-delivery failure'; end if;
  perform private.homework_completion_notification_log(
    notification.id, 'provider_request_not_started', 'failed', failure_code
  );
  return true;
end;
$$;
revoke all on function public.fail_homework_completion_notification_before_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_homework_completion_notification_before_delivery(uuid, uuid, text) to service_role;

create or replace function public.authorize_homework_completion_notification_delivery(
  target_notification_id uuid,
  target_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification public.homework_completion_notifications%rowtype;
  attempt public.homework_completion_notification_attempts%rowtype;
  frozen public.homework_completion_notification_payloads%rowtype;
  result jsonb;
  provider_started_at timestamptz;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  select * into notification from public.homework_completion_notifications
  where id = target_notification_id and status = 'claimed'
    and claim_token = target_claim_token and lease_expires_at > clock_timestamp()
  for update;
  if not found then return null; end if;

  select * into attempt from public.homework_completion_notification_attempts
  where notification_id = notification.id and claim_token = target_claim_token
    and status = 'claimed' and lease_expires_at > clock_timestamp()
  for update;
  if not found then return null; end if;

  if not attempt.is_manual_recovery and notification.attempt_count >= 5 then
    update public.homework_completion_notification_attempts
    set status = 'expired_before_start', error_category = 'automatic_attempt_limit_reached'
    where id = attempt.id and status = 'claimed';
    update public.homework_completion_notifications
    set status = 'failed', status_code = 'retry_limit_reached',
      claim_token = null, lease_expires_at = null, next_attempt_at = null,
      manual_recovery_pending = false,
      last_error_category = 'retry_limit_reached'
    where id = notification.id and status = 'claimed' and claim_token = target_claim_token;
    perform private.homework_completion_notification_log(
      notification.id, 'automatic_attempt_limit_reached', 'failed', 'retry_limit_reached'
    );
    return null;
  end if;

  select * into frozen from public.homework_completion_notification_payloads payload
  where payload.notification_id = notification.id
    and payload.provider_idempotency_key = attempt.provider_idempotency_key
    and payload.payload_kind = case when attempt.is_manual_recovery then 'manual_recovery' else 'automatic' end;
  if not found then return null; end if;
  provider_started_at := clock_timestamp();
  if not attempt.is_manual_recovery
    and notification.attempt_count > 0
    and frozen.first_provider_started_at is null then
    update public.homework_completion_notification_attempts
    set status = 'expired_before_start', error_category = 'provider_idempotency_cutoff_missing'
    where id = attempt.id and status = 'claimed';
    update public.homework_completion_notifications
    set status = 'failed', status_code = 'provider_idempotency_cutoff_missing',
      claim_token = null, lease_expires_at = null, next_attempt_at = null,
      manual_recovery_pending = false,
      last_error_category = 'provider_idempotency_cutoff_missing'
    where id = notification.id and status = 'claimed' and claim_token = target_claim_token;
    perform private.homework_completion_notification_log(
      notification.id, 'provider_idempotency_cutoff_missing', 'failed', 'provider_idempotency_cutoff_missing'
    );
    return null;
  end if;
  if frozen.idempotency_cutoff_at is not null
    and frozen.idempotency_cutoff_at <= provider_started_at then
    update public.homework_completion_notification_attempts
    set status = 'expired_before_start', error_category = 'provider_idempotency_window_expired'
    where id = attempt.id and status = 'claimed';
    update public.homework_completion_notifications
    set status = 'failed', status_code = 'provider_idempotency_window_expired',
      claim_token = null, lease_expires_at = null, next_attempt_at = null,
      manual_recovery_pending = false,
      last_error_category = 'provider_idempotency_window_expired'
    where id = notification.id and status = 'claimed' and claim_token = target_claim_token;
    perform private.homework_completion_notification_log(
      notification.id, 'provider_idempotency_window_expired', 'failed', 'provider_idempotency_window_expired'
    );
    return null;
  end if;

  if not private.homework_completion_recipient_snapshot_is_eligible(
      notification.counseling_case_id, notification.assignment_revision_id,
      attempt.recipient_assignment_id, attempt.recipient_group_id, attempt.recipient_profile_ids
    )
    or not exists (
      select 1 from public.case_sessions session
      where session.id = notification.case_session_id
        and session.counseling_case_id = notification.counseling_case_id
        and session.homework_assignment_revision_id = notification.assignment_revision_id
    )
    or (select count(*) from public.homework_participant_progress progress
      where progress.assignment_revision_id = notification.assignment_revision_id
        and progress.id = any(notification.partner_progress_ids)
        and progress.status in ('submitted', 'reviewed')
        and progress.submitted_at is not null) <> 2 then
    update public.homework_completion_notifications
    set status = 'cancelled', status_code = 'eligibility_lost_before_delivery',
      claim_token = null, lease_expires_at = null, next_attempt_at = null,
      manual_recovery_pending = false
    where id = notification.id;
    update public.homework_completion_notification_attempts
    set status = 'cancelled_before_start', error_category = 'eligibility_lost_before_delivery'
    where id = attempt.id;
    perform private.homework_completion_notification_log(
      notification.id, 'cancelled', 'cancelled', 'eligibility_lost_before_delivery'
    );
    return null;
  end if;

  if frozen.first_provider_started_at is null then
    update public.homework_completion_notification_payloads
    set first_provider_started_at = provider_started_at,
      idempotency_cutoff_at = provider_started_at + interval '23 hours'
    where id = frozen.id and first_provider_started_at is null
    returning * into frozen;
    if not found then return null; end if;
  end if;

  -- This is the durable provider-start boundary. A manual recovery is consumed
  -- here, never when it is requested, queued, or merely claimed.
  update public.homework_completion_notification_attempts
  set status = 'started', attempt_number = notification.attempt_count + 1,
    started_at = provider_started_at
  where id = attempt.id and status = 'claimed' and claim_token = target_claim_token
    and lease_expires_at > clock_timestamp();
  if not found then return null; end if;
  update public.homework_completion_notifications
  set attempt_count = attempt_count + 1,
    manual_recovery_pending = case when attempt.is_manual_recovery then false else manual_recovery_pending end,
    manual_recovery_used_at = case when attempt.is_manual_recovery then clock_timestamp() else manual_recovery_used_at end,
    manual_recovery_used_by = case when attempt.is_manual_recovery then manual_recovery_reserved_by else manual_recovery_used_by end
  where id = notification.id and status = 'claimed' and claim_token = target_claim_token
    and lease_expires_at > clock_timestamp();
  if not found then raise exception 'Worker lease expired before provider start'; end if;
  perform private.homework_completion_notification_log(
    notification.id, 'provider_attempt_started', 'claimed',
    case when attempt.is_manual_recovery then 'manual_recovery' else 'automatic' end,
    case when attempt.is_manual_recovery then notification.manual_recovery_reserved_by else null end
  );

  select jsonb_build_object(
    'attemptId', attempt.id,
    'notificationId', notification.id,
    'caseId', notification.counseling_case_id,
    'caseSessionId', notification.case_session_id,
    'assignmentRevisionId', notification.assignment_revision_id,
    'completionCycle', notification.completion_cycle,
    'partnerProgressIds', notification.partner_progress_ids,
    'recipientAssignmentId', attempt.recipient_assignment_id,
    'recipientGroupId', attempt.recipient_group_id,
    'recipientProfileIds', attempt.recipient_profile_ids,
    'idempotencyKey', attempt.provider_idempotency_key,
    'providerPayload', frozen.provider_payload,
    'idempotencyCutoffAt', frozen.idempotency_cutoff_at,
    'firstProviderStartedAt', frozen.first_provider_started_at,
    'attemptNumber', notification.attempt_count + 1,
    'manualRecovery', attempt.is_manual_recovery
  ) into result;
  return result;
end;
$$;
revoke all on function public.authorize_homework_completion_notification_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.authorize_homework_completion_notification_delivery(uuid, uuid) to service_role;

create or replace function private.homework_completion_notification_retry_delay(target_attempt_number integer)
returns interval
language sql
immutable
security definer
set search_path = ''
as $$
  select case target_attempt_number
    when 1 then interval '5 minutes'
    when 2 then interval '15 minutes'
    when 3 then interval '1 hour'
    when 4 then interval '6 hours'
    else null
  end;
$$;
revoke all on function private.homework_completion_notification_retry_delay(integer) from public, anon, authenticated, service_role;

create or replace function public.finish_homework_completion_notification_attempt(
  target_notification_id uuid,
  target_claim_token uuid,
  outcome text,
  target_provider_message_id text default null,
  error_category text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification public.homework_completion_notifications%rowtype;
  attempt public.homework_completion_notification_attempts%rowtype;
  next_status text;
  attempt_status text;
  next_due timestamptz;
  retry_delay interval;
  retry_cutoff timestamptz;
  detail text;
  updated_notification_id uuid;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if outcome not in ('accepted', 'delivered', 'rejected_retryable', 'rejected_permanent', 'skipped', 'uncertain') then raise exception 'Outcome is invalid'; end if;
  if error_category is not null and error_category !~ '^[a-z0-9_:-]{1,80}$' then raise exception 'Error category is invalid'; end if;
  select * into notification from public.homework_completion_notifications
  where id = target_notification_id and status = 'claimed' and claim_token = target_claim_token
    and lease_expires_at > clock_timestamp()
  for update;
  if not found then return null; end if;

  select * into attempt from public.homework_completion_notification_attempts
  where notification_id = target_notification_id and claim_token = target_claim_token
    and status = 'started' and lease_expires_at > clock_timestamp()
  for update;
  if not found then return null; end if;

  detail := error_category;
  attempt_status := outcome;
  if outcome = 'accepted' then
    next_status := 'sent';
  elsif outcome = 'rejected_retryable' then
    attempt_status := 'rejected_retryable';
    if attempt.is_manual_recovery then
      next_status := 'failed'; detail := coalesce(error_category, 'manual_recovery_attempt_failed');
    else
      retry_delay := private.homework_completion_notification_retry_delay(attempt.attempt_number);
      select payload.idempotency_cutoff_at into retry_cutoff
      from public.homework_completion_notification_payloads payload
      where payload.notification_id = notification.id
        and payload.provider_idempotency_key = attempt.provider_idempotency_key;
      if retry_delay is null then
        next_status := 'failed'; detail := coalesce(error_category, 'retry_limit_reached');
      else
        next_due := clock_timestamp() + retry_delay;
        if retry_cutoff is null or next_due >= retry_cutoff then
          next_status := 'failed';
          next_due := null;
          detail := 'provider_idempotency_window_expired';
        else
          next_status := 'pending';
        end if;
      end if;
    end if;
  elsif outcome = 'rejected_permanent' then
    next_status := 'failed';
  else
    next_status := outcome;
  end if;

  update public.homework_completion_notifications as current_notification
  set status = next_status,
    status_code = detail,
    next_attempt_at = next_due,
    claim_token = null,
    lease_expires_at = null,
    provider_message_id = coalesce(current_notification.provider_message_id, target_provider_message_id),
    last_error_category = case when next_status in ('pending', 'failed', 'uncertain') then detail else null end,
    sent_at = case when next_status in ('sent', 'delivered') then coalesce(sent_at, clock_timestamp()) else sent_at end,
    delivered_at = case when next_status = 'delivered' then coalesce(delivered_at, clock_timestamp()) else delivered_at end,
    manual_recovery_pending = false
  where id = target_notification_id and status = 'claimed'
    and claim_token = target_claim_token and lease_expires_at > clock_timestamp()
  returning id into updated_notification_id;
  if updated_notification_id is null then return null; end if;
  update public.homework_completion_notification_attempts
  set status = attempt_status, completed_at = clock_timestamp(),
    provider_message_id = target_provider_message_id, error_category = detail
  where id = attempt.id and status = 'started' and lease_expires_at > clock_timestamp();
  if not found then raise exception 'Worker lease expired before outcome finalization'; end if;
  perform private.homework_completion_notification_log(
    target_notification_id,
    case when next_status = 'pending' then 'retry_scheduled' else 'provider_' || attempt_status end,
    next_status, detail
  );
  return next_status;
end;
$$;
revoke all on function public.finish_homework_completion_notification_attempt(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_homework_completion_notification_attempt(uuid, uuid, text, text, text) to service_role;

-- This is an outcome-only path for provider evidence not recorded by the valid
-- leased finalizer. It never queues or sends; canceled parent cycles stay terminal.
create or replace function public.reconcile_homework_completion_notification_attempt(
  target_attempt_id uuid,
  provider_outcome text,
  target_provider_message_id text default null,
  target_provider_event_id text default null,
  target_error_category text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.homework_completion_notification_attempts%rowtype;
  notification public.homework_completion_notifications%rowtype;
  existing_evidence public.homework_completion_notification_provider_evidence%rowtype;
  attempt_notification_id uuid;
  evidence_id bigint;
  evidence_key text;
  next_attempt_status text;
  next_parent_status text;
  next_detail text;
  frozen public.homework_completion_notification_payloads%rowtype;
  retry_delay interval;
  retry_due timestamptz;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if provider_outcome not in ('accepted', 'delivered', 'rejected_retryable', 'rejected_permanent', 'uncertain', 'bounced') then
    raise exception 'Provider outcome is invalid';
  end if;
  if target_error_category is not null and target_error_category !~ '^[a-z0-9_:-]{1,80}$' then raise exception 'Error category is invalid'; end if;
  if target_provider_event_id is not null and btrim(target_provider_event_id) = '' then raise exception 'Provider event ID is invalid'; end if;
  if target_provider_message_id is not null and btrim(target_provider_message_id) = '' then raise exception 'Provider message ID is invalid'; end if;
  if nullif(btrim(target_provider_event_id), '') is null and nullif(btrim(target_provider_message_id), '') is null then
    raise exception 'Provider evidence identifier is required';
  end if;
  evidence_key := case when nullif(btrim(target_provider_event_id), '') is not null
    then 'event:' || btrim(target_provider_event_id)
    else 'message:' || btrim(target_provider_message_id) end;

  select notification_id into attempt_notification_id from public.homework_completion_notification_attempts
  where id = target_attempt_id and status in (
    'started', 'uncertain', 'accepted', 'delivered', 'bounced', 'rejected_retryable', 'rejected_permanent'
  );
  if attempt_notification_id is null then return null; end if;
  select * into notification from public.homework_completion_notifications
  where id = attempt_notification_id for update;
  select * into attempt from public.homework_completion_notification_attempts
  where id = target_attempt_id and notification_id = attempt_notification_id
    and status in ('started', 'uncertain', 'accepted', 'delivered', 'bounced', 'rejected_retryable', 'rejected_permanent')
  for update;
  if not found then return null; end if;

  select * into existing_evidence from public.homework_completion_notification_provider_evidence
  where provider_name = 'resend' and evidence_identifier = evidence_key;
  if found then
    if existing_evidence.attempt_id is distinct from attempt.id
      or existing_evidence.event_id is distinct from nullif(btrim(target_provider_event_id), '')
      or existing_evidence.message_id is distinct from nullif(btrim(target_provider_message_id), '')
      or existing_evidence.outcome is distinct from provider_outcome
      or existing_evidence.error_category is distinct from target_error_category then
      raise exception 'Conflicting provider evidence replay';
    end if;
    return notification.status;
  end if;

  if (attempt.status = 'started' and notification.status not in ('claimed', 'uncertain', 'cancelled'))
    or (attempt.status = 'uncertain' and notification.status not in ('uncertain', 'cancelled'))
    or (attempt.status in ('rejected_retryable', 'rejected_permanent'))
    or (attempt.status = 'accepted' and provider_outcome not in ('accepted', 'delivered', 'bounced'))
    or (attempt.status = 'delivered' and provider_outcome <> 'delivered')
    or (attempt.status = 'bounced' and provider_outcome <> 'bounced')
    or (attempt.status in ('started', 'uncertain') and provider_outcome in ('delivered', 'bounced')
      and notification.status not in ('claimed', 'uncertain', 'cancelled', 'sent')) then
    raise exception 'Provider evidence outcome progression is invalid';
  end if;

  insert into public.homework_completion_notification_provider_evidence(
    attempt_id, provider_name, evidence_identifier, event_id, message_id, outcome, error_category
  ) values (
    attempt.id, 'resend', evidence_key, nullif(btrim(target_provider_event_id), ''),
    nullif(btrim(target_provider_message_id), ''), provider_outcome, target_error_category
  ) on conflict (provider_name, evidence_identifier) do nothing
  returning id into evidence_id;
  if evidence_id is null then
    select * into existing_evidence from public.homework_completion_notification_provider_evidence
    where provider_name = 'resend' and evidence_identifier = evidence_key;
    if existing_evidence.attempt_id is distinct from attempt.id
      or existing_evidence.event_id is distinct from nullif(btrim(target_provider_event_id), '')
      or existing_evidence.message_id is distinct from nullif(btrim(target_provider_message_id), '')
      or existing_evidence.outcome is distinct from provider_outcome
      or existing_evidence.error_category is distinct from target_error_category then
      raise exception 'Conflicting provider evidence replay';
    end if;
    return notification.status;
  end if;

  next_attempt_status := case
    when attempt.status in ('started', 'uncertain') then provider_outcome
    when attempt.status = 'accepted' and provider_outcome in ('delivered', 'bounced') then provider_outcome
    else attempt.status
  end;
  update public.homework_completion_notification_attempts
  set status = next_attempt_status,
    completed_at = coalesce(completed_at, clock_timestamp()),
    provider_message_id = coalesce(provider_message_id, nullif(btrim(target_provider_message_id), '')),
    error_category = coalesce(target_error_category, error_category)
  where id = attempt.id;

  -- Provider evidence may resolve an expired/uncertain cycle, but cannot undo
  -- cancellation or make a previously canceled notification sendable again.
  if notification.status = 'cancelled' then
    next_parent_status := 'cancelled';
  elsif provider_outcome = 'delivered' and notification.status in ('claimed', 'uncertain', 'sent') then
    next_parent_status := 'delivered';
  elsif provider_outcome = 'accepted' and notification.status in ('claimed', 'uncertain') then
    next_parent_status := 'sent';
  elsif provider_outcome = 'uncertain' and notification.status in ('claimed', 'uncertain') then
    next_parent_status := 'uncertain';
  elsif provider_outcome = 'rejected_retryable' and notification.status in ('claimed', 'uncertain') then
    if attempt.is_manual_recovery then
      next_parent_status := 'failed';
      next_detail := 'manual_recovery_attempt_failed';
    else
      retry_delay := private.homework_completion_notification_retry_delay(attempt.attempt_number);
      select * into frozen from public.homework_completion_notification_payloads payload
      where payload.notification_id = notification.id
        and payload.provider_idempotency_key = attempt.provider_idempotency_key;
      if retry_delay is null then
        next_parent_status := 'failed';
        next_detail := 'retry_limit_reached';
      elsif frozen.id is null or frozen.idempotency_cutoff_at is null then
        next_parent_status := 'failed';
        next_detail := 'provider_idempotency_cutoff_missing';
      else
        retry_due := clock_timestamp() + retry_delay;
        if retry_due >= frozen.idempotency_cutoff_at then
          next_parent_status := 'failed';
          next_detail := 'provider_idempotency_window_expired';
        elsif not private.homework_completion_recipient_is_eligible(notification.id)
          or not exists (
            select 1 from public.case_sessions session
            where session.id = notification.case_session_id
              and session.counseling_case_id = notification.counseling_case_id
              and session.homework_assignment_revision_id = notification.assignment_revision_id
          )
          or (select count(*) from public.homework_participant_progress progress
            where progress.assignment_revision_id = notification.assignment_revision_id
              and progress.id = any(notification.partner_progress_ids)
              and progress.status in ('submitted', 'reviewed')
              and progress.submitted_at is not null) <> 2 then
          next_parent_status := 'cancelled';
          next_detail := 'eligibility_lost_before_retry';
        else
          next_parent_status := 'pending';
          next_detail := 'reconciled_transient_rejection';
        end if;
      end if;
    end if;
  elsif provider_outcome in ('rejected_permanent', 'bounced')
    and notification.status in ('claimed', 'uncertain', 'sent') then
    next_parent_status := 'failed';
  else
    next_parent_status := notification.status;
  end if;

  if notification.status <> 'cancelled' and next_parent_status is distinct from notification.status then
    next_detail := case
      when next_parent_status = 'pending' then coalesce(next_detail, 'reconciled_transient_rejection')
      when next_parent_status = 'cancelled' then coalesce(next_detail, 'eligibility_lost_before_retry')
      when next_parent_status = 'failed' then coalesce(next_detail, target_error_category, 'provider_rejection_reconciled')
      when provider_outcome = 'bounced' then 'provider_bounced'
      when provider_outcome = 'uncertain' then 'provider_outcome_uncertain'
      else 'provider_outcome_reconciled'
    end;
    update public.homework_completion_notifications
    set status = next_parent_status, status_code = next_detail,
      claim_token = null, lease_expires_at = null,
      next_attempt_at = case when next_parent_status = 'pending' then retry_due else null end,
      provider_message_id = coalesce(provider_message_id, nullif(btrim(target_provider_message_id), '')),
      sent_at = case when next_parent_status in ('sent', 'delivered') then coalesce(sent_at, clock_timestamp()) else sent_at end,
      delivered_at = case when next_parent_status = 'delivered' then coalesce(delivered_at, clock_timestamp()) else delivered_at end,
      manual_recovery_pending = case when next_parent_status in ('sent', 'delivered', 'uncertain', 'failed', 'cancelled') then false else manual_recovery_pending end,
      last_error_category = case
        when next_parent_status = 'pending' then target_error_category
        when next_parent_status = 'failed' then coalesce(target_error_category, next_detail)
        else last_error_category
      end
    where id = notification.id;
  end if;

  perform private.homework_completion_notification_log(
    notification.id, 'provider_outcome_reconciled', next_parent_status,
    case when next_parent_status = 'cancelled' then 'outcome_recorded_after_cancellation' else 'provider_evidence' end,
    null, evidence_key
  );
  return next_parent_status;
end;
$$;
revoke all on function public.reconcile_homework_completion_notification_attempt(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.reconcile_homework_completion_notification_attempt(uuid, text, text, text, text) to service_role;

create or replace function public.request_homework_completion_notification_recovery(target_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification public.homework_completion_notifications%rowtype;
  recovered_assignment_id uuid;
  recovered_group_id uuid;
  recovered_profile_ids uuid[] := '{}'::uuid[];
  confirmed_provider_rejection boolean := false;
  confirmed_pre_delivery_email_failure boolean := false;
begin
  if auth.uid() is null or not private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select * into notification from public.homework_completion_notifications
  where id = target_notification_id for update;
  if found and notification.attempt_count > 0 then
    select (select count(*) from public.homework_completion_notification_attempts attempt
      where attempt.notification_id = notification.id and attempt.attempt_number is not null) = notification.attempt_count
      and exists (
      select 1 from public.homework_completion_notification_attempts attempt
      where attempt.notification_id = notification.id and attempt.attempt_number is not null
    ) and not exists (
      select 1 from public.homework_completion_notification_attempts attempt
      where attempt.notification_id = notification.id
        and ((attempt.attempt_number is not null
            and attempt.status not in ('rejected_retryable', 'rejected_permanent'))
          or (attempt.attempt_number is null
            and attempt.status not in ('rejected_before_start', 'expired_before_start', 'cancelled_before_start')))
    ) into confirmed_provider_rejection;
  elsif found and notification.attempt_count = 0 then
    select count(*) = 1 and bool_and(attempt.status = 'rejected_before_start'
      and attempt.error_category in ('recipient_email_missing', 'recipient_email_invalid'))
    into confirmed_pre_delivery_email_failure
    from public.homework_completion_notification_attempts attempt
    where attempt.notification_id = notification.id;
  end if;
  if not found or notification.status <> 'failed'
    or notification.manual_recovery_reserved_at is not null
    or notification.manual_recovery_used_at is not null
    or not (confirmed_provider_rejection or confirmed_pre_delivery_email_failure)
    or (select count(*) from public.homework_participant_progress progress
      where progress.assignment_revision_id = notification.assignment_revision_id
        and progress.id = any(notification.partner_progress_ids)
        and progress.status in ('submitted', 'reviewed')
        and progress.submitted_at is not null) <> 2 then
    return false;
  end if;

  -- Recovery derives its candidate payload from the currently assigned active
  -- Counselor-of-record. Callers cannot supply arbitrary recipient identities.
  select assignment.id, team.id,
    coalesce(array_agg(member.profile_id order by member.profile_id), '{}'::uuid[])
  into recovered_assignment_id, recovered_group_id, recovered_profile_ids
  from public.case_assignments assignment
  join public.groups team on team.id = assignment.assigned_group_id and team.active
    and team.group_type in ('counselor_team', 'coach_team', 'campus_lead_team')
  join public.group_members member on member.group_id = team.id and member.ended_at is null
  join public.profiles profile on profile.id = member.profile_id and profile.status = 'active'
  join public.profile_roles role_map on role_map.profile_id = profile.id
    and role_map.role = case team.group_type
      when 'counselor_team' then 'counselor'::public.app_role
      when 'coach_team' then 'coach'::public.app_role
      when 'campus_lead_team' then 'campus_lead'::public.app_role
    end
  where assignment.counseling_case_id = notification.counseling_case_id
    and assignment.assignment_type = 'counselor' and assignment.ended_at is null
    and (select count(*) from public.case_assignments active_assignment
      where active_assignment.counseling_case_id = notification.counseling_case_id
        and active_assignment.assignment_type = 'counselor' and active_assignment.ended_at is null) = 1
  group by assignment.id, team.id
  having count(*) = 2
    and (select count(*) from public.group_members active_member
      where active_member.group_id = team.id and active_member.ended_at is null) = 2;
  if recovered_assignment_id is null or cardinality(recovered_profile_ids) <> 2
    or not private.homework_completion_recipient_snapshot_is_eligible(
      notification.counseling_case_id, notification.assignment_revision_id,
      recovered_assignment_id, recovered_group_id, recovered_profile_ids
    )
    or (select count(*) from public.profiles profile
      where profile.id = any(recovered_profile_ids)
        and profile.email is not null
        and lower(btrim(profile.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') <> 2 then
    return false;
  end if;

  update public.homework_completion_notifications
  set status = 'pending', status_code = 'manual_recovery_requested',
    next_attempt_at = clock_timestamp(), claim_token = null, lease_expires_at = null,
    manual_recovery_reserved_at = clock_timestamp(), manual_recovery_reserved_by = auth.uid(),
    manual_recovery_recipient_assignment_id = recovered_assignment_id,
    manual_recovery_recipient_group_id = recovered_group_id,
    manual_recovery_recipient_profile_ids = recovered_profile_ids,
    manual_recovery_idempotency_key = notification.provider_idempotency_key || '/manual-recovery/1',
    manual_recovery_pending = true
  where id = target_notification_id;
  perform private.homework_completion_notification_log(
    target_notification_id, 'manual_recovery_requested', 'pending',
    case when recovered_profile_ids is distinct from notification.recipient_profile_ids
      or recovered_assignment_id is distinct from notification.recipient_assignment_id
      or recovered_group_id is distinct from notification.recipient_group_id
      then 'single_audited_recovery_recipient_corrected' else 'single_audited_recovery' end,
    auth.uid()
  );
  return true;
end;
$$;
revoke all on function public.request_homework_completion_notification_recovery(uuid) from public, anon;
grant execute on function public.request_homework_completion_notification_recovery(uuid) to authenticated;
