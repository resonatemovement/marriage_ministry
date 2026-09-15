-- Campus Leads use the same two-person operational-group model as Coach and Counselor teams.
alter type public.group_type add value if not exists 'campus_lead_team';

alter table public.case_assignments drop constraint if exists case_assignments_target_matches_type;
alter table public.case_assignments add constraint case_assignments_target_matches_type check (
  (assignment_type in ('coach', 'counselor') and assigned_group_id is not null and assigned_profile_id is null)
  or (assignment_type = 'campus_lead' and ((assigned_group_id is not null and assigned_profile_id is null) or (assigned_group_id is null and assigned_profile_id is not null)))
);

create or replace function private.validate_case_assignment_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignment_type = 'campus_lead' then
    -- Legacy profile-targeted history remains readable. New writes use a Campus Lead team.
    if new.assigned_group_id is null then
      if new.assigned_profile_id is null then raise exception 'Campus Lead assignments require a target'; end if;
      return new;
    end if;
    if new.assigned_profile_id is not null or not exists (
      select 1 from public.groups
      where id = new.assigned_group_id and active and group_type = 'campus_lead_team'
    ) then raise exception 'Campus Lead assignments require an active Campus Lead team'; end if;
    return new;
  end if;
  if new.assigned_profile_id is not null or not exists (
    select 1 from public.groups
    where id = new.assigned_group_id and active and group_type = case new.assignment_type
      when 'coach' then 'coach_team'::public.group_type
      when 'counselor' then 'counselor_team'::public.group_type
    end
  ) then raise exception 'Assignment group type does not match assignment type'; end if;
  return new;
end;
$$;

create or replace function private.enforce_campus_lead_team_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.ended_at is not null or not exists (
    select 1 from public.groups where id = new.group_id and group_type = 'campus_lead_team'
  ) then return new; end if;
  if exists (
    select 1 from public.group_members membership
    join public.groups team on team.id = membership.group_id
    where membership.profile_id = new.profile_id
      and membership.ended_at is null
      and membership.group_id <> new.group_id
      and team.group_type = 'campus_lead_team'
  ) then raise exception 'Profile already belongs to another active Campus Lead team'; end if;
  return new;
end;
$$;

drop trigger if exists enforce_campus_lead_team_membership on public.group_members;
create trigger enforce_campus_lead_team_membership
before insert or update of group_id, profile_id, ended_at on public.group_members
for each row execute function private.enforce_campus_lead_team_membership();

create or replace function private.invitation_group_type(invitation_role public.app_role)
returns public.group_type language sql immutable set search_path = '' as $$
  select case invitation_role
    when 'couple' then 'couple'::public.group_type
    when 'coach' then 'coach_team'::public.group_type
    when 'counselor' then 'counselor_team'::public.group_type
    when 'campus_lead' then 'campus_lead_team'::public.group_type
  end;
$$;

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
  if jsonb_array_length(members) <> (case when invite_role in ('campus_lead', 'coach', 'counselor') then 2 else 1 end) then raise exception 'Invitation role requires the expected number of invitees'; end if;
  group_kind := private.invitation_group_type(invite_role);
  if group_kind is not null then
    insert into public.groups (campus_id, group_type, name)
    values (campus, group_kind, 'Pending ' || initcap(replace(invite_role::text, '_', ' ')) || ' invitation')
    returning id into group_id;
  end if;
  for item in select * from jsonb_array_elements(members) loop
    normalized_email := lower(btrim(item->>'email'));
    if normalized_email = '' or normalized_email is null then raise exception 'Invitee email is required'; end if;
    if exists (select 1 from jsonb_array_elements(members) other where lower(btrim(other->>'email')) = normalized_email and other <> item) then raise exception 'Invitee emails must be unique'; end if;
    if private.invitation_auth_email_exists(normalized_email) or exists (select 1 from public.profiles where email = normalized_email) or exists (select 1 from public.invitations where email = normalized_email and status = 'pending') then raise exception 'An active user or pending invitation already exists for this email'; end if;
    insert into public.invitations (email, first_name, last_name, intended_role, campus_id, group_id, invited_by)
    values (normalized_email, coalesce(item->>'first_name', ''), coalesce(item->>'last_name', ''), invite_role, campus, group_id, actor)
    returning id into invitation_id;
    invitation_ids := invitation_ids || to_jsonb(invitation_id);
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
    values (actor, 'invitation.created', 'invitation', invitation_id, jsonb_build_object('role', invite_role, 'campus_id', campus, 'group_id', group_id, 'email', normalized_email));
  end loop;
  return jsonb_build_object('invitation_ids', invitation_ids, 'group_id', group_id);
