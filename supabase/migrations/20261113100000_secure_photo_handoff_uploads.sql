alter table public.profile_photo_handoffs
  add column upload_attempt_id uuid,
  add column upload_object_path text,
  add column upload_claimed_at timestamptz,
  add column upload_previous_photo_path text;

create unique index profile_photo_handoffs_upload_attempt_id_key
  on public.profile_photo_handoffs (upload_attempt_id)
  where upload_attempt_id is not null;

create or replace function public.create_profile_photo_handoff()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  actor uuid := auth.uid();
  raw_token text := encode(gen_random_bytes(32), 'hex');
  expiry timestamptz := now() + interval '10 minutes';
  old_paths jsonb;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  perform 1 from public.profiles profile where profile.id = actor and profile.status = 'onboarding' for update;
  if not found then raise exception 'Onboarding is not available for this account'; end if;

  select coalesce(jsonb_agg(handoff.upload_object_path), '[]'::jsonb)
  into old_paths
  from public.profile_photo_handoffs handoff
  where handoff.profile_id = actor
    and handoff.completed_at is null
    and handoff.upload_object_path is not null;

  update public.profile_photo_handoffs
  set completed_at = now()
  where profile_id = actor and completed_at is null;

  insert into public.profile_photo_handoffs (profile_id, token_hash, expires_at)
  values (actor, encode(digest(raw_token, 'sha256'), 'hex'), expiry);

  return jsonb_build_object('token', raw_token, 'expires_at', expiry, 'superseded_paths', old_paths);
end;
$$;

