-- Recipient-scoped delivery state. The notification row remains the single
-- immutable completion-cycle identity; each assigned Counselor gets an
-- independently leased, retried, and reconciled delivery.

create table public.homework_completion_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.homework_completion_notifications(id) on delete restrict,
  recipient_assignment_id uuid not null references public.case_assignments(id) on delete restrict,
  recipient_group_id uuid not null references public.groups(id) on delete restrict,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null check (status in ('pending','claimed','sent','delivered','failed','blocked','skipped','cancelled','uncertain')),
  status_code text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  claim_sequence integer not null default 0 check (claim_sequence >= 0),
  next_attempt_at timestamptz,
  claim_token uuid unique,
  lease_expires_at timestamptz,
  provider_idempotency_key text not null unique,
  provider_message_id text,
  last_error_category text,
  manual_recovery_reserved_at timestamptz,
  manual_recovery_reserved_by uuid references public.profiles(id) on delete restrict,
  manual_recovery_used_at timestamptz,
  manual_recovery_used_by uuid references public.profiles(id) on delete restrict,
  manual_recovery_pending boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint homework_completion_delivery_per_recipient unique (notification_id, recipient_profile_id),
  constraint homework_completion_delivery_notification_pair_unique unique (notification_id, id),
  constraint homework_completion_delivery_claim_shape check ((status = 'claimed') = (claim_token is not null and lease_expires_at is not null)),
  constraint homework_completion_delivery_schedule_shape check ((status = 'pending') = (next_attempt_at is not null)),
  constraint homework_completion_delivery_recovery_shape check (
    (manual_recovery_reserved_at is null) = (manual_recovery_reserved_by is null)
    and (manual_recovery_used_at is null) = (manual_recovery_used_by is null)
    and (manual_recovery_used_at is null or manual_recovery_reserved_at is not null)
    and (not manual_recovery_pending or (manual_recovery_reserved_at is not null and manual_recovery_used_at is null))
  )
);
create index homework_completion_notification_deliveries_due_idx
  on public.homework_completion_notification_deliveries(next_attempt_at, created_at)
  where status = 'pending';
create index homework_completion_notification_deliveries_recipient_idx
  on public.homework_completion_notification_deliveries(recipient_profile_id, status);
alter table public.homework_completion_notification_deliveries enable row level security;
revoke all on public.homework_completion_notification_deliveries from public, anon, authenticated, service_role;

alter table public.homework_completion_notifications
  drop constraint homework_completion_notification_recipient_ids_valid,
  drop constraint homework_completion_notification_recipient_shape;
alter table public.homework_completion_notifications
  add constraint homework_completion_notification_recipient_ids_valid check (
    cardinality(recipient_profile_ids) between 0 and 2
    and (cardinality(recipient_profile_ids) < 2 or recipient_profile_ids[1] <> recipient_profile_ids[2])
  ),
  add constraint homework_completion_notification_recipient_shape check (
    (status in ('pending','claimed','sent','delivered','uncertain')
      and recipient_assignment_id is not null and recipient_group_id is not null
      and cardinality(recipient_profile_ids) between 1 and 2)
    or status in ('failed','blocked','skipped','cancelled')
  );

alter table public.homework_completion_notification_attempts
  add column delivery_id uuid references public.homework_completion_notification_deliveries(id) on delete restrict;
alter table public.homework_completion_notification_attempts
  add constraint homework_completion_attempt_delivery_cycle_fk foreign key (notification_id, delivery_id)
  references public.homework_completion_notification_deliveries(notification_id, id) on delete restrict;
alter table public.homework_completion_notification_attempts
  drop constraint homework_completion_notification_attempt_recipient_ids_valid;
alter table public.homework_completion_notification_attempts
  add constraint homework_completion_notification_attempt_recipient_ids_valid check (
    (delivery_id is null and cardinality(recipient_profile_ids) = 2 and recipient_profile_ids[1] <> recipient_profile_ids[2])
    or (delivery_id is not null and cardinality(recipient_profile_ids) = 1)
  );
alter table public.homework_completion_notification_attempts
  drop constraint homework_completion_notification_attempt_claim_unique,
  drop constraint homework_completion_notification_attempt_number_unique;
create unique index homework_completion_notification_attempt_claim_unique
  on public.homework_completion_notification_attempts(coalesce(delivery_id, notification_id), claim_sequence);
create unique index homework_completion_notification_attempt_number_unique
  on public.homework_completion_notification_attempts(coalesce(delivery_id, notification_id), attempt_number)
  where attempt_number is not null;

alter table public.homework_completion_notification_payloads
  add column delivery_id uuid references public.homework_completion_notification_deliveries(id) on delete restrict;
alter table public.homework_completion_notification_payloads
  add constraint homework_completion_payload_delivery_cycle_fk foreign key (notification_id, delivery_id)
  references public.homework_completion_notification_deliveries(notification_id, id) on delete restrict;
alter table public.homework_completion_notification_payloads
  drop constraint homework_completion_notification_payload_kind_unique;
create unique index homework_completion_notification_payload_cycle_kind_unique
  on public.homework_completion_notification_payloads(notification_id, payload_kind)
  where delivery_id is null;
create unique index homework_completion_notification_payload_delivery_kind_unique
  on public.homework_completion_notification_payloads(delivery_id, payload_kind)
  where delivery_id is not null;

alter table public.homework_completion_notification_events
  add column delivery_id uuid references public.homework_completion_notification_deliveries(id) on delete restrict;
create index homework_completion_notification_events_delivery_history_idx
  on public.homework_completion_notification_events(delivery_id, created_at, id) where delivery_id is not null;
create or replace function private.homework_completion_recipient_delivery_log(
  target_notification_id uuid, target_delivery_id uuid, target_event_type text,
  target_status text, target_detail_code text default null, target_actor uuid default null,
  target_provider_event_id text default null
) returns void language sql security definer set search_path = '' as $$
  insert into public.homework_completion_notification_events(
    notification_id, delivery_id, event_type, resulting_status, attempt_number,
    actor_profile_id, detail_code, provider_event_id
  )
  select notification.id, delivery.id, target_event_type, target_status, delivery.attempt_count,
    target_actor, target_detail_code, target_provider_event_id
  from public.homework_completion_notifications notification
  join public.homework_completion_notification_deliveries delivery on delivery.notification_id=notification.id
  where notification.id=target_notification_id and delivery.id=target_delivery_id
  on conflict(provider_event_id) do nothing;