end;
$$;

create or replace function public.accept_invitation()
returns jsonb language plpgsql security definer set search_path = public, auth, private as $$
declare
  actor uuid := auth.uid(); actor_email text; invitation public.invitations%rowtype; group_kind public.group_type; matching_invitations integer; accepted_now boolean := false;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select lower(email) into actor_email from auth.users where id = actor;
  if actor_email is null then raise exception 'Authenticated account has no email'; end if;
  select count(*) into matching_invitations from public.invitations where auth_user_id = actor;
  if matching_invitations > 1 then raise exception 'Invitation identity is ambiguous';
  elsif matching_invitations = 1 then select * into invitation from public.invitations where auth_user_id = actor for update;
  else
    select count(*) into matching_invitations from public.invitations where auth_user_id is null and email = actor_email and status = 'pending';
    if matching_invitations > 1 then raise exception 'Invitation identity is ambiguous';
    elsif matching_invitations = 1 then select * into invitation from public.invitations where auth_user_id is null and email = actor_email and status = 'pending' for update;
    elsif exists (select 1 from public.invitations where email = actor_email and auth_user_id is not null and auth_user_id <> actor) then raise exception 'Invitation belongs to another account';
    else raise exception 'Invitation not found'; end if;
  end if;
  if invitation.auth_user_id is not null and invitation.auth_user_id <> actor then raise exception 'Invitation belongs to another account'; end if;
  if invitation.status = 'revoked' then raise exception 'Invitation revoked'; end if;
  if invitation.status <> 'pending' and not (invitation.status = 'accepted' and invitation.auth_user_id = actor) then raise exception 'Invitation expired'; end if;
  if invitation.expires_at is not null and invitation.expires_at <= now() and invitation.status <> 'accepted' then raise exception 'Invitation expired'; end if;
  if invitation.email <> actor_email or not exists (select 1 from public.campuses where id = invitation.campus_id) then raise exception 'Invitation is invalid'; end if;
  group_kind := private.invitation_group_type(invitation.intended_role);
  if group_kind is not null then
    if invitation.group_id is null or not exists (select 1 from public.groups where id = invitation.group_id and active and group_type = group_kind) then raise exception 'Invitation group is invalid'; end if;
    if exists (select 1 from public.group_members membership join public.groups existing_group on existing_group.id = membership.group_id where membership.profile_id = actor and membership.ended_at is null and membership.group_id <> invitation.group_id and existing_group.group_type = group_kind) then raise exception 'Profile already belongs to another active group of this type'; end if;
  elsif invitation.group_id is not null then raise exception 'Invitation group is invalid'; end if;
  insert into public.profiles (id, campus_id, first_name, last_name, email, status)
  values (actor, invitation.campus_id, invitation.first_name, invitation.last_name, actor_email, 'invited')
  on conflict (id) do update set campus_id = excluded.campus_id, first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email, status = case when public.profiles.status = 'active' then 'active' else 'invited' end;
  insert into public.profile_roles (profile_id, role, assigned_by) values (actor, invitation.intended_role, actor) on conflict (profile_id, role) do nothing;
  if invitation.group_id is not null then insert into public.group_members (group_id, profile_id) values (invitation.group_id, actor) on conflict (group_id, profile_id) where ended_at is null do nothing; end if;
  if invitation.status = 'pending' then update public.invitations set status = 'accepted', accepted_at = now(), auth_user_id = actor where id = invitation.id; accepted_now := true; end if;
  if accepted_now then insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details) values (actor, 'invitation.accepted', 'invitation', invitation.id, jsonb_build_object('profile_id', actor, 'role', invitation.intended_role, 'group_id', invitation.group_id)); end if;
  return jsonb_build_object('invitation_id', invitation.id, 'role', invitation.intended_role, 'group_id', invitation.group_id);
