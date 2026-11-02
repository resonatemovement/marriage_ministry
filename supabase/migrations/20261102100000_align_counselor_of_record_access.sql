create or replace function private.current_user_can_access_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.groups target_group
      where target_group.id = target_group_id
        and (
          (
            private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])
            and private.current_user_oversees_campus(target_group.campus_id)
          )
          or (
            target_group.group_type <> 'couple'
            and private.current_user_oversees_campus(target_group.campus_id)
          )
        )
    )
    or exists (
      select 1
      from public.group_members membership
      where membership.group_id = target_group_id
        and membership.profile_id = (select auth.uid())
        and membership.ended_at is null
    )
    or exists (
      select 1
      from public.supervision_assignments supervision
      join public.groups supervised_team
        on supervised_team.id = supervision.counselor_group_id
       and supervised_team.group_type = 'counselor_team'
      join public.group_members coach_membership
        on coach_membership.group_id = supervision.coach_group_id
       and coach_membership.profile_id = (select auth.uid())
       and coach_membership.ended_at is null
      where supervision.counselor_group_id = target_group_id
        and supervision.ended_at is null
        and (select private.current_user_has_role(array['coach']::public.app_role[]))
    )
    or exists (
      select 1
      from public.counseling_cases counseling_case
      join public.case_assignments counselor_assignment
        on counselor_assignment.counseling_case_id = counseling_case.id
       and counselor_assignment.assignment_type = 'counselor'
       and counselor_assignment.ended_at is null
      join public.groups assigned_team
        on assigned_team.id = counselor_assignment.assigned_group_id
       and assigned_team.active
      join public.group_members team_member
        on team_member.group_id = assigned_team.id
       and team_member.profile_id = (select auth.uid())
       and team_member.ended_at is null
      where counseling_case.couple_group_id = target_group_id
        and (select private.current_user_has_role(array['coach', 'campus_lead', 'counselor']::public.app_role[]))
    );
$$;

create or replace function private.current_user_can_access_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.profiles target_profile
      where target_profile.id = target_profile_id
        and (
          (
            private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])
            and private.current_user_oversees_campus(target_profile.campus_id)
          )
          or (
            private.current_user_has_role(array['campus_lead']::public.app_role[])
            and private.current_user_oversees_campus(target_profile.campus_id)
            and not private.current_user_has_role(array['couple']::public.app_role[])
            and not exists (
              select 1
              from public.group_members couple_membership
              join public.groups couple_group
                on couple_group.id = couple_membership.group_id
               and couple_group.group_type = 'couple'
              where couple_membership.profile_id = target_profile.id
            )
          )
        )
    )
    or exists (
      select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.profile_id = (select auth.uid())
        and mine.ended_at is null
        and theirs.profile_id = target_profile_id
        and theirs.ended_at is null
    )
    or exists (
      select 1
      from public.supervision_assignments supervision
      join public.group_members coach_membership
        on coach_membership.group_id = supervision.coach_group_id
       and coach_membership.profile_id = (select auth.uid())
       and coach_membership.ended_at is null
      join public.group_members counselor_membership
        on counselor_membership.group_id = supervision.counselor_group_id
       and counselor_membership.profile_id = target_profile_id
       and counselor_membership.ended_at is null
      where supervision.ended_at is null
        and (select private.current_user_has_role(array['coach']::public.app_role[]))
    )
    or exists (
      select 1
      from public.counseling_cases counseling_case
      join public.group_members couple_member
        on couple_member.group_id = counseling_case.couple_group_id
       and couple_member.profile_id = target_profile_id
       and couple_member.ended_at is null
      join public.case_assignments counselor_assignment
        on counselor_assignment.counseling_case_id = counseling_case.id
       and counselor_assignment.assignment_type = 'counselor'
       and counselor_assignment.ended_at is null
      join public.groups assigned_team
        on assigned_team.id = counselor_assignment.assigned_group_id
       and assigned_team.active
      join public.group_members team_member
        on team_member.group_id = assigned_team.id
       and team_member.profile_id = (select auth.uid())
       and team_member.ended_at is null
      where (select private.current_user_has_role(array['coach', 'campus_lead', 'counselor']::public.app_role[]))
    );
$$;

