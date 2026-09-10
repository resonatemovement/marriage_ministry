alter table public.profiles
  add column photo_path text,
  add column onboarding_completed_at timestamptz;

create table public.profile_photo_handoffs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profile_photo_handoffs enable row level security;
revoke all on public.profile_photo_handoffs from anon, authenticated;
grant all on public.profile_photo_handoffs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy profile_photo_owner_select on storage.objects for select to authenticated
using (bucket_id = 'profile-photos' and name = 'profiles/' || auth.uid()::text || '/avatar.webp');
create policy profile_photo_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'profile-photos' and name = 'profiles/' || auth.uid()::text || '/avatar.webp');
create policy profile_photo_owner_update on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and name = 'profiles/' || auth.uid()::text || '/avatar.webp')
with check (bucket_id = 'profile-photos' and name = 'profiles/' || auth.uid()::text || '/avatar.webp');
create policy profile_photo_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'profile-photos' and name = 'profiles/' || auth.uid()::text || '/avatar.webp');

create or replace function public.record_onboarding_photo()
returns void language plpgsql security definer set search_path = public, storage, auth as $$
declare actor uuid := auth.uid(); expected_path text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  expected_path := 'profiles/' || actor::text || '/avatar.webp';
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = expected_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set photo_path = expected_path where id = actor and status = 'invited';
  if not found then raise exception 'Onboarding is not available for this account'; end if;
end; $$;

create or replace function public.complete_onboarding()
returns void language plpgsql security definer set search_path = public, storage, auth as $$
declare actor uuid := auth.uid(); profile public.profiles%rowtype; phone_digits text;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select * into profile from public.profiles where id = actor for update;
  if not found or profile.status <> 'invited' then raise exception 'Onboarding is not available for this account'; end if;
  phone_digits := regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g');
  if btrim(profile.first_name) = '' or btrim(profile.last_name) = '' or profile.email is null or profile.campus_id is null or length(phone_digits) < 7 or length(phone_digits) > 15 or profile.photo_path <> 'profiles/' || actor::text || '/avatar.webp' then
    raise exception 'Complete all required onboarding requirements';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'profile-photos' and name = profile.photo_path) then raise exception 'Profile photo is missing'; end if;
  update public.profiles set status = 'active', onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = actor;
end; $$;

revoke execute on function public.record_onboarding_photo() from public, anon, authenticated;
grant execute on function public.record_onboarding_photo() to authenticated;
revoke execute on function public.complete_onboarding() from public, anon, authenticated;
grant execute on function public.complete_onboarding() to authenticated;
