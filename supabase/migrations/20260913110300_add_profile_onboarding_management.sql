create or replace function public.update_own_profile(
  target_first_name text,
  target_last_name text,
  target_phone text,
  target_photo_path text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare actor uuid := auth.uid(); normalized_phone text := btrim(target_phone); phone_digits text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  if btrim(target_first_name) = '' or btrim(target_last_name) = '' then raise exception 'First and last name are required'; end if;
  phone_digits := regexp_replace(normalized_phone, '[^0-9]', '', 'g');
  if normalized_phone !~ '^[0-9+(). -]+$' or length(phone_digits) < 7 or length(phone_digits) > 15 then raise exception 'Enter a valid phone number'; end if;
  if target_photo_path is not null and target_photo_path <> 'profiles/' || actor::text || '/avatar.webp' then raise exception 'Profile photo is invalid'; end if;
  update public.profiles set first_name = btrim(target_first_name), last_name = btrim(target_last_name), phone = normalized_phone, photo_path = coalesce(target_photo_path, photo_path)
    where id = actor and status = 'active';
  if not found then raise exception 'Active profile not found'; end if;
end;
$$;

create or replace function public.admin_update_incomplete_profile(
  target_profile_id uuid,
  target_first_name text,
  target_last_name text,
  target_phone text,
  target_campus_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare actor uuid := auth.uid(); normalized_phone text := btrim(target_phone); phone_digits text;
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if btrim(target_first_name) = '' or btrim(target_last_name) = '' then raise exception 'First and last name are required'; end if;
  phone_digits := regexp_replace(normalized_phone, '[^0-9]', '', 'g');
  if normalized_phone !~ '^[0-9+(). -]+$' or length(phone_digits) < 7 or length(phone_digits) > 15 then raise exception 'Enter a valid phone number'; end if;
  if not exists (select 1 from public.campuses where id = target_campus_id and active) then raise exception 'Choose an active campus'; end if;
  update public.profiles set first_name = btrim(target_first_name), last_name = btrim(target_last_name), phone = normalized_phone, campus_id = target_campus_id
    where id = target_profile_id and status <> 'active';
  if not found then raise exception 'Only incomplete onboarding profiles can be recovered'; end if;
end;
$$;

create or replace function public.admin_complete_onboarding(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, storage, private
as $$
declare actor uuid := auth.uid(); profile public.profiles%rowtype; phone_digits text; expected_path text;
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;
  phone_digits := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g'); expected_path := 'profiles/' || profile.id::text || '/avatar.webp';
  if btrim(profile.first_name) = '' or btrim(profile.last_name) = '' or profile.email is null or profile.campus_id is null or length(phone_digits) < 7 or length(phone_digits) > 15 or profile.photo_path <> expected_path then raise exception 'Complete all required onboarding requirements'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set status = 'active', onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = target_profile_id;
end;
$$;

revoke execute on function public.update_own_profile(text,text,text,text) from public, anon;
revoke execute on function public.admin_update_incomplete_profile(uuid,text,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.admin_complete_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.update_own_profile(text,text,text,text) to authenticated;
grant execute on function public.admin_update_incomplete_profile(uuid,text,text,text,uuid) to authenticated;
grant execute on function public.admin_complete_onboarding(uuid) to authenticated;