end;
$$;

create or replace function public.activate_invitation_account()
returns jsonb language plpgsql security definer set search_path = public, auth, private as $$
declare actor uuid := auth.uid(); actor_email text; invitation public.invitations%rowtype; group_kind public.group_type; activated_now boolean := false;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select lower(email) into actor_email from auth.users where id = actor;
  select * into invitation from public.invitations where auth_user_id = actor for update;
  if not found or actor_email is null or invitation.email <> actor_email then raise exception 'Invitation not found for this account'; end if;
  if invitation.status = 'revoked' or (invitation.status <> 'pending' and not (invitation.status = 'accepted' and invitation.auth_user_id = actor)) or (invitation.expires_at is not null and invitation.expires_at <= now() and invitation.status <> 'accepted') then raise exception 'Invitation expired'; end if;
  if not exists (select 1 from public.campuses where id = invitation.campus_id and active) then raise exception 'Invitation campus is invalid'; end if;
  group_kind := private.invitation_group_type(invitation.intended_role);
  if group_kind is not null then
    if invitation.group_id is null or not exists (select 1 from public.groups where id = invitation.group_id and active and group_type = group_kind) then raise exception 'Invitation group is invalid'; end if;
    if exists (select 1 from public.group_members membership join public.groups existing_group on existing_group.id = membership.group_id where membership.profile_id = actor and membership.ended_at is null and membership.group_id <> invitation.group_id and existing_group.group_type = group_kind) then raise exception 'Profile already belongs to another active group of this type'; end if;
  elsif invitation.group_id is not null then raise exception 'Invitation group is invalid'; end if;
  if exists (select 1 from public.profiles where id = actor and status = 'active') then raise exception 'Account is already active'; end if;
  insert into public.profiles (id, campus_id, first_name, last_name, email, status)
  values (actor, invitation.campus_id, invitation.first_name, invitation.last_name, actor_email, 'password_required')
  on conflict (id) do update set campus_id = excluded.campus_id, first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email, status = case when public.profiles.status = 'onboarding' then 'onboarding'::public.profile_status else 'password_required'::public.profile_status end;
  insert into public.profile_roles (profile_id, role, assigned_by) values (actor, invitation.intended_role, actor) on conflict (profile_id, role) do nothing;
  if invitation.group_id is not null then insert into public.group_members (group_id, profile_id) values (invitation.group_id, actor) on conflict (group_id, profile_id) where ended_at is null do nothing; end if;
  if invitation.status = 'pending' then update public.invitations set status = 'accepted', accepted_at = now() where id = invitation.id; activated_now := true; end if;
  if activated_now then
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details) values
      (actor, 'invitation.accepted', 'invitation', invitation.id, jsonb_build_object('profile_id', actor, 'role', invitation.intended_role, 'group_id', invitation.group_id)),
      (actor, 'invitation.activation_completed', 'invitation', invitation.id, jsonb_build_object('profile_id', actor));
  end if;
  return jsonb_build_object('invitation_id', invitation.id, 'account_stage', 'password_required');
end;
$$;

