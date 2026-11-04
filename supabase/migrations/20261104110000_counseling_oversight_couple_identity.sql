-- Minimum Couple identity for a Case in an actively supervised counseling team.
-- This is separate from full Case/profile authorization: it grants no access to
-- Case details, contacts, Homework, or Assessment records.
create or replace function public.get_counseling_oversight_couple_identity(
  target_team_id uuid,
  target_case_id uuid
)
returns table (
  counseling_case_id uuid,
  couple_group_id uuid,
  group_name text,
  profile_id uuid,
  first_name text,
  last_name text,
  photo_path text,
  gender text
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select auth.uid() as profile_id,
      private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]) as is_admin,
      private.current_user_has_role(array['coach']::public.app_role[]) as is_coach,
      private.current_user_has_role(array['campus_lead']::public.app_role[]) as is_campus_lead,
      private.current_user_has_role(array['counselor']::public.app_role[]) as is_counselor
  ),
  active_coach_teams as (
    select team.id
    from public.groups team
    join public.group_members member on member.group_id = team.id
      and member.profile_id = (select profile_id from caller)
      and member.ended_at is null
    where team.group_type = 'coach_team' and team.active
      and (select is_coach from caller)
  ),
  active_campus_lead_teams as (
    select team.id
    from public.groups team
    join public.group_members member on member.group_id = team.id
      and member.profile_id = (select profile_id from caller)
      and member.ended_at is null
    where team.group_type = 'campus_lead_team' and team.active
      and (select is_campus_lead from caller)
  ),
  supervised_coach_teams as (
    select assignment.coach_group_id as id
    from public.campus_lead_coach_assignments assignment
    join active_campus_lead_teams lead on lead.id = assignment.campus_lead_group_id
    join public.groups coach on coach.id = assignment.coach_group_id
      and coach.group_type = 'coach_team' and coach.active
    where assignment.ended_at is null
  ),
  supervised_counselor_teams as (
    select supervision.counselor_group_id as id
    from public.supervision_assignments supervision
    join active_coach_teams coach on coach.id = supervision.coach_group_id
    join public.groups counselor on counselor.id = supervision.counselor_group_id
      and counselor.group_type = 'counselor_team' and counselor.active
    where supervision.ended_at is null
    union
    select supervision.counselor_group_id
    from public.supervision_assignments supervision
    join supervised_coach_teams coach on coach.id = supervision.coach_group_id
    join public.groups counselor on counselor.id = supervision.counselor_group_id
      and counselor.group_type = 'counselor_team' and counselor.active
    where supervision.ended_at is null
  ),
  permitted_team as (
    select id from active_coach_teams
    union select id from active_campus_lead_teams
    union select id from supervised_coach_teams
    union select id from supervised_counselor_teams
  ),
  active_counselor_assignment as (
    select counseling_case.id, counseling_case.couple_group_id, couple.name
    from public.counseling_cases counseling_case
    join public.case_assignments assignment on assignment.counseling_case_id = counseling_case.id
      and assignment.assigned_group_id = target_team_id
      and assignment.assignment_type = 'counselor'
      and assignment.ended_at is null
    join public.groups team on team.id = assignment.assigned_group_id
      and team.active
      and team.group_type in ('coach_team', 'campus_lead_team', 'counselor_team')
    join public.groups couple on couple.id = counseling_case.couple_group_id
      and couple.group_type = 'couple'
    where counseling_case.id = target_case_id
      and exists (
        select 1 from caller
        where caller.profile_id is not null
          and (
            caller.is_admin
            or (
              (caller.is_coach or caller.is_campus_lead or caller.is_counselor)
              and (
                exists (
                  select 1 from public.group_members member
                  where member.group_id = team.id
                    and member.profile_id = caller.profile_id
                    and member.ended_at is null
                )
                or exists (select 1 from permitted_team permitted where permitted.id = team.id)
              )
            )
          )
      )
  )
  select assignment.id,
    assignment.couple_group_id,
    assignment.name,
    profile.id,
    profile.first_name,
    profile.last_name,
    profile.photo_path,
    profile.gender
  from active_counselor_assignment assignment
  join public.group_members membership on membership.group_id = assignment.couple_group_id
    and membership.ended_at is null
  join public.profiles profile on profile.id = membership.profile_id
  order by profile.first_name, profile.last_name, profile.id;
$$;

revoke all on function public.get_counseling_oversight_couple_identity(uuid, uuid) from public, anon;
grant execute on function public.get_counseling_oversight_couple_identity(uuid, uuid) to authenticated;
