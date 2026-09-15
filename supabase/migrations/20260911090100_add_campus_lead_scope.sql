create table public.campus_lead_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campus_lead_assignments_dates_ordered check (ended_at is null or ended_at >= started_at)
);

create unique index campus_lead_assignments_one_active_campus_idx
  on public.campus_lead_assignments (profile_id, campus_id)
  where ended_at is null;
create index campus_lead_assignments_active_campus_idx
  on public.campus_lead_assignments (campus_id, profile_id)
  where ended_at is null;

create function private.current_user_oversees_campus(target_campus_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
    or (
      (select private.current_user_has_role(array['campus_lead']::public.app_role[]))
      and exists (
        select 1
        from public.campus_lead_assignments assignment
        join public.campuses campus on campus.id = assignment.campus_id and campus.active
        where assignment.profile_id = (select auth.uid())
          and assignment.campus_id = target_campus_id
          and assignment.ended_at is null
      )
    );
$$;

create or replace function private.current_user_can_access_group(target_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.groups where id = target_group_id and (select private.current_user_oversees_campus(campus_id)))
    or exists (select 1 from public.group_members where group_id = target_group_id and profile_id = (select auth.uid()) and ended_at is null)
    or exists (
      select 1 from public.supervision_assignments supervision
      join public.group_members coach_membership on coach_membership.group_id = supervision.coach_group_id and coach_membership.profile_id = (select auth.uid()) and coach_membership.ended_at is null
      where supervision.counselor_group_id = target_group_id and supervision.ended_at is null
        and (select private.current_user_has_role(array['coach']::public.app_role[]))
    );
$$;

create or replace function private.current_user_can_access_profile(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    target_profile_id = (select auth.uid())
    or exists (select 1 from public.profiles profile where profile.id = target_profile_id and (select private.current_user_oversees_campus(profile.campus_id)))
    or exists (
      select 1 from public.group_members mine join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.profile_id = (select auth.uid()) and mine.ended_at is null and theirs.profile_id = target_profile_id and theirs.ended_at is null
    )
    or exists (
      select 1 from public.supervision_assignments supervision
      join public.group_members coach_membership on coach_membership.group_id = supervision.coach_group_id and coach_membership.profile_id = (select auth.uid()) and coach_membership.ended_at is null
      join public.group_members counselor_membership on counselor_membership.group_id = supervision.counselor_group_id and counselor_membership.profile_id = target_profile_id and counselor_membership.ended_at is null
      where supervision.ended_at is null and (select private.current_user_has_role(array['coach']::public.app_role[]))
    );
$$;

create or replace function private.current_user_can_access_case(target_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.counseling_cases counseling_case where counseling_case.id = target_case_id and (select private.current_user_oversees_campus(counseling_case.campus_id)))
    or exists (
      select 1 from public.counseling_cases counseling_case join public.group_members couple_member on couple_member.group_id = counseling_case.couple_group_id and couple_member.profile_id = (select auth.uid()) and couple_member.ended_at is null
      where counseling_case.id = target_case_id and (select private.current_user_has_role(array['couple']::public.app_role[]))
    )
    or exists (
      select 1 from public.case_assignments assignment join public.group_members team_member on team_member.group_id = assignment.assigned_group_id and team_member.profile_id = (select auth.uid()) and team_member.ended_at is null
      where assignment.counseling_case_id = target_case_id and assignment.ended_at is null
        and ((assignment.assignment_type = 'coach' and (select private.current_user_has_role(array['coach']::public.app_role[]))) or (assignment.assignment_type = 'counselor' and (select private.current_user_has_role(array['counselor']::public.app_role[]))))
    );
$$;

alter table public.campus_lead_assignments enable row level security;
revoke all on public.campus_lead_assignments from anon, authenticated;
grant select on public.campus_lead_assignments to authenticated;
create policy campus_lead_assignments_read_authorized on public.campus_lead_assignments for select to authenticated
using (profile_id = (select auth.uid()) or (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

drop policy if exists campuses_read_active_or_admin on public.campuses;
create policy campuses_read_active_admin_or_lead on public.campuses for select to authenticated
using (active or (select private.current_user_oversees_campus(id)));

drop policy if exists intake_requests_admin_read on public.intake_requests;
drop policy if exists intake_request_people_admin_read on public.intake_request_people;
drop policy if exists intake_request_status_history_admin_read on public.intake_request_status_history;
create policy intake_requests_admin_or_lead_read on public.intake_requests for select to authenticated
using ((select private.current_user_oversees_campus(campus_id)));
create policy intake_request_people_admin_or_lead_read on public.intake_request_people for select to authenticated
using (exists (select 1 from public.intake_requests request where request.id = intake_request_id and (select private.current_user_oversees_campus(request.campus_id))));
create policy intake_request_status_history_admin_or_lead_read on public.intake_request_status_history for select to authenticated
using (exists (select 1 from public.intake_requests request where request.id = intake_request_id and (select private.current_user_oversees_campus(request.campus_id))));

grant execute on function private.current_user_oversees_campus(uuid) to authenticated;

create function private.seed_campus_lead_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare profile_campus_id uuid;
begin
  if new.role <> 'campus_lead'::public.app_role then return new; end if;
  select campus_id into profile_campus_id from public.profiles where id = new.profile_id;
  if profile_campus_id is null then raise exception 'Campus Lead requires a campus'; end if;
  insert into public.campus_lead_assignments (profile_id, campus_id, assigned_by)
  values (new.profile_id, profile_campus_id, new.assigned_by)
  on conflict (profile_id, campus_id) where ended_at is null do nothing;
  return new;
end;
$$;

create trigger seed_campus_lead_scope_after_role
after insert on public.profile_roles
for each row execute function private.seed_campus_lead_scope();

create or replace function public.create_invitations(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, private as $$
declare
  actor uuid := auth.uid(); invite_role public.app_role := (payload->>'role')::public.app_role;
  campus uuid := (payload->>'campus_id')::uuid; members jsonb := coalesce(payload->'invitees', '[]'::jsonb);
  group_kind public.group_type; group_id uuid; invitation_ids jsonb := '[]'::jsonb; item jsonb; normalized_email text; invitation_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then raise exception 'Only Admin or Super Admin may create invitations'; end if;
  if invite_role not in ('super_admin', 'admin', 'campus_lead', 'author', 'coach', 'counselor') then raise exception 'Unsupported invitation role'; end if;
  if not exists (select 1 from public.campuses where id = campus and active) then raise exception 'Choose an active campus'; end if;
  if jsonb_array_length(members) <> (case when invite_role in ('coach', 'counselor') then 2 else 1 end) then raise exception 'Invitation role requires the expected number of invitees'; end if;
  if invite_role in ('coach', 'counselor') then
    group_kind := case invite_role when 'coach' then 'coach_team' else 'counselor_team' end;
    insert into public.groups (campus_id, group_type, name) values (campus, group_kind, 'Pending ' || initcap(invite_role::text) || ' invitation') returning id into group_id;
  end if;
  for item in select * from jsonb_array_elements(members) loop
    normalized_email := lower(btrim(item->>'email'));
    if normalized_email = '' or normalized_email is null then raise exception 'Invitee email is required'; end if;
    if exists (select 1 from jsonb_array_elements(members) other where lower(btrim(other->>'email')) = normalized_email and other <> item) then raise exception 'Invitee emails must be unique'; end if;
    if private.invitation_auth_email_exists(normalized_email) or exists (select 1 from public.profiles where email = normalized_email) or exists (select 1 from public.invitations where email = normalized_email and status = 'pending') then raise exception 'An active user or pending invitation already exists for this email'; end if;
    insert into public.invitations (email, first_name, last_name, intended_role, campus_id, group_id, invited_by) values (normalized_email, coalesce(item->>'first_name', ''), coalesce(item->>'last_name', ''), invite_role, campus, group_id, actor) returning id into invitation_id;
    invitation_ids := invitation_ids || to_jsonb(invitation_id);
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details) values (actor, 'invitation.created', 'invitation', invitation_id, jsonb_build_object('role', invite_role, 'campus_id', campus, 'group_id', group_id, 'email', normalized_email));
  end loop;
  return jsonb_build_object('invitation_ids', invitation_ids, 'group_id', group_id);
end;
$$;