$$;
revoke all on function private.homework_completion_recipient_delivery_log(uuid,uuid,text,text,text,uuid,text) from public, anon, authenticated, service_role;

create or replace function private.homework_completion_delivery_is_eligible(target_delivery_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.homework_completion_notification_deliveries delivery
    join public.homework_completion_notifications notification on notification.id = delivery.notification_id
    join public.case_assignments assignment on assignment.id = delivery.recipient_assignment_id
      and assignment.counseling_case_id = notification.counseling_case_id
      and assignment.assignment_type = 'counselor' and assignment.ended_at is null
    join public.groups team on team.id = delivery.recipient_group_id
      and team.id = assignment.assigned_group_id and team.active
      and team.group_type in ('counselor_team','coach_team','campus_lead_team')
    join public.group_members member on member.group_id = team.id
      and member.profile_id = delivery.recipient_profile_id and member.ended_at is null
    join public.profiles profile on profile.id = member.profile_id and profile.status = 'active'
    join public.profile_roles role_map on role_map.profile_id = profile.id
      and role_map.role = case team.group_type
        when 'counselor_team' then 'counselor'::public.app_role
        when 'coach_team' then 'coach'::public.app_role
        when 'campus_lead_team' then 'campus_lead'::public.app_role end
    join public.homework_assignment_revisions revision on revision.id = notification.assignment_revision_id and revision.ended_at is null
    join public.homework_assignments homework on homework.id = revision.homework_assignment_id and homework.unassigned_at is null
    where delivery.id = target_delivery_id
      and (select count(*) from public.case_assignments current_assignment
        where current_assignment.counseling_case_id = notification.counseling_case_id
          and current_assignment.assignment_type = 'counselor' and current_assignment.ended_at is null) = 1
      and (select count(*) from public.group_members active_member
        where active_member.group_id = team.id and active_member.ended_at is null) = 2
      and (select count(*) from public.homework_participant_progress progress
        where progress.assignment_revision_id = notification.assignment_revision_id
          and progress.id = any(notification.partner_progress_ids)
          and progress.status in ('submitted','reviewed') and progress.submitted_at is not null) = 2
      and not exists (
        select 1 from public.homework_completion_notification_payloads payload
        where payload.delivery_id = delivery.id
          and payload.provider_payload -> 'to' is distinct from jsonb_build_array(lower(btrim(profile.email)))
      )
  );
$$;
revoke all on function private.homework_completion_delivery_is_eligible(uuid) from public, anon, authenticated, service_role;