create or replace function private.current_user_can_access_case(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      (select private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]))
      and exists (
        select 1 from public.counseling_cases counseling_case
        where counseling_case.id = target_case_id
      )
    )
    or exists (
      select 1
      from public.counseling_cases counseling_case
      join public.group_members couple_member
        on couple_member.group_id = counseling_case.couple_group_id
       and couple_member.profile_id = (select auth.uid())
       and couple_member.ended_at is null
      where counseling_case.id = target_case_id
        and (select private.current_user_has_role(array['couple']::public.app_role[]))
    )
    or exists (
      select 1
      from public.case_assignments counselor_assignment
      join public.groups assigned_team
        on assigned_team.id = counselor_assignment.assigned_group_id
       and assigned_team.active
      join public.group_members team_member
        on team_member.group_id = assigned_team.id
       and team_member.profile_id = (select auth.uid())
       and team_member.ended_at is null
      where counselor_assignment.counseling_case_id = target_case_id
        and counselor_assignment.assignment_type = 'counselor'
        and counselor_assignment.ended_at is null
        and (select private.current_user_has_role(array['coach', 'campus_lead', 'counselor']::public.app_role[]))
    );
$$;

create or replace function private.current_user_can_manage_counseling_case(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    (
      private.current_user_has_role(array['campus_lead']::public.app_role[])
      and private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])
      and exists (
        select 1 from public.counseling_cases counseling_case
        where counseling_case.id = target_case_id
          and private.current_user_oversees_campus(counseling_case.campus_id)
      )
    )
    or exists (
      select 1
      from public.case_assignments counselor_assignment
      join public.groups assigned_team
        on assigned_team.id = counselor_assignment.assigned_group_id
       and assigned_team.active
      join public.group_members team_member
        on team_member.group_id = assigned_team.id
       and team_member.profile_id = auth.uid()
       and team_member.ended_at is null
      where counselor_assignment.counseling_case_id = target_case_id
        and counselor_assignment.assignment_type = 'counselor'
        and counselor_assignment.ended_at is null
        and private.current_user_has_role(array['coach', 'counselor', 'campus_lead']::public.app_role[])
    )
  );
$$;

create or replace function public.get_campus_lead_assignment_candidates(target_campus_id uuid)
returns table (
  couple_group_id uuid,
  group_name text,
  campus_id uuid,
  campus_name text,
  case_status text,
  assignment_eligible boolean,
  partners jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not private.current_user_has_role(array['campus_lead']::public.app_role[])
    or not private.current_user_oversees_campus(target_campus_id)
    or not exists (
      select 1
      from public.groups lead_team
      join public.group_members lead_member
        on lead_member.group_id = lead_team.id
       and lead_member.profile_id = auth.uid()
       and lead_member.ended_at is null
      where lead_team.group_type = 'campus_lead_team'
        and lead_team.campus_id = target_campus_id
        and lead_team.active
    ) then
    raise exception 'Not authorized to view Couple assignment candidates';
  end if;

  return query
  select
    couple.id,
    couple.name,
    couple.campus_id,
    campus.name,
    counseling_case.status::text,
    true,
    ready_members.partners
  from public.groups couple
  join public.campuses campus on campus.id = couple.campus_id and campus.active
  left join public.counseling_cases counseling_case on counseling_case.couple_group_id = couple.id
  join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'firstName', profile.first_name,
        'lastName', profile.last_name,
        'gender', profile.gender
      ) order by member.joined_at, member.id
    ) as partners
    from public.group_members member
    join public.profiles profile on profile.id = member.profile_id
    where member.group_id = couple.id
      and member.ended_at is null
    having count(*) = 2
      and bool_and(
        profile.status = 'active'
        and profile.onboarding_completed_at is not null
        and nullif(btrim(profile.first_name), '') is not null
        and nullif(btrim(profile.last_name), '') is not null
        and nullif(btrim(profile.email), '') is not null
        and profile.campus_id is not null
        and nullif(btrim(profile.photo_path), '') is not null
        and (
          length(regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')) = 10
          or (
            length(regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')) = 11
            and left(regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g'), 1) = '1'
          )
        )
      )
  ) ready_members on true
  where couple.group_type = 'couple'
    and couple.active
    and couple.campus_id = target_campus_id
    and (
      counseling_case.id is null
      or not exists (
        select 1
        from public.case_assignments counselor_assignment
        where counselor_assignment.counseling_case_id = counseling_case.id
          and counselor_assignment.assignment_type = 'counselor'
          and counselor_assignment.ended_at is null
      )
    )
    and not exists (
      select 1
      from public.invitations invitation
      where invitation.group_id = couple.id
        and invitation.status = 'pending'
    )
  order by couple.name, couple.id;
end;
$$;

revoke all on function public.get_campus_lead_assignment_candidates(uuid) from public, anon, authenticated;
grant execute on function public.get_campus_lead_assignment_candidates(uuid) to authenticated;
comment on function public.get_campus_lead_assignment_candidates(uuid) is
  'Returns only minimal, eligible, unassigned Couple identity/readiness data to an authorized Campus Lead for assignment. Does not grant Couple group, profile, or Case access.';
