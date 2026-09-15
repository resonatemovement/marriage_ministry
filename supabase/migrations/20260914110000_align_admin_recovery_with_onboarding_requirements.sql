create or replace function private.profile_has_complete_onboarding_requirements(profile public.profiles)
returns boolean
language plpgsql
stable
set search_path = public, storage
as $$
declare
  phone_digits text := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g');
  legacy_path text := 'profiles/' || profile.id::text || '/avatar.webp';
  avif_path text := 'profiles/' || profile.id::text || '/avatar.avif';
begin
  return btrim(coalesce(profile.first_name, '')) <> ''
    and btrim(coalesce(profile.last_name, '')) <> ''
    and btrim(coalesce(profile.email, '')) <> ''
    and profile.campus_id is not null
    and phone_digits ~ '^1[0-9]{10}$'
    and profile.photo_path in (legacy_path, avif_path)
    and exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = profile.photo_path);
end;
$$;

create or replace function public.admin_assert_incomplete_profile(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  actor uuid := auth.uid();
  profile public.profiles%rowtype;
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if private.profile_has_complete_onboarding_requirements(profile) then raise exception 'Profile onboarding is already complete'; end if;
end;
$$;

create or replace function public.admin_update_incomplete_profile(target_profile_id uuid, target_first_name text, target_last_name text, target_phone text, target_campus_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  actor uuid := auth.uid();
  profile public.profiles%rowtype;
  normalized_phone text := btrim(target_phone);
  phone_digits text;
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if private.profile_has_complete_onboarding_requirements(profile) then raise exception 'Profile onboarding is already complete'; end if;
  if btrim(target_first_name) = '' or btrim(target_last_name) = '' then raise exception 'First and last name are required'; end if;
  phone_digits := regexp_replace(normalized_phone, '[^0-9]', '', 'g');
  if normalized_phone !~ '^[0-9+(). -]+$' or phone_digits !~ '^1[0-9]{10}$' then raise exception 'Enter a valid phone number'; end if;
  if not exists (select 1 from public.campuses where id = target_campus_id and active) then raise exception 'Choose an active campus'; end if;
  update public.profiles set first_name = btrim(target_first_name), last_name = btrim(target_last_name), phone = normalized_phone, campus_id = target_campus_id where id = target_profile_id;
end;
$$;

create or replace function public.admin_set_profile_photo(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, storage, private
as $$
declare
  actor uuid := auth.uid();
  profile public.profiles%rowtype;
  expected_path text := 'profiles/' || target_profile_id::text || '/avatar.avif';
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if private.profile_has_complete_onboarding_requirements(profile) then raise exception 'Profile onboarding is already complete'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set photo_path = expected_path where id = target_profile_id;
end;
$$;

revoke execute on function public.admin_assert_incomplete_profile(uuid) from public, anon, authenticated;
grant execute on function public.admin_assert_incomplete_profile(uuid) to authenticated;
revoke execute on function public.admin_update_incomplete_profile(uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_update_incomplete_profile(uuid,text,text,text,uuid) to authenticated;
revoke execute on function public.admin_set_profile_photo(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_profile_photo(uuid) to authenticated;
