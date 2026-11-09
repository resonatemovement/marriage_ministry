create function public.get_dashboard_team_availability()
returns table(
  team_id uuid,
  team_name text,
  team_type text,
  campus_name text,
  accepting_new_couples boolean,
  couple_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  is_global_admin boolean;
  is_scoped_campus_lead boolean;
begin
  if actor is null or not private.current_user_is_active() then
    raise exception 'Not authorized to view Team Availability';
  end if;

  is_global_admin := private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]);
  is_scoped_campus_lead := not is_global_admin
    and private.current_user_has_role(array['campus_lead']::public.app_role[]);

  if not is_global_admin and not is_scoped_campus_lead then
    raise exception 'Not authorized to view Team Availability';
  end if;

  return query
  select
    team.id,
    team.name,
    team.group_type::text,
    campus.name,
    team.accepting_new_couples,
    count(distinct couple.id)::bigint
  from public.groups team
  left join public.campuses campus on campus.id = team.campus_id
  left join public.case_assignments assignment
    on assignment.assigned_group_id = team.id
   and assignment.assignment_type = 'counselor'
   and assignment.ended_at is null
  left join public.counseling_cases counseling_case on counseling_case.id = assignment.counseling_case_id
  left join public.groups couple
    on couple.id = counseling_case.couple_group_id
   and couple.group_type = 'couple'
   and couple.active
  where team.active
    and team.group_type in ('campus_lead_team', 'coach_team', 'counselor_team')
    and (
      is_global_admin
      or (is_scoped_campus_lead and private.current_user_oversees_campus(team.campus_id))
    )
  group by team.id, team.name, team.group_type, campus.name, team.accepting_new_couples
  order by count(distinct couple.id), team.name, team.id;
end;
$$;

revoke all on function public.get_dashboard_team_availability() from public, anon;
grant execute on function public.get_dashboard_team_availability() to authenticated;
comment on function public.get_dashboard_team_availability() is
  'Returns active counseling team availability and direct active Counselor-of-record Couple counts. Admins receive global scope; Campus Leads receive only assigned active-campus teams. No Couple identities or Case details are returned.';
