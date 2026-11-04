-- Read-only Case progress for a directly responsible or actively supervising team.
-- This is intentionally separate from current_user_can_access_case: supervision
-- must not grant access to full Case, Homework, or Assessment data.
create or replace function public.get_counseling_oversight_progress(target_team_id uuid)
returns table (
  team_id uuid,
  team_name text,
  counseling_case_id uuid,
  couple_group_id uuid,
  couple_name text,
  case_status text,
  session_progress text,
  next_meeting_at timestamptz,
  homework_status text
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
      private.current_user_has_role(array['campus_lead']::public.app_role[]) as is_campus_lead
  ),
  active_coach_teams as (
    select g.id
    from public.groups g
    join public.group_members m on m.group_id = g.id and m.profile_id = (select profile_id from caller) and m.ended_at is null
    where g.group_type = 'coach_team' and g.active
      and (select is_coach from caller)
  ),
  active_campus_lead_teams as (
    select g.id
    from public.groups g
    join public.group_members m on m.group_id = g.id and m.profile_id = (select profile_id from caller) and m.ended_at is null
    where g.group_type = 'campus_lead_team' and g.active
      and (select is_campus_lead from caller)
  ),
  supervised_coach_teams as (
    select assignment.coach_group_id as id
    from public.campus_lead_coach_assignments assignment
    join active_campus_lead_teams lead on lead.id = assignment.campus_lead_group_id
    join public.groups coach on coach.id = assignment.coach_group_id and coach.group_type = 'coach_team' and coach.active
    where assignment.ended_at is null
  ),
  allowed_teams as (
    select id from active_coach_teams
    union
    select supervision.counselor_group_id
    from public.supervision_assignments supervision
    join active_coach_teams coach on coach.id = supervision.coach_group_id
    join public.groups counselor on counselor.id = supervision.counselor_group_id and counselor.group_type = 'counselor_team' and counselor.active
    where supervision.ended_at is null
    union
    select id from active_campus_lead_teams
    union
    select id from supervised_coach_teams
    union
    select supervision.counselor_group_id
    from public.supervision_assignments supervision
    join supervised_coach_teams coach on coach.id = supervision.coach_group_id
    join public.groups counselor on counselor.id = supervision.counselor_group_id and counselor.group_type = 'counselor_team' and counselor.active
    where supervision.ended_at is null
    union
    select g.id
    from public.groups g
    where (select is_admin from caller)
      and g.group_type in ('campus_lead_team', 'coach_team', 'counselor_team')
      and g.active
  ),
  permitted_team as (
    select team.id, team.name
    from public.groups team
    where team.id = target_team_id
      and team.active
      and exists (select 1 from allowed_teams allowed where allowed.id = team.id)
  )
  select team.id,
    team.name,
    counseling_case.id,
    couple.id,
    coalesce(nullif(names.couple_name, ''), couple.name),
    counseling_case.status::text,
    case when active_session.actual_sequence is null then 'Initial Meeting'
      else format('Session %s of %s', active_session.actual_sequence, session_total.total)
    end,
    next_meeting.starts_at,
    case when active_session.id is null or active_session.homework_assignment_revision_id is null then 'Not assigned'
      when private.case_session_homework_complete(counseling_case.id, active_session.session_id) then 'Complete'
      else 'In progress'
    end
  from permitted_team team
  join public.case_assignments assignment
    on assignment.assigned_group_id = team.id
   and assignment.assignment_type = 'counselor'
   and assignment.ended_at is null
  join public.counseling_cases counseling_case on counseling_case.id = assignment.counseling_case_id
  join public.groups couple on couple.id = counseling_case.couple_group_id and couple.group_type = 'couple'
  left join lateral (
    select string_agg(nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), ''), ' & '
      order by case profile.gender when 'male' then 0 when 'female' then 1 else 2 end, profile.id) as couple_name
    from public.group_members membership
    join public.profiles profile on profile.id = membership.profile_id
    where membership.group_id = couple.id and membership.ended_at is null
  ) names on true
  left join lateral (
    select case_session.id, case_session.session_id, case_session.actual_sequence,
      case_session.homework_assignment_revision_id
    from public.case_sessions case_session
    where case_session.counseling_case_id = counseling_case.id and case_session.status = 'active'
    order by case_session.actual_sequence desc limit 1
  ) active_session on true
  cross join lateral (
    select greatest(count(*)::integer, 0) as total
    from public.sessions session_template where session_template.status = 'published'
  ) session_total
  left join lateral (
    select meeting.starts_at
    from public.case_session_meetings meeting
    where meeting.counseling_case_id = counseling_case.id
      and meeting.completed_at is null and meeting.starts_at >= now()
    order by meeting.starts_at, meeting.id limit 1
  ) next_meeting on true
  order by couple_name, counseling_case.id;
$$;

revoke all on function public.get_counseling_oversight_progress(uuid) from public, anon;
grant execute on function public.get_counseling_oversight_progress(uuid) to authenticated;

-- Campus Leads need the Counselor child-team identities under one of their
-- actively assigned Coach teams; this returns no Couple or Case information.
create or replace function public.get_oversight_counselor_teams(target_coach_team_id uuid)
returns table (id uuid, name text, campus_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select counselor.id, counselor.name, campus.name
  from public.groups counselor
  left join public.campuses campus on campus.id = counselor.campus_id
  where counselor.group_type = 'counselor_team'
    and counselor.active
    and exists (
      select 1
      from public.supervision_assignments supervision
      join public.groups coach on coach.id = supervision.coach_group_id
        and coach.id = target_coach_team_id and coach.group_type = 'coach_team' and coach.active
      where supervision.counselor_group_id = counselor.id
        and supervision.ended_at is null
        and (
          private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])
          or (
            private.current_user_has_role(array['coach']::public.app_role[])
            and exists (select 1 from public.group_members member where member.group_id = coach.id and member.profile_id = auth.uid() and member.ended_at is null)
          )
          or (
            private.current_user_has_role(array['campus_lead']::public.app_role[])
            and exists (
              select 1
              from public.campus_lead_coach_assignments lead_assignment
              join public.group_members lead_member on lead_member.group_id = lead_assignment.campus_lead_group_id
                and lead_member.profile_id = auth.uid() and lead_member.ended_at is null
              join public.groups lead on lead.id = lead_assignment.campus_lead_group_id
                and lead.group_type = 'campus_lead_team' and lead.active
              where lead_assignment.coach_group_id = coach.id and lead_assignment.ended_at is null
            )
          )
        )
    )
  order by counselor.name;
$$;

revoke all on function public.get_oversight_counselor_teams(uuid) from public, anon;
grant execute on function public.get_oversight_counselor_teams(uuid) to authenticated;
