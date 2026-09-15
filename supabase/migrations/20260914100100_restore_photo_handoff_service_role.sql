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

  expected_path := 'profiles/' || handoff.profile_id::text || '/avatar.avif';
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then
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

revoke execute on function public.complete_profile_photo_handoff(text) from public, anon, authenticated;
grant execute on function public.complete_profile_photo_handoff(text) to service_role;
