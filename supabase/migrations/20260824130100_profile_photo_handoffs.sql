create or replace function public.create_profile_photo_handoff()
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare actor uuid := auth.uid(); raw_token text := encode(gen_random_bytes(32), 'hex'); expiry timestamptz := now() + interval '10 minutes';
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  if not exists (select 1 from public.profiles where id = actor and status = 'invited') then raise exception 'Onboarding is not available for this account'; end if;
  update public.profile_photo_handoffs set completed_at = now() where profile_id = actor and completed_at is null;
  insert into public.profile_photo_handoffs (profile_id, token_hash, expires_at) values (actor, encode(digest(raw_token, 'sha256'), 'hex'), expiry);
  return jsonb_build_object('token', raw_token, 'expires_at', expiry);
end; $$;
revoke execute on function public.create_profile_photo_handoff() from public, anon, authenticated;
grant execute on function public.create_profile_photo_handoff() to authenticated;
