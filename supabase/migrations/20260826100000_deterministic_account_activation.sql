-- profiles.status is the authoritative application account-stage field.
alter type public.profile_status add value if not exists 'password_required';
alter type public.profile_status add value if not exists 'onboarding';

create or replace function public.record_invitation_auth_identity(
  target_invitation_id uuid,
  target_auth_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, auth, private
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only Admin or Super Admin may prepare invitation accounts';
  end if;

  update public.invitations
  set auth_user_id = target_auth_user_id
  where id = target_invitation_id and status = 'pending';
  if not found then raise exception 'Pending invitation not found'; end if;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'invitation.auth_identity_created', 'invitation', target_invitation_id,
    jsonb_build_object('auth_user_id', target_auth_user_id));
end;
$$;

create or replace function public.record_invitation_auth_reset(target_invitation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, auth, private
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Only Admin or Super Admin may reset invitation accounts';
  end if;

  update public.invitations
  set auth_user_id = null,
      last_delivery_attempt_at = null,
      last_delivery_succeeded_at = null,
      delivery_error_category = null
  where id = target_invitation_id and status = 'pending';
  if not found then raise exception 'Pending invitation not found'; end if;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'invitation.auth_identity_reset', 'invitation', target_invitation_id, '{}'::jsonb);
end;
$$;

create or replace function public.activate_invitation_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  invitation public.invitations%rowtype;
  group_kind public.group_type;
  activated_now boolean := false;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select lower(email) into actor_email from auth.users where id = actor;
  if actor_email is null then raise exception 'Authenticated account has no email'; end if;

  select * into invitation from public.invitations
  where auth_user_id = actor
  for update;
  if not found then raise exception 'Invitation not found for this account'; end if;
  if invitation.email <> actor_email then raise exception 'Invitation email does not match account'; end if;
  if invitation.status = 'revoked' then raise exception 'Invitation revoked'; end if;
  if invitation.status <> 'pending' and not (invitation.status = 'accepted' and invitation.auth_user_id = actor) then
    raise exception 'Invitation expired';
  end if;
  if invitation.expires_at is not null and invitation.expires_at <= now() and invitation.status <> 'accepted' then
    raise exception 'Invitation expired';
  end if;
  if not exists (select 1 from public.campuses where id = invitation.campus_id and active) then
    raise exception 'Invitation campus is invalid';
  end if;

  if invitation.intended_role in ('couple', 'coach', 'counselor') then
    if invitation.group_id is null then raise exception 'Invitation group is invalid'; end if;
    select group_type into group_kind from public.groups where id = invitation.group_id and active;
    if group_kind is null
      or (invitation.intended_role = 'couple' and group_kind <> 'couple')
      or (invitation.intended_role = 'coach' and group_kind <> 'coach_team')
      or (invitation.intended_role = 'counselor' and group_kind <> 'counselor_team') then
      raise exception 'Invitation group is invalid';
    end if;
  elsif invitation.group_id is not null then
    raise exception 'Invitation group is invalid';
  end if;

  if exists (select 1 from public.profiles where id = actor and status = 'active') then
    raise exception 'Account is already active';
  end if;

  insert into public.profiles (id, campus_id, first_name, last_name, email, status)
  values (actor, invitation.campus_id, invitation.first_name, invitation.last_name, actor_email, 'password_required')
  on conflict (id) do update set
    campus_id = excluded.campus_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    status = case when public.profiles.status = 'onboarding' then 'onboarding'::public.profile_status else 'password_required'::public.profile_status end;
  insert into public.profile_roles (profile_id, role, assigned_by)
  values (actor, invitation.intended_role, actor) on conflict (profile_id, role) do nothing;
  if invitation.group_id is not null then
    insert into public.group_members (group_id, profile_id) values (invitation.group_id, actor)
    on conflict (group_id, profile_id) where ended_at is null do nothing;
  end if;
  if invitation.status = 'pending' then
    update public.invitations set status = 'accepted', accepted_at = now() where id = invitation.id;
    activated_now := true;
  end if;
  if activated_now then
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
    values (actor, 'invitation.accepted', 'invitation', invitation.id,
      jsonb_build_object('profile_id', actor, 'role', invitation.intended_role, 'group_id', invitation.group_id));
  end if;
  if activated_now then
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
    values (actor, 'invitation.activation_completed', 'invitation', invitation.id,
      jsonb_build_object('profile_id', actor));
  end if;
  return jsonb_build_object('invitation_id', invitation.id, 'account_stage', 'password_required');
