-- Return only the Couple identity fields needed by the counseling workspace.
-- Access is limited to counseling cases already visible to the authenticated caller.
create or replace function public.get_counseling_workspace_couple_identity(target_case_id uuid)
returns table (
  counseling_case_id uuid,
  couple_group_id uuid,
  profile_id uuid,
  first_name text,
  last_name text,
  photo_path text
)
language sql stable security definer set search_path = '' as $$
  select counseling_case.id,
    couple_group.id,
    profile.id,
    profile.first_name,
    profile.last_name,
    profile.photo_path
  from public.counseling_cases counseling_case
  join public.groups couple_group
    on couple_group.id = counseling_case.couple_group_id
   and couple_group.group_type = 'couple'
  join public.group_members membership
    on membership.group_id = couple_group.id
   and membership.ended_at is null
  join public.profiles profile on profile.id = membership.profile_id
  where counseling_case.id = target_case_id
    and private.current_user_can_access_case(counseling_case.id)
  order by profile.first_name, profile.last_name, profile.id;
$$;

revoke all on function public.get_counseling_workspace_couple_identity(uuid) from public, anon, authenticated;
grant execute on function public.get_counseling_workspace_couple_identity(uuid) to authenticated;
