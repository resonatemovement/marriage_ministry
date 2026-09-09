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
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  if not exists (select 1 from public.profiles where id = actor and status = 'onboarding') then
    raise exception 'Onboarding is not available for this account';
  end if;

  -- A fresh code invalidates every earlier code for this profile.
  update public.profile_photo_handoffs
  set completed_at = now()
  where profile_id = actor and completed_at is null;

  insert into public.profile_photo_handoffs (profile_id, token_hash, expires_at)
  values (actor, encode(digest(raw_token, 'sha256'), 'hex'), expiry);

  return jsonb_build_object('token', raw_token, 'expires_at', expiry);
end;
$$;

create or replace function public.complete_profile_photo_handoff(target_token_hash text)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  handoff public.profile_photo_handoffs%rowtype;
  expected_path text;
begin
  select * into handoff
  from public.profile_photo_handoffs
  where token_hash = target_token_hash
  for update;

  if not found or handoff.completed_at is not null or handoff.expires_at <= now() then
    raise exception 'Photo handoff is no longer valid';
  end if;

  expected_path := 'profiles/' || handoff.profile_id::text || '/avatar.webp';
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'profile-photos' and name = expected_path
  ) then
    raise exception 'Profile photo is missing';
  end if;

  update public.profiles
  set photo_path = expected_path
  where id = handoff.profile_id and status = 'onboarding';
  if not found then raise exception 'Onboarding is not available for this account'; end if;

  update public.profile_photo_handoffs
  set completed_at = now()
  where id = handoff.id and completed_at is null;
end;
$$;

revoke execute on function public.create_profile_photo_handoff() from public, anon, authenticated;
grant execute on function public.create_profile_photo_handoff() to authenticated;
revoke execute on function public.complete_profile_photo_handoff(text) from public, anon, authenticated;
grant execute on function public.complete_profile_photo_handoff(text) to service_role;