end;
$$;

create or replace function public.enter_onboarding()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  update public.profiles set status = 'onboarding' where id = actor and status = 'password_required';
  if not found then
    if exists (select 1 from public.profiles where id = actor and status = 'onboarding') then return; end if;
    raise exception 'Password setup is not available for this account';
  end if;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values
    (actor, 'account.password_established', 'profile', actor, '{}'::jsonb),
    (actor, 'account.onboarding_entered', 'profile', actor, '{}'::jsonb);
end;
$$;

create or replace function public.save_onboarding_profile(target_first_name text, target_last_name text, target_phone text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid(); normalized_first_name text := btrim(target_first_name); normalized_last_name text := btrim(target_last_name); normalized_phone text := btrim(target_phone); phone_digits text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  if normalized_first_name = '' then raise exception 'First name is required'; end if;
  if normalized_last_name = '' then raise exception 'Last name is required'; end if;
  phone_digits := regexp_replace(normalized_phone, '[^0-9]', '', 'g');
  if normalized_phone !~ '^[0-9+(). -]+$' or length(phone_digits) < 7 or length(phone_digits) > 15 then raise exception 'Enter a valid phone number'; end if;
  update public.profiles set first_name = normalized_first_name, last_name = normalized_last_name, phone = normalized_phone where id = actor and status = 'onboarding';
  if not found then raise exception 'Onboarding is not available for this account'; end if;
  return jsonb_build_object('first_name', normalized_first_name, 'last_name', normalized_last_name, 'phone', normalized_phone);
end;
$$;

create or replace function public.record_onboarding_photo()
returns void language plpgsql security definer set search_path = public, storage, auth as $$
declare actor uuid := auth.uid(); expected_path text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  expected_path := 'profiles/' || actor::text || '/avatar.webp';
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set photo_path = expected_path where id = actor and status = 'onboarding';
  if not found then raise exception 'Onboarding is not available for this account'; end if;
end;
$$;

create or replace function public.complete_onboarding()
returns void language plpgsql security definer set search_path = public, storage, auth as $$
declare actor uuid := auth.uid(); profile public.profiles%rowtype; phone_digits text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select * into profile from public.profiles where id = actor for update;
  if not found or profile.status <> 'onboarding' then raise exception 'Onboarding is not available for this account'; end if;
  phone_digits := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g');
  if btrim(profile.first_name) = '' or btrim(profile.last_name) = '' or profile.email is null or profile.campus_id is null or length(phone_digits) < 7 or length(phone_digits) > 15 or profile.photo_path <> 'profiles/' || actor::text || '/avatar.webp' then raise exception 'Complete all required onboarding requirements'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = profile.photo_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set status = 'active', onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = actor;
end;
$$;

revoke execute on function public.record_invitation_auth_identity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_invitation_auth_identity(uuid, uuid) to authenticated;
revoke execute on function public.record_invitation_auth_reset(uuid) from public, anon, authenticated;
grant execute on function public.record_invitation_auth_reset(uuid) to authenticated;
revoke execute on function public.activate_invitation_account() from public, anon, authenticated;
grant execute on function public.activate_invitation_account() to authenticated;
revoke execute on function public.enter_onboarding() from public, anon, authenticated;
grant execute on function public.enter_onboarding() to authenticated;
revoke execute on function public.save_onboarding_profile(text, text, text) from public, anon, authenticated;
grant execute on function public.save_onboarding_profile(text, text, text) to authenticated;
revoke execute on function public.record_onboarding_photo() from public, anon, authenticated;
grant execute on function public.record_onboarding_photo() to authenticated;
revoke execute on function public.complete_onboarding() from public, anon, authenticated;
grant execute on function public.complete_onboarding() to authenticated;
