create or replace function public.accept_invitation()
returns jsonb language plpgsql security definer set search_path = public, auth, private as $$
declare actor uuid := auth.uid(); actor_email text; invitation public.invitations%rowtype; group_kind public.group_type; matching_invitations integer; accepted_now boolean := false;
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
  values (actor, invitation.campus_id, invitation.first_name, invitation.last_name, actor_email, 'invited'::public.profile_status)
  on conflict (id) do update set campus_id = excluded.campus_id, first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email, status = case when public.profiles.status = 'active' then 'active'::public.profile_status else 'invited'::public.profile_status end;
  insert into public.profile_roles (profile_id, role, assigned_by) values (actor, invitation.intended_role, actor) on conflict (profile_id, role) do nothing;
  if invitation.group_id is not null then insert into public.group_members (group_id, profile_id) values (invitation.group_id, actor) on conflict (group_id, profile_id) where ended_at is null do nothing; end if;
  if invitation.status = 'pending' then update public.invitations set status = 'accepted', accepted_at = now(), auth_user_id = actor where id = invitation.id; accepted_now := true; end if;
  if accepted_now then insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details) values (actor, 'invitation.accepted', 'invitation', invitation.id, jsonb_build_object('profile_id', actor, 'role', invitation.intended_role, 'group_id', invitation.group_id)); end if;
  return jsonb_build_object('invitation_id', invitation.id, 'role', invitation.intended_role, 'group_id', invitation.group_id);
end;
$$;
