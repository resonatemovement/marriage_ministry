create type public.intake_request_status as enum (
  'ready_for_review', 'under_review', 'ready_to_invite', 'invited', 'closed'
);
create type public.intake_relationship_status as enum ('pre_engaged', 'engaged', 'married');
create type public.intake_request_person_position as enum ('requester', 'partner');

create table public.intake_requests (
  id uuid primary key default gen_random_uuid(),
  status public.intake_request_status not null default 'ready_for_review',
  relationship_status public.intake_relationship_status not null,
  wedding_date date,
  campus_id uuid references public.campuses(id) on delete set null,
  campus_other text,
  currently_working_with_counselor boolean not null,
  requested_support text[] not null,
  goals text not null,
  questions text,
  referral_source text not null,
  referral_source_other text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_requests_support_not_empty check (cardinality(requested_support) > 0),
  constraint intake_requests_support_valid check (requested_support <@ array['lay_counselor', 'professional_referral']::text[]),
  constraint intake_requests_goals_not_blank check (btrim(goals) <> ''),
  constraint intake_requests_referral_source_valid check (referral_source in ('church_announcements', 'mc', 'friend', 'ministry_leader', 'website', 'social_media', 'other')),
  constraint intake_requests_referral_other_matches check ((referral_source = 'other') = (btrim(coalesce(referral_source_other, '')) <> '')),
  constraint intake_requests_campus_other_not_blank check (campus_other is null or btrim(campus_other) <> '')
);

create table public.intake_request_people (
  id uuid primary key default gen_random_uuid(),
  intake_request_id uuid not null references public.intake_requests(id) on delete cascade,
  person_position public.intake_request_person_position not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  city text not null,
  resonate_connections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_request_people_one_position unique (intake_request_id, person_position),
  constraint intake_request_people_email_normalized check (email = lower(btrim(email)) and btrim(email) <> ''),
  constraint intake_request_people_names_not_blank check (btrim(first_name) <> '' and btrim(last_name) <> ''),
  constraint intake_request_people_phone_city_not_blank check (btrim(phone) <> '' and btrim(city) <> ''),
  constraint intake_request_people_connections_array check (jsonb_typeof(resonate_connections) = 'array')
);

create table public.intake_request_status_history (
  id bigint generated always as identity primary key,
  intake_request_id uuid not null references public.intake_requests(id) on delete restrict,
  from_status public.intake_request_status,
  to_status public.intake_request_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);

create index intake_requests_status_submitted_idx on public.intake_requests (status, submitted_at desc);
create index intake_request_people_email_idx on public.intake_request_people (email);
create index intake_request_people_name_idx on public.intake_request_people (last_name, first_name);
create index intake_request_status_history_request_changed_idx on public.intake_request_status_history (intake_request_id, changed_at desc);

create trigger set_intake_requests_updated_at before update on public.intake_requests
for each row execute function private.set_updated_at();
create trigger set_intake_request_people_updated_at before update on public.intake_request_people
for each row execute function private.set_updated_at();

create function private.record_initial_intake_request_status()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.intake_request_status_history (intake_request_id, to_status)
  values (new.id, new.status);
  return new;
end;
$$;
create trigger record_initial_intake_request_status after insert on public.intake_requests
for each row execute function private.record_initial_intake_request_status();

create function private.validate_intake_request_people_count()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare request_id uuid := coalesce(new.intake_request_id, old.intake_request_id); begin
  if exists (select 1 from public.intake_requests where id = request_id)
    and (select count(*) from public.intake_request_people where intake_request_id = request_id) <> 2 then
    raise exception 'An Intake Request must contain exactly one requester and one partner';
  end if;
  return null;
end;
$$;
create constraint trigger intake_request_people_count_after_change
after insert or update or delete on public.intake_request_people deferrable initially deferred
for each row execute function private.validate_intake_request_people_count();

create function public.update_intake_request_status(target_request_id uuid, next_status public.intake_request_status)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); current_request public.intake_requests%rowtype; allowed boolean := false; begin
  if actor is null or not (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])) then
    raise exception 'Only Admin or Super Admin may manage Intake Requests';
  end if;
  select * into current_request from public.intake_requests where id = target_request_id for update;
  if not found then raise exception 'Intake Request not found'; end if;
  if next_status = 'invited' then raise exception 'Invited is managed by the invitation workflow'; end if;
  allowed := case current_request.status
    when 'ready_for_review' then next_status in ('under_review', 'closed')
    when 'under_review' then next_status in ('ready_for_review', 'ready_to_invite', 'closed')
    when 'ready_to_invite' then next_status in ('under_review', 'closed')
    when 'closed' then next_status = 'under_review'
    when 'invited' then false
  end;
  if not allowed then raise exception 'Invalid Intake Request status transition'; end if;
  update public.intake_requests set status = next_status where id = target_request_id;
  insert into public.intake_request_status_history (intake_request_id, from_status, to_status, changed_by)
  values (target_request_id, current_request.status, next_status, actor);
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'intake_request.status_updated', 'intake_request', target_request_id,
    jsonb_build_object('from_status', current_request.status, 'to_status', next_status));
end;
$$;

alter table public.intake_requests enable row level security;
alter table public.intake_request_people enable row level security;
alter table public.intake_request_status_history enable row level security;
revoke all on public.intake_requests, public.intake_request_people, public.intake_request_status_history from anon, authenticated;
grant select on public.intake_requests, public.intake_request_people, public.intake_request_status_history to authenticated;
grant all on public.intake_requests, public.intake_request_people, public.intake_request_status_history to service_role;
grant usage, select on sequence public.intake_request_status_history_id_seq to service_role;
create policy intake_requests_admin_read on public.intake_requests for select to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));
create policy intake_request_people_admin_read on public.intake_request_people for select to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));
create policy intake_request_status_history_admin_read on public.intake_request_status_history for select to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));
revoke execute on function public.update_intake_request_status(uuid, public.intake_request_status) from public, anon;
grant execute on function public.update_intake_request_status(uuid, public.intake_request_status) to authenticated;
revoke execute on function private.record_initial_intake_request_status() from public, anon, authenticated;
revoke execute on function private.validate_intake_request_people_count() from public, anon, authenticated;
