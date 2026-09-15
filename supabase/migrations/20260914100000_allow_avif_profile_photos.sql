update storage.buckets
set allowed_mime_types = array['image/avif', 'image/webp', 'image/jpeg', 'image/png']
where id = 'profile-photos';

drop policy if exists profile_photo_owner_select on storage.objects;
drop policy if exists profile_photo_owner_insert on storage.objects;
drop policy if exists profile_photo_owner_update on storage.objects;

create policy profile_photo_owner_select on storage.objects for select to authenticated
using (bucket_id = 'profile-photos' and name in ('profiles/' || auth.uid()::text || '/avatar.webp', 'profiles/' || auth.uid()::text || '/avatar.avif'));

create policy profile_photo_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'profile-photos' and name = 'profiles/' || auth.uid()::text || '/avatar.avif');

create policy profile_photo_owner_update on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and name = 'profiles/' || auth.uid()::text || '/avatar.avif')
with check (bucket_id = 'profile-photos' and name = 'profiles/' || auth.uid()::text || '/avatar.avif');

create or replace function public.record_onboarding_photo()
returns void language plpgsql security definer set search_path = public, storage, auth as $$
declare actor uuid := auth.uid(); expected_path text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  expected_path := 'profiles/' || actor::text || '/avatar.avif';
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set photo_path = expected_path where id = actor and status = 'onboarding';
  if not found then raise exception 'Onboarding is not available for this account'; end if;
end; $$;

create or replace function public.complete_onboarding()
returns void language plpgsql security definer set search_path = public, storage, auth as $$
declare actor uuid := auth.uid(); profile public.profiles%rowtype; phone_digits text; legacy_path text; avif_path text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select * into profile from public.profiles where id = actor for update;
  if not found or profile.status <> 'onboarding' then raise exception 'Onboarding is not available for this account'; end if;
  phone_digits := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g');
  legacy_path := 'profiles/' || actor::text || '/avatar.webp'; avif_path := 'profiles/' || actor::text || '/avatar.avif';
  if btrim(profile.first_name) = '' or btrim(profile.last_name) = '' or profile.email is null or profile.campus_id is null or length(phone_digits) < 7 or length(phone_digits) > 15 or profile.photo_path not in (legacy_path, avif_path) then raise exception 'Complete all required onboarding requirements'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = profile.photo_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set status = 'active', onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = actor;
end; $$;

create or replace function public.update_own_profile(target_first_name text, target_last_name text, target_phone text, target_photo_path text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid(); normalized_phone text := btrim(target_phone); phone_digits text; legacy_path text; avif_path text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  if btrim(target_first_name) = '' or btrim(target_last_name) = '' then raise exception 'First and last name are required'; end if;
  phone_digits := regexp_replace(normalized_phone, '[^0-9]', '', 'g');
  if normalized_phone !~ '^[0-9+(). -]+$' or length(phone_digits) < 7 or length(phone_digits) > 15 then raise exception 'Enter a valid phone number'; end if;
  legacy_path := 'profiles/' || actor::text || '/avatar.webp'; avif_path := 'profiles/' || actor::text || '/avatar.avif';
  if target_photo_path is not null and target_photo_path not in (legacy_path, avif_path) then raise exception 'Profile photo is invalid'; end if;
  update public.profiles set first_name = btrim(target_first_name), last_name = btrim(target_last_name), phone = normalized_phone, photo_path = coalesce(target_photo_path, photo_path) where id = actor and status = 'active';
  if not found then raise exception 'Active profile not found'; end if;
end; $$;

create or replace function public.admin_set_profile_photo(target_profile_id uuid)
returns void language plpgsql security definer set search_path = public, auth, storage, private as $$
declare actor uuid := auth.uid(); expected_path text := 'profiles/' || target_profile_id::text || '/avatar.avif';
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.profiles where id = target_profile_id and status <> 'active') then raise exception 'Only incomplete onboarding profiles can be recovered'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set photo_path = expected_path where id = target_profile_id;
end; $$;

create or replace function public.admin_complete_onboarding(target_profile_id uuid)
returns void language plpgsql security definer set search_path = public, auth, storage, private as $$
declare actor uuid := auth.uid(); profile public.profiles%rowtype; phone_digits text; legacy_path text; avif_path text;
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;
  phone_digits := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g');
  legacy_path := 'profiles/' || profile.id::text || '/avatar.webp'; avif_path := 'profiles/' || profile.id::text || '/avatar.avif';
  if btrim(profile.first_name) = '' or btrim(profile.last_name) = '' or profile.email is null or profile.campus_id is null or length(phone_digits) < 7 or length(phone_digits) > 15 or profile.photo_path not in (legacy_path, avif_path) then raise exception 'Complete all required onboarding requirements'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = profile.photo_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set status = 'active', onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = target_profile_id;
end; $$;

create or replace function public.complete_profile_photo_handoff(target_token_hash text)
returns void language plpgsql security definer set search_path = public, storage, auth as $$
declare actor uuid := auth.uid(); handoff public.profile_photo_handoffs%rowtype; expected_path text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select * into handoff from public.profile_photo_handoffs where token_hash = target_token_hash for update;
  if not found or handoff.completed_at is not null or handoff.expires_at <= now() then raise exception 'Photo handoff is no longer valid'; end if;
  expected_path := 'profiles/' || handoff.profile_id::text || '/avatar.avif';
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set photo_path = expected_path where id = handoff.profile_id and status = 'onboarding';
  if not found then raise exception 'Onboarding is not available for this account'; end if;
  update public.profile_photo_handoffs set completed_at = now() where id = handoff.id;
end; $$;

revoke execute on function public.record_onboarding_photo() from public, anon, authenticated;
grant execute on function public.record_onboarding_photo() to authenticated;
revoke execute on function public.complete_onboarding() from public, anon, authenticated;
grant execute on function public.complete_onboarding() to authenticated;
revoke execute on function public.update_own_profile(text,text,text,text) from public, anon;
grant execute on function public.update_own_profile(text,text,text,text) to authenticated;
revoke execute on function public.admin_set_profile_photo(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_profile_photo(uuid) to authenticated;
revoke execute on function public.admin_complete_onboarding(uuid) from public, anon, authenticated;
grant execute on function public.admin_complete_onboarding(uuid) to authenticated;
revoke execute on function public.complete_profile_photo_handoff(text) from public, anon, authenticated;
grant execute on function public.complete_profile_photo_handoff(text) to authenticated;