create or replace function public.claim_profile_photo_handoff_upload(target_token_hash text, target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  target_profile_id uuid;
  handoff public.profile_photo_handoffs%rowtype;
  previous_photo_path text;
  next_path text;
  stale_path text;
begin
  if target_token_hash !~ '^[0-9a-f]{64}$' or target_attempt_id is null then raise exception 'Photo handoff is no longer valid'; end if;
  select profile_id into target_profile_id from public.profile_photo_handoffs where token_hash = target_token_hash;
  if not found then raise exception 'Photo handoff is no longer valid'; end if;

  select profile.photo_path into previous_photo_path
  from public.profiles profile
  where profile.id = target_profile_id and profile.status = 'onboarding'
  for update;
  if not found then raise exception 'Photo handoff is no longer valid'; end if;

  select * into handoff from public.profile_photo_handoffs where token_hash = target_token_hash for update;
  if not found or handoff.completed_at is not null or handoff.expires_at <= now() then
    raise exception 'Photo handoff is no longer valid';
  end if;
  if handoff.upload_attempt_id is not null and handoff.upload_claimed_at > now() - interval '2 minutes' then
    raise exception 'Photo upload is already in progress';
  end if;

  stale_path := handoff.upload_object_path;
  next_path := 'profiles/' || target_profile_id::text || '/handoffs/' || target_attempt_id::text || '.avif';
  update public.profile_photo_handoffs
  set upload_attempt_id = target_attempt_id,
      upload_object_path = next_path,
      upload_claimed_at = now(),
      upload_previous_photo_path = previous_photo_path
  where id = handoff.id;

  return jsonb_build_object('profile_id', target_profile_id, 'object_path', next_path, 'stale_object_path', stale_path);
end;
$$;

create or replace function public.finalize_profile_photo_handoff_upload(target_token_hash text, target_attempt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  target_profile_id uuid;
  handoff public.profile_photo_handoffs%rowtype;
  profile public.profiles%rowtype;
  expected_path text;
begin
  if target_token_hash !~ '^[0-9a-f]{64}$' or target_attempt_id is null then raise exception 'Photo handoff is no longer valid'; end if;
  select profile_id into target_profile_id from public.profile_photo_handoffs where token_hash = target_token_hash;
  if not found then raise exception 'Photo handoff is no longer valid'; end if;

  select * into profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Photo handoff is no longer valid'; end if;
  select * into handoff from public.profile_photo_handoffs where token_hash = target_token_hash for update;
  expected_path := 'profiles/' || target_profile_id::text || '/handoffs/' || target_attempt_id::text || '.avif';

  if handoff.completed_at is not null then
    return handoff.upload_attempt_id = target_attempt_id and profile.photo_path = expected_path;
  end if;
  if handoff.expires_at <= now()
    or handoff.upload_attempt_id is distinct from target_attempt_id
    or handoff.upload_object_path is distinct from expected_path
    or profile.status <> 'onboarding'
    or profile.photo_path is distinct from handoff.upload_previous_photo_path then
    raise exception 'Photo handoff is no longer valid';
  end if;
  if not exists (select 1 from storage.objects object where object.bucket_id = 'profile-photos' and object.name = expected_path) then
    raise exception 'Profile photo is missing';
  end if;

  update public.profiles set photo_path = expected_path where id = target_profile_id;
  update public.profile_photo_handoffs set completed_at = now() where id = handoff.id;
  return true;
end;
$$;

create or replace function public.release_profile_photo_handoff_upload(target_token_hash text, target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile_id uuid;
  handoff public.profile_photo_handoffs%rowtype;
  profile public.profiles%rowtype;
  expected_path text;
begin
  if target_token_hash !~ '^[0-9a-f]{64}$' or target_attempt_id is null then raise exception 'Photo handoff is no longer valid'; end if;
  select profile_id into target_profile_id from public.profile_photo_handoffs where token_hash = target_token_hash;
  if not found then raise exception 'Photo handoff is no longer valid'; end if;

  select * into profile from public.profiles where id = target_profile_id for update;
  if not found then raise exception 'Photo handoff is no longer valid'; end if;
  select * into handoff from public.profile_photo_handoffs where token_hash = target_token_hash for update;
  expected_path := 'profiles/' || target_profile_id::text || '/handoffs/' || target_attempt_id::text || '.avif';

  if profile.photo_path = expected_path then
    return jsonb_build_object('state', 'published', 'object_path', expected_path);
  end if;
  if handoff.upload_attempt_id = target_attempt_id then
    update public.profile_photo_handoffs
    set upload_attempt_id = null,
        upload_object_path = null,
        upload_claimed_at = null,
        upload_previous_photo_path = null
    where id = handoff.id and completed_at is null;
    return jsonb_build_object('state', 'released', 'object_path', expected_path);
  end if;
  return jsonb_build_object('state', 'superseded', 'object_path', expected_path);
end;
$$;

create or replace function private.profile_photo_is_saved(target_profile_id uuid, target_photo_path text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
    when target_photo_path in (
      'profiles/' || target_profile_id::text || '/avatar.webp',
      'profiles/' || target_profile_id::text || '/avatar.avif'
    ) then exists (
      select 1 from storage.objects object
      where object.bucket_id = 'profile-photos' and object.name = target_photo_path
    )
    else exists (
      select 1
      from public.profile_photo_handoffs handoff
      join storage.objects object on object.bucket_id = 'profile-photos' and object.name = handoff.upload_object_path
      where handoff.profile_id = target_profile_id
        and handoff.upload_object_path = target_photo_path
        and handoff.completed_at is not null
        and target_photo_path ~ ('^profiles/' || target_profile_id::text || '/handoffs/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.avif$')
    )
  end;
$$;

revoke all on function private.profile_photo_is_saved(uuid, text) from public, anon, authenticated;

create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = public, storage, auth, private
as $$
declare
  actor uuid := auth.uid();
  profile public.profiles%rowtype;
  phone_digits text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select * into profile from public.profiles where id = actor for update;
  if not found or profile.status <> 'onboarding' then raise exception 'Onboarding is not available for this account'; end if;
  phone_digits := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g');
  if btrim(profile.first_name) = '' or btrim(profile.last_name) = '' or profile.email is null or profile.campus_id is null
    or length(phone_digits) < 7 or length(phone_digits) > 15
    or not private.profile_photo_is_saved(profile.id, profile.photo_path) then
    raise exception 'Complete all required onboarding requirements';
  end if;
  update public.profiles set status = 'active', onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = actor;
end;
$$;

create or replace function private.profile_has_complete_onboarding_requirements(profile public.profiles)
returns boolean
language plpgsql
stable
set search_path = public, storage
as $$
declare
  phone_digits text := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g');
begin
  return btrim(coalesce(profile.first_name, '')) <> ''
    and btrim(coalesce(profile.last_name, '')) <> ''
    and btrim(coalesce(profile.email, '')) <> ''
    and profile.campus_id is not null
    and phone_digits ~ '^1[0-9]{10}$'
    and private.profile_photo_is_saved(profile.id, profile.photo_path);
end;
$$;

drop policy if exists profile_photo_owner_select on storage.objects;
create policy profile_photo_owner_select on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    name in ('profiles/' || auth.uid()::text || '/avatar.webp', 'profiles/' || auth.uid()::text || '/avatar.avif')
    or name ~ ('^profiles/' || auth.uid()::text || '/handoffs/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.avif$')
  )
);

revoke execute on function public.claim_profile_photo_handoff_upload(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_profile_photo_handoff_upload(text, uuid) to service_role;
revoke execute on function public.finalize_profile_photo_handoff_upload(text, uuid) from public, anon, authenticated;
grant execute on function public.finalize_profile_photo_handoff_upload(text, uuid) to service_role;
revoke execute on function public.release_profile_photo_handoff_upload(text, uuid) from public, anon, authenticated;
grant execute on function public.release_profile_photo_handoff_upload(text, uuid) to service_role;
revoke execute on function public.complete_profile_photo_handoff(text) from public, anon, authenticated, service_role;