create or replace function private.refresh_homework_completion_notification_status(target_notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare next_status text; next_due timestamptz; detail text;
begin
  select case
    when bool_and(status = 'delivered') then 'delivered'
    when bool_or(status in ('pending','claimed')) then 'pending'
    when bool_or(status = 'uncertain') then 'uncertain'
    when bool_or(status = 'failed') then 'failed'
    when bool_or(status in ('sent','delivered')) then 'sent'
    when bool_and(status = 'cancelled') then 'cancelled'
    when bool_and(status = 'blocked') then 'blocked'
    when bool_and(status in ('failed','blocked','skipped','cancelled')) then 'failed'
    else 'blocked' end,
    min(next_attempt_at) filter (where status = 'pending')
  into next_status, next_due
  from public.homework_completion_notification_deliveries
  where notification_id = target_notification_id;
  detail := case when next_status = 'failed' and exists (
    select 1 from public.homework_completion_notification_deliveries
    where notification_id = target_notification_id and status = 'delivered'
  ) or (next_status = 'failed' and exists (
    select 1 from public.homework_completion_notification_deliveries
    where notification_id = target_notification_id and status = 'sent'
  )) then 'partial_delivery_failure' else null end;
  update public.homework_completion_notifications notification
  set status = next_status, status_code = detail,
      next_attempt_at = case when next_status = 'pending' then coalesce(next_due, clock_timestamp()) else null end,
      claim_token = null, lease_expires_at = null,
      sent_at = case when next_status in ('sent','delivered','failed') and exists (
        select 1 from public.homework_completion_notification_deliveries delivery
        where delivery.notification_id = notification.id and delivery.status in ('sent','delivered')
      ) then coalesce(sent_at, clock_timestamp()) else sent_at end,
      delivered_at = case when next_status = 'delivered' then coalesce(delivered_at, clock_timestamp()) else delivered_at end
  where notification.id = target_notification_id and notification.status <> 'cancelled';
end;
$$;
revoke all on function private.refresh_homework_completion_notification_status(uuid) from public, anon, authenticated, service_role;

create or replace function private.seed_homework_completion_deliveries()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    insert into public.homework_completion_notification_deliveries(
      notification_id, recipient_assignment_id, recipient_group_id, recipient_profile_id,
      status, next_attempt_at, provider_idempotency_key
    )
    select new.id, new.recipient_assignment_id, new.recipient_group_id, eligible.profile_id,
      'pending', clock_timestamp(), new.provider_idempotency_key || '/recipient/' || eligible.profile_id::text
    from unnest(new.recipient_profile_ids) as eligible(profile_id)
    where private.homework_completion_delivery_profile_is_eligible(
      new.counseling_case_id, new.assignment_revision_id,
      new.recipient_assignment_id, new.recipient_group_id, eligible.profile_id
    )
    on conflict (notification_id, recipient_profile_id) do nothing;
    if not exists (select 1 from public.homework_completion_notification_deliveries where notification_id = new.id) then
      update public.homework_completion_notifications set status = 'blocked', status_code = 'no_eligible_counselor', next_attempt_at = null where id = new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.seed_homework_completion_deliveries() from public, anon, authenticated, service_role;

create or replace function private.homework_completion_delivery_profile_is_eligible(
  target_case_id uuid, target_revision_id uuid, target_assignment_id uuid, target_group_id uuid, target_profile_id uuid
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.case_assignments assignment
    join public.groups team on team.id = assignment.assigned_group_id and team.id = target_group_id and team.active
      and team.group_type in ('counselor_team','coach_team','campus_lead_team')
    join public.group_members member on member.group_id = team.id and member.profile_id = target_profile_id and member.ended_at is null
    join public.profiles profile on profile.id = member.profile_id and profile.status = 'active'
    join public.profile_roles role_map on role_map.profile_id = profile.id
      and role_map.role = case team.group_type when 'counselor_team' then 'counselor'::public.app_role
        when 'coach_team' then 'coach'::public.app_role when 'campus_lead_team' then 'campus_lead'::public.app_role end
    where assignment.id = target_assignment_id and assignment.counseling_case_id = target_case_id
      and assignment.assignment_type = 'counselor' and assignment.ended_at is null
      and (select count(*) from public.case_assignments current_assignment where current_assignment.counseling_case_id = target_case_id
        and current_assignment.assignment_type = 'counselor' and current_assignment.ended_at is null) = 1
      and (select count(*) from public.group_members active_member
        where active_member.group_id = team.id and active_member.ended_at is null) = 2
      and exists (select 1 from public.homework_assignment_revisions revision join public.homework_assignments homework
        on homework.id = revision.homework_assignment_id where revision.id = target_revision_id
        and revision.ended_at is null and homework.unassigned_at is null)
  );
$$;
revoke all on function private.homework_completion_delivery_profile_is_eligible(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;

create trigger seed_homework_completion_notification_deliveries
after insert on public.homework_completion_notifications
for each row execute function private.seed_homework_completion_deliveries();

-- A valid assigned team may have one or two currently eligible members. Each
-- eligible member receives a row; no eligible member produces a blocked cycle.
create or replace function private.enqueue_homework_completion_notification(target_progress_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target_session_id uuid; target_case_id uuid; target_revision_id uuid; couple_group_id uuid;
  progress_ids uuid[]; couple_profile_ids uuid[]; completion_number integer;
  eligible_assignment_id uuid; eligible_group_id uuid; eligible_profile_ids uuid[] := '{}'::uuid[];
  new_notification_id uuid := gen_random_uuid(); inserted_id uuid; initial_status text; initial_code text;
begin
  select session.id, assignment.counseling_case_id, revision.id, counseling_case.couple_group_id
  into target_session_id, target_case_id, target_revision_id, couple_group_id
  from public.homework_participant_progress progress
  join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
  join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
  join public.case_sessions session on session.homework_assignment_revision_id = revision.id
    and session.counseling_case_id = assignment.counseling_case_id
  join public.counseling_cases counseling_case on counseling_case.id = assignment.counseling_case_id
  where progress.id = target_progress_id and assignment.unassigned_at is null and revision.ended_at is null;
  if target_session_id is null then return null; end if;
  select coalesce(array_agg(member.profile_id order by member.profile_id), '{}'::uuid[]) into couple_profile_ids
  from public.group_members member where member.group_id = couple_group_id and member.ended_at is null;
  if cardinality(couple_profile_ids) <> 2 then return null; end if;
  select coalesce(array_agg(progress.id order by progress.profile_id), '{}'::uuid[]) into progress_ids
  from public.homework_participant_progress progress where progress.assignment_revision_id = target_revision_id
    and progress.profile_id = any(couple_profile_ids) and progress.status in ('submitted','reviewed');
  if cardinality(progress_ids) <> 2
    or (select count(*) from public.homework_participant_progress progress where progress.assignment_revision_id = target_revision_id) <> 2
    or exists (select 1 from public.homework_participant_progress progress where progress.assignment_revision_id = target_revision_id
      and progress.profile_id = any(couple_profile_ids) and progress.status not in ('submitted','reviewed')) then return null; end if;

  -- The submission RPC already locks this Session before locking Homework
  -- progress. Reacquiring the same row here makes cycle numbering safe for
  -- every caller of this private enqueue path as well.
  perform 1 from public.case_sessions session where session.id = target_session_id for update;

  if (select count(*) from public.case_assignments assignment where assignment.counseling_case_id = target_case_id
      and assignment.assignment_type = 'counselor' and assignment.ended_at is null) = 1 then
    select assignment.id, team.id,
      coalesce(array_agg(profile.id order by profile.id) filter (where role_map.profile_id is not null), '{}'::uuid[])
    into eligible_assignment_id, eligible_group_id, eligible_profile_ids
    from public.case_assignments assignment
    join public.groups team on team.id = assignment.assigned_group_id and team.active
      and team.group_type in ('counselor_team','coach_team','campus_lead_team')
    left join public.group_members member on member.group_id = team.id and member.ended_at is null
    left join public.profiles profile on profile.id = member.profile_id and profile.status = 'active'
    left join public.profile_roles role_map on role_map.profile_id = profile.id
      and role_map.role = case team.group_type when 'counselor_team' then 'counselor'::public.app_role
        when 'coach_team' then 'coach'::public.app_role when 'campus_lead_team' then 'campus_lead'::public.app_role end
    where assignment.counseling_case_id = target_case_id and assignment.assignment_type = 'counselor'
      and assignment.ended_at is null
    group by assignment.id, team.id
    having count(profile.id) filter (where role_map.profile_id is not null) between 1 and 2
      and (select count(*) from public.group_members active_member
        where active_member.group_id = team.id and active_member.ended_at is null) = 2;
  end if;

  select coalesce(max(notification.completion_cycle), 0) + 1 into completion_number
  from public.homework_completion_notifications notification where notification.case_session_id = target_session_id;
  if eligible_assignment_id is null or cardinality(eligible_profile_ids) not between 1 and 2 then
    initial_status := 'blocked'; initial_code := 'no_eligible_counselor';
    eligible_profile_ids := '{}'::uuid[]; eligible_group_id := null; eligible_assignment_id := null;
  else initial_status := 'pending'; initial_code := null; end if;

  insert into public.homework_completion_notifications(
    id, case_session_id, counseling_case_id, assignment_revision_id, completion_cycle,
    partner_progress_ids, recipient_assignment_id, recipient_group_id, recipient_profile_ids,
    status, status_code, next_attempt_at, provider_idempotency_key
  ) values (
    new_notification_id, target_session_id, target_case_id, target_revision_id, completion_number,
    progress_ids, eligible_assignment_id, eligible_group_id, eligible_profile_ids, initial_status,
    initial_code, case when initial_status = 'pending' then clock_timestamp() end,
    'homework-completion-cycle/' || new_notification_id::text
  ) returning id into inserted_id;
  perform private.homework_completion_notification_log(inserted_id,
    case when initial_status = 'pending' then 'queued' else 'blocked' end, initial_status, initial_code, auth.uid());
  return inserted_id;
end;
$$;
revoke all on function private.enqueue_homework_completion_notification(uuid) from public, anon, authenticated;

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
      update public.homework_completion_notification_attempts set status = 'uncertain', completed_at = clock_timestamp(), error_category = 'worker_lease_expired'
        where delivery_id = expired.id and claim_token = expired.claim_token and status = 'started';
      update public.homework_completion_notification_deliveries set status = 'uncertain', status_code = 'worker_lease_expired',
        claim_token = null, lease_expires_at = null, next_attempt_at = null, manual_recovery_pending = false where id = expired.id;
    else
      update public.homework_completion_notification_attempts set status = 'expired_before_start', error_category = 'worker_lease_expired_before_start'
        where delivery_id = expired.id and claim_token = expired.claim_token and status = 'claimed';
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

-- The worker receives only the claimed recipient's display context and never
-- reads the private delivery, attempt, payload, or evidence tables directly.
create or replace function public.get_homework_completion_recipient_delivery_context(
  target_notification_id uuid, target_delivery_id uuid, target_claim_token uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare notification public.homework_completion_notifications%rowtype;
  delivery public.homework_completion_notification_deliveries%rowtype;
  session public.case_sessions%rowtype;
  couple_group uuid;
  recipient_email text;
  partners jsonb;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  select * into notification from public.homework_completion_notifications
    where id=target_notification_id and status<>'cancelled';
  if not found then return null; end if;
  select * into delivery from public.homework_completion_notification_deliveries
    where id=target_delivery_id and notification_id=notification.id and status='claimed'
      and claim_token=target_claim_token and lease_expires_at>clock_timestamp();
  if not found or not private.homework_completion_delivery_is_eligible(delivery.id) then return null; end if;
  select counseling_case.couple_group_id into couple_group from public.counseling_cases counseling_case
    where counseling_case.id=notification.counseling_case_id;
  select * into session from public.case_sessions where id=notification.case_session_id;
  select lower(btrim(profile.email)) into recipient_email from public.profiles profile where profile.id=delivery.recipient_profile_id;
  select coalesce(jsonb_agg(jsonb_build_object('profile_id',profile.id,'first_name',profile.first_name,
      'last_name',profile.last_name,'gender',profile.gender) order by profile.id),'[]'::jsonb)
    into partners
  from public.group_members member join public.profiles profile on profile.id=member.profile_id
  where member.group_id=couple_group and member.ended_at is null;
  if couple_group is null or session.id is null then return null; end if;
  return jsonb_build_object('notification_id',notification.id,'delivery_id',delivery.id,
    'case_id',notification.counseling_case_id,'case_session_id',notification.case_session_id,
    'completion_cycle',notification.completion_cycle,'session_title',session.title,
    'session_number',session.template_sequence_number,'recipient_profile_id',delivery.recipient_profile_id,
    'recipient_email',recipient_email,'partners',partners);
end;
$$;
revoke all on function public.get_homework_completion_recipient_delivery_context(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_homework_completion_recipient_delivery_context(uuid,uuid,uuid) to service_role;

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
      where tag.value ->> 'name'='notification_id' and tag.value ->> 'value'=notification.id::text)
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
  started_at timestamptz := clock_timestamp();
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  select * into notification from public.homework_completion_notifications where id = target_notification_id for update;
  if not found or notification.status = 'cancelled' then return null; end if;
  select * into delivery from public.homework_completion_notification_deliveries
    where id = target_delivery_id and notification_id = notification.id and status = 'claimed'
      and claim_token = target_claim_token and lease_expires_at > started_at for update;
  if not found then return null; end if;
  select * into attempt from public.homework_completion_notification_attempts
    where delivery_id = delivery.id and claim_token = target_claim_token and status = 'claimed'
      and lease_expires_at > started_at for update;
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
  if not found or (frozen.first_provider_started_at is not null and frozen.idempotency_cutoff_at <= started_at) then
    update public.homework_completion_notification_deliveries set status='failed', status_code='provider_idempotency_window_expired',
      claim_token=null, lease_expires_at=null, next_attempt_at=null where id=delivery.id;
    update public.homework_completion_notification_attempts set status='expired_before_start', error_category='provider_idempotency_window_expired' where id=attempt.id;
    perform private.refresh_homework_completion_notification_status(notification.id);
    return null;
  end if;
  if frozen.first_provider_started_at is null then
    update public.homework_completion_notification_payloads set first_provider_started_at=started_at,
      idempotency_cutoff_at=started_at + interval '23 hours' where id=frozen.id returning * into frozen;
  end if;
  update public.homework_completion_notification_attempts set status='started',
    attempt_number=case when attempt.is_manual_recovery then null else delivery.attempt_count+1 end,
    started_at=started_at
    where id=attempt.id and status='claimed' and lease_expires_at>started_at;
  if not found then return null; end if;
  update public.homework_completion_notification_deliveries set
    attempt_count=case when attempt.is_manual_recovery then attempt_count else attempt_count+1 end,
    manual_recovery_pending=case when attempt.is_manual_recovery then false else manual_recovery_pending end,
    manual_recovery_used_at=case when attempt.is_manual_recovery then started_at else manual_recovery_used_at end,
    manual_recovery_used_by=case when attempt.is_manual_recovery then manual_recovery_reserved_by else manual_recovery_used_by end
    where id=delivery.id and status='claimed' and claim_token=target_claim_token and lease_expires_at>started_at;
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

create or replace function public.finish_homework_completion_recipient_attempt(
  target_notification_id uuid, target_delivery_id uuid, target_claim_token uuid,
  provider_outcome text, target_provider_message_id text default null, target_error_category text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare notification public.homework_completion_notifications%rowtype;
  delivery public.homework_completion_notification_deliveries%rowtype;
  attempt public.homework_completion_notification_attempts%rowtype;
  payload public.homework_completion_notification_payloads%rowtype;
  next_state text; retry_delay interval; retry_due timestamptz; detail text;
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if provider_outcome not in ('accepted','delivered','rejected_retryable','rejected_permanent','uncertain','bounced') then raise exception 'Outcome is invalid'; end if;
  select * into notification from public.homework_completion_notifications where id=target_notification_id for update;
  select * into delivery from public.homework_completion_notification_deliveries
    where id=target_delivery_id and notification_id=target_notification_id for update;
  if not found then return null; end if;
  select * into attempt from public.homework_completion_notification_attempts where delivery_id=delivery.id
    and claim_token=target_claim_token and status='started' and lease_expires_at>clock_timestamp() for update;
  if not found then return null; end if;
  -- Reopening or reassignment can cancel a recipient row while the provider
  -- request is in flight. Preserve the actual outcome on its attempt without
  -- making that canceled recipient sendable again.
  if delivery.status='cancelled' or notification.status='cancelled' then
    update public.homework_completion_notification_attempts set status=provider_outcome,
      completed_at=clock_timestamp(),provider_message_id=target_provider_message_id,
      error_category=target_error_category where id=attempt.id and status='started';
    perform private.homework_completion_recipient_delivery_log(notification.id,delivery.id,
      'provider_outcome_after_cancellation',delivery.status,coalesce(target_error_category,provider_outcome));
    return 'cancelled';
  end if;
  if delivery.status<>'claimed' or delivery.claim_token is distinct from target_claim_token
    or delivery.lease_expires_at<=clock_timestamp() then return null; end if;
  detail := target_error_category;
  if provider_outcome='accepted' then next_state := 'sent';
  elsif provider_outcome='delivered' then next_state := 'delivered';
  elsif provider_outcome='uncertain' then next_state := 'uncertain';
  elsif provider_outcome='bounced' or provider_outcome='rejected_permanent' then next_state := 'failed';
  elsif attempt.is_manual_recovery then next_state := 'failed'; detail := coalesce(detail,'manual_recovery_attempt_failed');
  else
    retry_delay := private.homework_completion_notification_retry_delay(attempt.attempt_number);
    select * into payload from public.homework_completion_notification_payloads
      where delivery_id=delivery.id and provider_idempotency_key=attempt.provider_idempotency_key;
    retry_due := clock_timestamp()+retry_delay;
    if retry_delay is null then next_state := 'failed'; detail := coalesce(detail,'retry_limit_reached');
    elsif payload.idempotency_cutoff_at is null or retry_due>=payload.idempotency_cutoff_at then
      next_state := 'failed'; detail := 'provider_idempotency_window_expired';
    elsif not private.homework_completion_delivery_is_eligible(delivery.id) then
      next_state := 'cancelled'; detail := 'eligibility_lost_before_retry';
    else next_state := 'pending'; detail := coalesce(detail,'retryable_provider_rejection'); end if;
  end if;
  update public.homework_completion_notification_attempts set status=provider_outcome, completed_at=clock_timestamp(),
    provider_message_id=target_provider_message_id, error_category=detail where id=attempt.id and status='started';
  update public.homework_completion_notification_deliveries set status=next_state,status_code=detail,
    next_attempt_at=case when next_state='pending' then retry_due else null end,
    claim_token=null,lease_expires_at=null,provider_message_id=coalesce(provider_message_id,target_provider_message_id),
    last_error_category=case when next_state in ('pending','failed','uncertain') then detail else null end,
    manual_recovery_pending=false, updated_at=clock_timestamp()
    where id=delivery.id and claim_token=target_claim_token;
  perform private.homework_completion_recipient_delivery_log(notification.id,delivery.id,
    case when next_state='pending' then 'retry_scheduled' else 'provider_'||provider_outcome end,
    next_state,detail);
  perform private.refresh_homework_completion_notification_status(notification.id);
  return next_state;
end;
$$;
revoke all on function public.finish_homework_completion_recipient_attempt(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_homework_completion_recipient_attempt(uuid, uuid, uuid, text, text, text) to service_role;

create or replace function private.cancel_homework_completion_notifications(
  target_case_id uuid default null, target_group_id uuid default null, target_profile_id uuid default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare changed record; cancelled_count integer := 0;
begin
  for changed in
    select delivery.id, delivery.notification_id
    from public.homework_completion_notification_deliveries delivery
    join public.homework_completion_notifications notification on notification.id=delivery.notification_id
    where delivery.status in ('pending','claimed')
      and (target_case_id is null or notification.counseling_case_id=target_case_id)
      and (target_group_id is null or delivery.recipient_group_id=target_group_id)
      and (target_profile_id is null or delivery.recipient_profile_id=target_profile_id)
      and not private.homework_completion_delivery_is_eligible(delivery.id)
    order by notification.id, delivery.id
    for update of notification, delivery
  loop
    update public.homework_completion_notification_attempts attempt
    set status=case when attempt.started_at is null then 'cancelled_before_start' else attempt.status end,
        cancellation_requested_at=case when attempt.started_at is not null then clock_timestamp() else attempt.cancellation_requested_at end
    where attempt.delivery_id=changed.id and attempt.status in ('claimed','started');
    update public.homework_completion_notification_deliveries set status='cancelled', status_code='recipient_eligibility_lost',
      next_attempt_at=null,claim_token=null,lease_expires_at=null,manual_recovery_pending=false,updated_at=clock_timestamp()
      where id=changed.id and status in ('pending','claimed');
    perform private.refresh_homework_completion_notification_status(changed.notification_id);
    perform private.homework_completion_notification_log(changed.notification_id,'recipient_delivery_cancelled',
      (select status from public.homework_completion_notifications where id=changed.notification_id),'recipient_eligibility_lost');
    cancelled_count := cancelled_count+1;
  end loop;
  return cancelled_count;
end;
$$;
revoke all on function private.cancel_homework_completion_notifications(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.cancel_homework_completion_deliveries_on_cycle_cancel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    update public.homework_completion_notification_attempts attempt
    set status=case when attempt.started_at is null then 'cancelled_before_start' else attempt.status end,
        cancellation_requested_at=case when attempt.started_at is not null then clock_timestamp() else attempt.cancellation_requested_at end
    where attempt.notification_id=new.id and attempt.delivery_id is not null and attempt.status in ('claimed','started');
    update public.homework_completion_notification_deliveries delivery
    set status='cancelled',status_code=coalesce(new.status_code,'completion_cycle_cancelled'),next_attempt_at=null,
        claim_token=null,lease_expires_at=null,manual_recovery_pending=false,updated_at=clock_timestamp()
    where delivery.notification_id=new.id and delivery.status in ('pending','claimed');
  end if;
  return new;
end;
$$;
revoke all on function private.cancel_homework_completion_deliveries_on_cycle_cancel() from public, anon, authenticated;
create trigger cancel_homework_completion_deliveries_on_cycle_cancel
after update of status on public.homework_completion_notifications
for each row execute function private.cancel_homework_completion_deliveries_on_cycle_cancel();

create or replace function public.request_homework_completion_recipient_recovery(target_delivery_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare delivery public.homework_completion_notification_deliveries%rowtype;
  notification public.homework_completion_notifications%rowtype;
  prior_attempts integer; confirmed_nonacceptance boolean;
begin
  if auth.uid() is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select parent.* into notification from public.homework_completion_notifications parent
  join public.homework_completion_notification_deliveries child on child.notification_id=parent.id
  where child.id=target_delivery_id for update of parent;
  if not found then return false; end if;
  select * into delivery from public.homework_completion_notification_deliveries where id=target_delivery_id for update;
  select count(*), bool_and(
    (attempt.attempt_number is not null and attempt.status in ('rejected_retryable','rejected_permanent'))
    or (attempt.attempt_number is null and attempt.status in ('rejected_before_start','expired_before_start','cancelled_before_start'))
  ) into prior_attempts, confirmed_nonacceptance
  from public.homework_completion_notification_attempts attempt where attempt.delivery_id=delivery.id;
  if delivery.status<>'failed' or delivery.manual_recovery_reserved_at is not null or delivery.manual_recovery_used_at is not null
    or not coalesce(confirmed_nonacceptance,false) or prior_attempts=0
    or not private.homework_completion_delivery_is_eligible(delivery.id)
    or not exists (select 1 from public.profiles profile where profile.id=delivery.recipient_profile_id
      and profile.email is not null and lower(btrim(profile.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (select count(*) from public.homework_participant_progress progress
      where progress.assignment_revision_id=notification.assignment_revision_id
        and progress.id=any(notification.partner_progress_ids) and progress.status in ('submitted','reviewed') and progress.submitted_at is not null)<>2 then
    return false;
  end if;
  update public.homework_completion_notification_deliveries set status='pending',status_code='manual_recovery_requested',
    next_attempt_at=clock_timestamp(),manual_recovery_reserved_at=clock_timestamp(),manual_recovery_reserved_by=auth.uid(),
    manual_recovery_pending=true,updated_at=clock_timestamp() where id=delivery.id and status='failed';
  if not found then return false; end if;
  perform private.homework_completion_notification_log(notification.id,'recipient_manual_recovery_requested','pending',
    'recipient_delivery_recovery',auth.uid());
  perform private.refresh_homework_completion_notification_status(notification.id);
  return true;
end;
$$;
revoke all on function public.request_homework_completion_recipient_recovery(uuid) from public, anon;
grant execute on function public.request_homework_completion_recipient_recovery(uuid) to authenticated;

-- Admin alert payload is recipient-scoped and intentionally omits Counselor
-- email addresses, provider payloads, Homework answers, and raw webhook data.
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
        session.title as session_title, session.template_sequence_number as session_number,
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
        session.title, session.template_sequence_number, null::uuid, null::text
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

create or replace function public.fail_homework_completion_recipient_before_delivery(
  target_notification_id uuid, target_delivery_id uuid, target_claim_token uuid, failure_code text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare notification public.homework_completion_notifications%rowtype;
  delivery public.homework_completion_notification_deliveries%rowtype;
  attempt public.homework_completion_notification_attempts%rowtype; invalid_email boolean;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if failure_code not in ('recipient_email_missing','recipient_email_invalid') then raise exception 'Pre-delivery failure is invalid'; end if;
  select * into notification from public.homework_completion_notifications where id=target_notification_id for update;
  select * into delivery from public.homework_completion_notification_deliveries where id=target_delivery_id
    and notification_id=notification.id and status='claimed' and claim_token=target_claim_token
    and lease_expires_at>clock_timestamp() for update;
  if not found then return false; end if;
  select * into attempt from public.homework_completion_notification_attempts where delivery_id=delivery.id
    and claim_token=target_claim_token and status='claimed' and attempt_number is null and lease_expires_at>clock_timestamp() for update;
  if not found or attempt.started_at is not null then return false; end if;
  select exists(select 1 from public.profiles profile where profile.id=delivery.recipient_profile_id and case failure_code
    when 'recipient_email_missing' then profile.email is null or btrim(profile.email)=''
    else profile.email is not null and btrim(profile.email)<>'' and lower(btrim(profile.email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' end)
  into invalid_email;
  if not invalid_email or not private.homework_completion_delivery_is_eligible(delivery.id) then return false; end if;
  update public.homework_completion_notification_attempts set status='rejected_before_start',completed_at=clock_timestamp(),error_category=failure_code where id=attempt.id;
  update public.homework_completion_notification_deliveries set status='failed',status_code=failure_code,last_error_category=failure_code,
    claim_token=null,lease_expires_at=null,next_attempt_at=null,manual_recovery_pending=false where id=delivery.id;
  perform private.refresh_homework_completion_notification_status(notification.id);
  perform private.homework_completion_notification_log(notification.id,'recipient_provider_request_not_started',
    (select status from public.homework_completion_notifications where id=notification.id),failure_code);
  return true;
end;
$$;
revoke all on function public.fail_homework_completion_recipient_before_delivery(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.fail_homework_completion_recipient_before_delivery(uuid,uuid,uuid,text) to service_role;

create or replace function private.guard_homework_completion_delivery_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.notification_id is distinct from old.notification_id
    or new.recipient_assignment_id is distinct from old.recipient_assignment_id
    or new.recipient_group_id is distinct from old.recipient_group_id
    or new.recipient_profile_id is distinct from old.recipient_profile_id
    or new.provider_idempotency_key is distinct from old.provider_idempotency_key
    or new.created_at is distinct from old.created_at then raise exception 'Recipient delivery identity is immutable'; end if;
  if old.manual_recovery_reserved_at is not null and (new.manual_recovery_reserved_at is distinct from old.manual_recovery_reserved_at
    or new.manual_recovery_reserved_by is distinct from old.manual_recovery_reserved_by) then
    raise exception 'Recipient recovery reservation is immutable'; end if;
  if old.manual_recovery_used_at is not null and (new.manual_recovery_used_at is distinct from old.manual_recovery_used_at
    or new.manual_recovery_used_by is distinct from old.manual_recovery_used_by) then raise exception 'Recipient recovery audit is immutable'; end if;
  new.updated_at := clock_timestamp(); return new;
end;
$$;
revoke all on function private.guard_homework_completion_delivery_identity() from public, anon, authenticated;
create trigger guard_homework_completion_delivery_identity before update on public.homework_completion_notification_deliveries
for each row execute function private.guard_homework_completion_delivery_identity();

create or replace function private.guard_homework_completion_recipient_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='homework_completion_notification_attempts' and new.delivery_id is distinct from old.delivery_id then
    raise exception 'Attempt recipient delivery identity is immutable';
  end if;
  if tg_table_name='homework_completion_notification_payloads' and new.delivery_id is distinct from old.delivery_id then
    raise exception 'Payload recipient delivery identity is immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_homework_completion_recipient_link() from public, anon, authenticated;
create trigger guard_homework_completion_attempt_delivery_link before update on public.homework_completion_notification_attempts
for each row execute function private.guard_homework_completion_recipient_link();
create trigger guard_homework_completion_payload_delivery_link before update on public.homework_completion_notification_payloads
for each row execute function private.guard_homework_completion_recipient_link();

create or replace function public.reconcile_homework_completion_recipient_attempt(
  target_attempt_id uuid, provider_outcome text, target_provider_message_id text default null,
  target_provider_event_id text default null, target_error_category text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare attempt public.homework_completion_notification_attempts%rowtype;
  delivery public.homework_completion_notification_deliveries%rowtype;
  notification public.homework_completion_notifications%rowtype;
  prior public.homework_completion_notification_provider_evidence%rowtype;
  evidence_key text; evidence_row bigint; next_state text; retry_delay interval; retry_due timestamptz;
  frozen public.homework_completion_notification_payloads%rowtype;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if provider_outcome not in ('accepted','delivered','rejected_retryable','rejected_permanent','uncertain','bounced') then raise exception 'Provider outcome is invalid'; end if;
  if nullif(btrim(target_provider_event_id),'') is null and nullif(btrim(target_provider_message_id),'') is null then raise exception 'Provider evidence identifier is required'; end if;
  evidence_key := case when nullif(btrim(target_provider_event_id),'') is not null then 'event:'||btrim(target_provider_event_id) else 'message:'||btrim(target_provider_message_id) end;
  select * into attempt from public.homework_completion_notification_attempts where id=target_attempt_id and delivery_id is not null;
  if not found then return null; end if;
  select * into notification from public.homework_completion_notifications where id=attempt.notification_id for update;
  select * into delivery from public.homework_completion_notification_deliveries where id=attempt.delivery_id and notification_id=notification.id for update;
  select * into attempt from public.homework_completion_notification_attempts where id=target_attempt_id and delivery_id=delivery.id for update;
  select * into prior from public.homework_completion_notification_provider_evidence where provider_name='resend' and evidence_identifier=evidence_key;
  if found then
    if prior.attempt_id<>attempt.id or prior.event_id is distinct from nullif(btrim(target_provider_event_id),'')
      or prior.message_id is distinct from nullif(btrim(target_provider_message_id),'') or prior.outcome<>provider_outcome
      or prior.error_category is distinct from target_error_category then raise exception 'Conflicting provider evidence replay'; end if;
    return delivery.status;
  end if;
  if attempt.status not in ('started','uncertain','accepted','delivered','bounced') then raise exception 'Provider evidence progression is invalid'; end if;
  if (attempt.status='accepted' and provider_outcome not in ('accepted','delivered','bounced'))
    or (attempt.status='delivered' and provider_outcome<>'delivered')
    or (attempt.status='bounced' and provider_outcome<>'bounced') then raise exception 'Provider evidence outcome progression is invalid'; end if;
  if attempt.provider_message_id is not null and attempt.provider_message_id is distinct from target_provider_message_id then raise exception 'Provider message does not match recipient attempt'; end if;
  insert into public.homework_completion_notification_provider_evidence(attempt_id,provider_name,evidence_identifier,event_id,message_id,outcome,error_category)
  values(attempt.id,'resend',evidence_key,nullif(btrim(target_provider_event_id),''),nullif(btrim(target_provider_message_id),''),provider_outcome,target_error_category)
  on conflict(provider_name,evidence_identifier) do nothing returning id into evidence_row;
  if evidence_row is null then
    select * into prior from public.homework_completion_notification_provider_evidence
      where provider_name='resend' and evidence_identifier=evidence_key;
    if prior.attempt_id=attempt.id and prior.event_id is not distinct from nullif(btrim(target_provider_event_id),'')
      and prior.message_id is not distinct from nullif(btrim(target_provider_message_id),'')
      and prior.outcome=provider_outcome and prior.error_category is not distinct from target_error_category then
      return delivery.status;
    end if;
    raise exception 'Conflicting provider evidence replay';
  end if;
  next_state := case provider_outcome when 'accepted' then 'sent' when 'delivered' then 'delivered'
    when 'bounced' then 'failed' when 'rejected_permanent' then 'failed' when 'uncertain' then 'uncertain' else 'pending' end;
  if provider_outcome='rejected_retryable' then
    if attempt.is_manual_recovery then next_state:='failed';
    else
      retry_delay:=private.homework_completion_notification_retry_delay(attempt.attempt_number);
      select * into frozen from public.homework_completion_notification_payloads where delivery_id=delivery.id and provider_idempotency_key=attempt.provider_idempotency_key;
      retry_due:=clock_timestamp()+retry_delay;
      if retry_delay is null or frozen.idempotency_cutoff_at is null or retry_due>=frozen.idempotency_cutoff_at then next_state:='failed';
      elsif notification.status='cancelled' or delivery.status='cancelled' or not private.homework_completion_delivery_is_eligible(delivery.id) then next_state:='cancelled';
      end if;
    end if;
  end if;
  update public.homework_completion_notification_attempts set status=provider_outcome,
    completed_at=coalesce(completed_at,clock_timestamp()),provider_message_id=coalesce(provider_message_id,target_provider_message_id),error_category=target_error_category
    where id=attempt.id and (status in ('started','uncertain') or (status='accepted' and provider_outcome in ('delivered','bounced')));
  if delivery.status<>'cancelled' then
    update public.homework_completion_notification_deliveries set status=next_state,
      status_code=case when next_state='pending' then 'reconciled_transient_rejection' when next_state='failed' then coalesce(target_error_category,'provider_rejection') else target_error_category end,
      next_attempt_at=case when next_state='pending' then retry_due else null end,claim_token=null,lease_expires_at=null,
      provider_message_id=coalesce(provider_message_id,target_provider_message_id),last_error_category=target_error_category,manual_recovery_pending=false
      where id=delivery.id;
  end if;
  perform private.refresh_homework_completion_notification_status(notification.id);
  return case when delivery.status='cancelled' or notification.status='cancelled' then 'cancelled' else next_state end;
end;
$$;
revoke all on function public.reconcile_homework_completion_recipient_attempt(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.reconcile_homework_completion_recipient_attempt(uuid,text,text,text,text) to service_role;

alter function public.reconcile_homework_completion_notification_attempt(uuid,text,text,text,text)
  rename to reconcile_homework_completion_notification_attempt_cycle_legacy;
create or replace function public.reconcile_homework_completion_notification_attempt(
  target_attempt_id uuid, provider_outcome text, target_provider_message_id text default null,
  target_provider_event_id text default null, target_error_category text default null
) returns text language plpgsql security definer set search_path = '' as $$
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.homework_completion_notification_attempts where id=target_attempt_id and delivery_id is not null) then
    return public.reconcile_homework_completion_recipient_attempt(target_attempt_id,provider_outcome,
      target_provider_message_id,target_provider_event_id,target_error_category);
  end if;
  return public.reconcile_homework_completion_notification_attempt_cycle_legacy(target_attempt_id,provider_outcome,
    target_provider_message_id,target_provider_event_id,target_error_category);
end;
$$;
revoke all on function public.reconcile_homework_completion_notification_attempt(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.reconcile_homework_completion_notification_attempt(uuid,text,text,text,text) to service_role;
-- The renamed cycle reconciler is invoked only by the SECURITY DEFINER wrapper
-- for legacy cycle-scoped attempts. Direct worker invocation could bypass the
-- recipient-specific dispatcher, so its inherited grant must be removed.
revoke all on function public.reconcile_homework_completion_notification_attempt_cycle_legacy(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
-- The old Admin recovery contract accepts a cycle ID and cannot safely select
-- one of multiple recipients. New Admin clients use the recipient-scoped RPC.
revoke all on function public.request_homework_completion_notification_recovery(uuid)
  from public, anon, authenticated;

-- Supersede the pending lookup/correlation helpers only after the delivery
-- table exists. Claim tokens remain server-only and the provider sees only IDs.
create or replace function public.get_homework_completion_notification_attempt_id(target_notification_id uuid, target_claim_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  select attempt.id into result_id
  from public.homework_completion_notification_attempts attempt
  join public.homework_completion_notifications notification on notification.id=attempt.notification_id
  left join public.homework_completion_notification_deliveries delivery on delivery.id=attempt.delivery_id
  where attempt.notification_id=target_notification_id and attempt.claim_token=target_claim_token
    and attempt.status='claimed' and attempt.lease_expires_at>clock_timestamp()
    and ((attempt.delivery_id is null and notification.status='claimed'
          and notification.claim_token=target_claim_token and notification.lease_expires_at>clock_timestamp())
      or (attempt.delivery_id is not null and delivery.notification_id=notification.id and delivery.status='claimed'
          and delivery.claim_token=target_claim_token and delivery.lease_expires_at>clock_timestamp()
          and notification.status<>'cancelled'));
  return result_id;
end;
$$;
revoke all on function public.get_homework_completion_notification_attempt_id(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_homework_completion_notification_attempt_id(uuid,uuid) to service_role;

create or replace function public.verify_homework_completion_notification_webhook(
  target_notification_id uuid, target_attempt_id uuid, target_delivery_id uuid,
  target_provider_message_id text, target_provider_recipients text[]
) returns text language plpgsql security definer set search_path = '' as $$
declare attempt public.homework_completion_notification_attempts%rowtype;
  notification public.homework_completion_notifications%rowtype;
  frozen public.homework_completion_notification_payloads%rowtype;
  recipient text; delivery_tag text;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if nullif(btrim(target_provider_message_id),'') is null or coalesce(cardinality(target_provider_recipients),0)<>1
    or nullif(btrim(target_provider_recipients[1]),'') is null then return 'unmatched'; end if;
  select * into attempt from public.homework_completion_notification_attempts where id=target_attempt_id
    and notification_id=target_notification_id and status in ('started','uncertain','accepted','delivered','bounced','rejected_retryable','rejected_permanent');
  if not found or attempt.delivery_id is distinct from target_delivery_id
    or (attempt.provider_message_id is not null and attempt.provider_message_id<>target_provider_message_id) then return 'unmatched'; end if;
  select * into notification from public.homework_completion_notifications where id=target_notification_id;
  select * into frozen from public.homework_completion_notification_payloads payload
    where payload.notification_id=target_notification_id and payload.provider_idempotency_key=attempt.provider_idempotency_key
      and payload.payload_kind=case when attempt.is_manual_recovery then 'manual_recovery' else 'automatic' end
      and ((attempt.delivery_id is null and payload.delivery_id is null) or payload.delivery_id=attempt.delivery_id);
  if not found or jsonb_typeof(frozen.provider_payload->'to')<>'array'
    or jsonb_array_length(frozen.provider_payload->'to')<>1 then return 'unmatched'; end if;
  recipient:=lower(btrim(frozen.provider_payload #>> '{to,0}'));
  if recipient is distinct from lower(btrim(target_provider_recipients[1])) then return 'unmatched'; end if;
  if attempt.delivery_id is not null then
    if jsonb_typeof(frozen.provider_payload->'tags')<>'array' then return 'unmatched'; end if;
    select tag.value->>'value' into delivery_tag from jsonb_array_elements(frozen.provider_payload->'tags') as tag(value)
    where tag.value->>'name'='notification_delivery_id' limit 1;
    if delivery_tag is distinct from attempt.delivery_id::text then return 'unmatched'; end if;
  end if;
  if not exists(select 1 from jsonb_array_elements(frozen.provider_payload->'tags') as tag(value)
      where value->>'name'='notification_id' and value->>'value'=notification.id::text)
    or not exists(select 1 from jsonb_array_elements(frozen.provider_payload->'tags') as tag(value)
      where value->>'name'='notification_attempt_id' and value->>'value'=attempt.id::text)
    or not exists(select 1 from jsonb_array_elements(frozen.provider_payload->'tags') as tag(value)
      where value->>'name'='notification_type' and value->>'value'='homework_completion') then return 'unmatched'; end if;
  return 'verified';
end;
$$;
revoke all on function public.verify_homework_completion_notification_webhook(uuid,uuid,uuid,text,text[]) from public, anon, authenticated;
grant execute on function public.verify_homework_completion_notification_webhook(uuid,uuid,uuid,text,text[]) to service_role;
-- The attempt-lookup migration's older signature must not remain callable as a
-- weaker correlation path after the recipient-aware verifier is installed.
revoke all on function public.verify_homework_completion_notification_webhook(uuid,uuid,text,text[])
  from public, anon, authenticated, service_role;

-- The original cycle-level worker RPCs are disabled before the recipient-aware
-- worker is deployed. This prevents an older worker from sending one message
-- addressed to both Counselors after this migration is applied.
revoke execute on function public.claim_due_homework_completion_notifications(integer) from service_role;
