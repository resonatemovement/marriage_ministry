alter table public.groups
  add column accepting_new_couples boolean not null default true;

create function public.get_my_counseling_team_availability(target_group_type text)
returns table(team_id uuid, accepting_new_couples boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select team.id, team.accepting_new_couples
  from public.groups team
  join public.group_members membership
    on membership.group_id = team.id
   and membership.profile_id = (select auth.uid())
   and membership.ended_at is null
  where team.active
    and team.group_type::text = target_group_type
    and (
      (target_group_type = 'counselor_team' and private.current_user_has_role(array['counselor']::public.app_role[]))
      or (target_group_type = 'coach_team' and private.current_user_has_role(array['coach']::public.app_role[]))
      or (target_group_type = 'campus_lead_team' and private.current_user_has_role(array['campus_lead']::public.app_role[]))
    )
  order by team.id
  limit 1;
$$;

create function public.set_my_counseling_team_availability(
  target_team_id uuid,
  target_accepting_new_couples boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_accepting_new_couples is null or not private.current_user_is_active() then
    raise exception 'Not authorized';
  end if;

  update public.groups team
  set accepting_new_couples = target_accepting_new_couples,
      updated_at = now()
  where team.id = target_team_id
    and team.active
    and (
      (team.group_type = 'counselor_team' and private.current_user_has_role(array['counselor']::public.app_role[]))
      or (team.group_type = 'coach_team' and private.current_user_has_role(array['coach']::public.app_role[]))
      or (team.group_type = 'campus_lead_team' and private.current_user_has_role(array['campus_lead']::public.app_role[]))
    )
    and exists (
      select 1 from public.group_members membership
      where membership.group_id = team.id
        and membership.profile_id = (select auth.uid())
        and membership.ended_at is null
    );

  if not found then raise exception 'Not authorized'; end if;
  return true;
end;
$$;

revoke all on function public.get_my_counseling_team_availability(text) from public, anon;
revoke all on function public.set_my_counseling_team_availability(uuid, boolean) from public, anon;
grant execute on function public.get_my_counseling_team_availability(text) to authenticated;
grant execute on function public.set_my_counseling_team_availability(uuid, boolean) to authenticated;
