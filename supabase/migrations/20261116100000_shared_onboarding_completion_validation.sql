create or replace function private.onboarding_completion_missing_requirements(profile public.profiles)
returns text[]
language plpgsql
stable
security definer
set search_path = public, storage, private
as $$
declare
  missing text[] := array[]::text[];
  phone_digits text := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g');
begin
  if profile.status <> 'onboarding' or profile.onboarding_completed_at is not null then
    missing := array_append(missing, 'onboarding status');
  end if;
  if btrim(coalesce(profile.first_name, '')) = '' then missing := array_append(missing, 'first name'); end if;
  if btrim(coalesce(profile.last_name, '')) = '' then missing := array_append(missing, 'last name'); end if;
  if btrim(coalesce(profile.email, '')) = '' then missing := array_append(missing, 'email'); end if;
  if profile.campus_id is null then missing := array_append(missing, 'campus'); end if;
  if phone_digits !~ '^1[0-9]{10}$' then missing := array_append(missing, 'phone'); end if;
  if not private.profile_photo_is_saved(profile.id, profile.photo_path) then
    missing := array_append(missing, 'profile photo');
  end if;
  return missing;
end;
$$;

revoke all on function private.onboarding_completion_missing_requirements(public.profiles) from public, anon, authenticated;

create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = public, storage, auth, private
as $$
declare
  actor uuid := auth.uid();
  profile public.profiles%rowtype;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select * into profile from public.profiles where id = actor for update;
  if not found or profile.status <> 'onboarding' then
    raise exception 'Onboarding is not available for this account';
  end if;
  if cardinality(private.onboarding_completion_missing_requirements(profile)) > 0 then
    raise exception 'Complete all required onboarding requirements';
  end if;
  update public.profiles
  set status = 'active', onboarding_completed_at = now()
  where id = actor and status = 'onboarding' and onboarding_completed_at is null;
  if not found then raise exception 'Onboarding is not available for this account'; end if;
end;
$$;

create or replace function public.admin_complete_onboarding(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  actor uuid := auth.uid();
  profile public.profiles%rowtype;
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select * into profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if cardinality(private.onboarding_completion_missing_requirements(profile)) > 0 then
    raise exception 'Complete all required onboarding requirements';
  end if;
  update public.profiles
  set status = 'active', onboarding_completed_at = now()
  where id = target_profile_id and status = 'onboarding' and onboarding_completed_at is null;
  if not found then raise exception 'Complete all required onboarding requirements'; end if;
end;
$$;

create or replace function public.admin_get_onboarding_readiness(target_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  actor uuid := auth.uid();
  profile public.profiles%rowtype;
  missing text[];
  state_eligible boolean;
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select * into profile from public.profiles where id = target_profile_id;
  if not found then raise exception 'Profile not found'; end if;
  state_eligible := profile.status = 'onboarding' and profile.onboarding_completed_at is null;
  missing := private.onboarding_completion_missing_requirements(profile);
  return jsonb_build_object(
    'eligible', cardinality(missing) = 0,
    'stateEligible', state_eligible,
    'missing', to_jsonb(missing)
  );
end;
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
revoke all on function public.admin_complete_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.admin_complete_onboarding(uuid) to authenticated;
revoke all on function public.admin_get_onboarding_readiness(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_onboarding_readiness(uuid) to authenticated;