create or replace function public.assign_counseling_case_to_campus_lead(target_case_id uuid, target_profile_id uuid, reassignment_reason text default 'Reassigned by administrator')
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_campus uuid; new_assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then raise exception 'Only an Admin or Super Admin may assign a Campus Lead team'; end if;
  select campus_id into target_campus from public.counseling_cases where id = target_case_id for update;
  if target_campus is null then raise exception 'Counseling case not found'; end if;
  if not exists (
    select 1 from public.groups team
    join public.group_members membership on membership.group_id = team.id and membership.ended_at is null
    join public.profiles profile on profile.id = membership.profile_id and profile.status = 'active'
    join public.profile_roles role on role.profile_id = profile.id and role.role = 'campus_lead'
    join public.campus_lead_assignments scope on scope.profile_id = profile.id and scope.campus_id = target_campus and scope.ended_at is null
    where team.id = target_profile_id and team.campus_id = target_campus and team.active and team.group_type = 'campus_lead_team'
    group by team.id having count(distinct profile.id) = 2
  ) then raise exception 'Choose an active same-campus Campus Lead team'; end if;
  update public.case_assignments set ended_at = now(), end_reason = coalesce(nullif(btrim(reassignment_reason), ''), 'Reassigned by administrator') where counseling_case_id = target_case_id and assignment_type = 'campus_lead' and ended_at is null;
  insert into public.case_assignments (counseling_case_id, assigned_group_id, assignment_type, assigned_by) values (target_case_id, target_profile_id, 'campus_lead', actor) returning id into new_assignment_id;
  update public.counseling_cases set status = 'matched' where id = target_case_id and status in ('requested', 'assessment', 'interviewed');
  insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details) values (actor,'case.assigned','counseling_case',target_case_id,jsonb_build_object('assignment_id',new_assignment_id,'assignment_type','campus_lead','group_id',target_profile_id));
  return new_assignment_id;
end;
$$;

create or replace function public.assign_counseling_case_as_campus_lead(target_case_id uuid, target_group_id uuid, target_assignment_type public.case_assignment_type, reassignment_reason text default 'Reassigned by Campus Lead')
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_campus uuid; target_type public.group_type; own_team_id uuid; new_assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['campus_lead']::public.app_role[]) then raise exception 'Only an active Campus Lead may use this assignment path'; end if;
  select campus_id into target_campus from public.counseling_cases where id = target_case_id for update;
  if target_campus is null or not private.current_user_oversees_campus(target_campus) then raise exception 'Counseling case is outside the Campus Lead scope'; end if;
  if target_assignment_type = 'campus_lead' then
    select team.id into own_team_id from public.groups team join public.group_members membership on membership.group_id = team.id and membership.profile_id = actor and membership.ended_at is null where team.group_type = 'campus_lead_team' and team.campus_id = target_campus and team.active;
    if own_team_id is null or (target_group_id is not null and target_group_id <> own_team_id) then raise exception 'Campus Lead team assignment is not available'; end if;
    update public.case_assignments set ended_at = now(), end_reason = coalesce(nullif(btrim(reassignment_reason), ''), 'Reassigned by Campus Lead') where counseling_case_id = target_case_id and assignment_type = 'campus_lead' and ended_at is null;
    insert into public.case_assignments (counseling_case_id, assigned_group_id, assignment_type, assigned_by) values (target_case_id, own_team_id, 'campus_lead', actor) returning id into new_assignment_id;
  else
    if target_assignment_type not in ('coach', 'counselor') then raise exception 'Unsupported assignment target'; end if;
    target_type := case target_assignment_type when 'coach' then 'coach_team'::public.group_type else 'counselor_team'::public.group_type end;
    if not exists (select 1 from public.groups where id = target_group_id and campus_id = target_campus and active and group_type = target_type) then raise exception 'Choose an active same-campus Coach or Counselor team'; end if;
    update public.case_assignments set ended_at = now(), end_reason = coalesce(nullif(btrim(reassignment_reason), ''), 'Reassigned by Campus Lead') where counseling_case_id = target_case_id and assignment_type = target_assignment_type and ended_at is null;
    insert into public.case_assignments (counseling_case_id, assigned_group_id, assignment_type, assigned_by) values (target_case_id, target_group_id, target_assignment_type, actor) returning id into new_assignment_id;
  end if;
  update public.counseling_cases set status = 'matched' where id = target_case_id and status in ('requested', 'assessment', 'interviewed');
  insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details) values (actor,'case.assigned','counseling_case',target_case_id,jsonb_build_object('assignment_id',new_assignment_id,'assignment_type',target_assignment_type,'group_id',coalesce(target_group_id, own_team_id)));
  return new_assignment_id;
