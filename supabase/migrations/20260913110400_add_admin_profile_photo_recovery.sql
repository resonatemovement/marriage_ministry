create or replace function public.admin_set_profile_photo(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, storage, private
as $$
declare actor uuid := auth.uid(); expected_path text := 'profiles/' || target_profile_id::text || '/avatar.webp';
begin
  if actor is null or not private.current_user_has_role(array['admin','super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.profiles where id = target_profile_id and status <> 'active') then raise exception 'Only incomplete onboarding profiles can be recovered'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set photo_path = expected_path where id = target_profile_id;
end;
$$;

revoke execute on function public.admin_set_profile_photo(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_profile_photo(uuid) to authenticated;
