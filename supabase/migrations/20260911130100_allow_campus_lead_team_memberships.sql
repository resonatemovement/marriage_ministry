create or replace function private.validate_group_member_role()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare required_role public.app_role;
begin
  select case group_type
    when 'couple' then 'couple'::public.app_role
    when 'coach_team' then 'coach'::public.app_role
    when 'counselor_team' then 'counselor'::public.app_role
    when 'campus_lead_team' then 'campus_lead'::public.app_role
  end into required_role
  from public.groups where id = new.group_id;

  if required_role is null or not exists (
    select 1 from public.profile_roles where profile_id = new.profile_id and role = required_role
  ) then raise exception 'Profile does not hold the role required by this group'; end if;
  return new;
end;
$$;