end;
$$;

create or replace function public.ensure_and_assign_counseling_case(target_couple_group_id uuid, target_group_id uuid, target_profile_id uuid, target_assignment_type public.case_assignment_type, reassignment_reason text default 'Reassigned by administrator')
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_case_id uuid; target_campus_id uuid; assignment_id uuid; is_admin boolean; is_campus_lead boolean;
begin
  is_admin := private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]); is_campus_lead := private.current_user_has_role(array['campus_lead']::public.app_role[]);
  if actor is null or not (is_admin or is_campus_lead) then raise exception 'Only an Admin, Super Admin, or Campus Lead may assign counseling cases'; end if;
  select campus_id into target_campus_id from public.groups where id = target_couple_group_id and group_type = 'couple' and active for update;
  if target_campus_id is null then raise exception 'Choose an active Couple'; end if;
  if not exists (select 1 from public.group_members member join public.profiles profile on profile.id = member.profile_id where member.group_id = target_couple_group_id and member.ended_at is null and profile.status = 'active' and profile.onboarding_completed_at is not null group by member.group_id having count(*) = 2) or exists (select 1 from public.invitations where group_id = target_couple_group_id and status = 'pending') then raise exception 'Couple is not ready for counseling assignment'; end if;
  insert into public.counseling_cases (campus_id, couple_group_id, status, created_by) values (target_campus_id, target_couple_group_id, 'requested', actor) on conflict (couple_group_id) do update set updated_at = public.counseling_cases.updated_at returning id into target_case_id;
  if is_admin then
    if target_assignment_type = 'campus_lead' then assignment_id := public.assign_counseling_case_to_campus_lead(target_case_id, target_group_id, reassignment_reason); else assignment_id := public.assign_counseling_case(target_case_id, target_group_id, target_assignment_type, reassignment_reason); end if;
  else
    if not private.current_user_oversees_campus(target_campus_id) then raise exception 'Counseling case is outside the Campus Lead scope'; end if;
    assignment_id := public.assign_counseling_case_as_campus_lead(target_case_id, target_group_id, target_assignment_type, reassignment_reason);
  end if;
  return assignment_id;
end;
$$;

create or replace function private.current_user_can_access_case(target_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.counseling_cases c where c.id = target_case_id and private.current_user_oversees_campus(c.campus_id))
    or exists (select 1 from public.counseling_cases c join public.group_members m on m.group_id = c.couple_group_id and m.profile_id = auth.uid() and m.ended_at is null where c.id = target_case_id and private.current_user_has_role(array['couple']::public.app_role[]))
    or exists (select 1 from public.case_assignments a join public.group_members m on m.group_id = a.assigned_group_id and m.profile_id = auth.uid() and m.ended_at is null where a.counseling_case_id = target_case_id and a.ended_at is null and ((a.assignment_type = 'coach' and private.current_user_has_role(array['coach']::public.app_role[])) or (a.assignment_type = 'counselor' and private.current_user_has_role(array['counselor']::public.app_role[])) or (a.assignment_type = 'campus_lead' and private.current_user_has_role(array['campus_lead']::public.app_role[]))))
    or exists (select 1 from public.case_assignments a where a.counseling_case_id = target_case_id and a.assigned_profile_id = auth.uid() and a.assignment_type = 'campus_lead' and a.ended_at is null and private.current_user_has_role(array['campus_lead']::public.app_role[]));
$$;
