-- A Couple may see only the single current Counselor-of-record, not every
-- historical or concurrently active Counselor-role assignment.

create or replace function public.get_current_couple_case_counselor()
returns table (
  counseling_case_id uuid,
  counselor_group_id uuid,
  counselor_name text
)
language sql stable security definer set search_path = '' as $$
  select counseling_case.id, assignment.assigned_group_id, counselor_group.name
  from public.counseling_cases counseling_case
  join public.case_assignments assignment
    on assignment.counseling_case_id = counseling_case.id
   and assignment.assignment_type = 'counselor'
   and assignment.ended_at is null
   and assignment.assigned_group_id is not null
  join public.groups counselor_group on counselor_group.id = assignment.assigned_group_id
  where private.current_user_has_role(array['couple']::public.app_role[])
    and private.current_user_can_access_case(counseling_case.id)
  order by counseling_case.id, assignment.started_at desc
  limit 1;
$$;

create or replace function public.get_counseling_contact_group(
  target_case_id uuid,
  target_group_id uuid
)
returns table (
  group_id uuid,
  group_name text,
  group_type text,
  assignment_type text,
  campus_name text,
  member_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  photo_path text,
  profile_status text,
  onboarding_completed_at timestamptz,
  roles text[]
)
language sql stable security definer set search_path = '' as $$
  with authorized_case as (
    select counseling_case.couple_group_id,
      case
        when private.current_user_has_role(array['couple']::public.app_role[])
          and private.current_user_can_access_case(counseling_case.id) then 'couple'
        when private.current_user_can_manage_counseling_case(counseling_case.id) then 'care_team'
      end as actor_kind
    from public.counseling_cases counseling_case
    where counseling_case.id = target_case_id
  ), permitted_group as (
    select authorized_case.*
    from authorized_case
    where actor_kind = 'couple'
      and target_group_id = (
        select assignment.assigned_group_id
        from public.case_assignments assignment
        where assignment.counseling_case_id = target_case_id
          and assignment.assignment_type = 'counselor'
          and assignment.ended_at is null
          and assignment.assigned_group_id is not null
        order by assignment.started_at desc
        limit 1
      )
    union all
    select authorized_case.*
    from authorized_case
    where actor_kind = 'care_team'
      and (
        couple_group_id = target_group_id
        or exists (
          select 1
          from public.case_assignments assignment
          where assignment.counseling_case_id = target_case_id
            and assignment.assigned_group_id = target_group_id
            and assignment.ended_at is null
        )
      )
  )
  select contact_group.id,
    contact_group.name,
    contact_group.group_type::text,
    case when contact_group.id = permitted_group.couple_group_id then 'couple'
      else (
        select assignment.assignment_type::text
        from public.case_assignments assignment
        where assignment.counseling_case_id = target_case_id
          and assignment.assigned_group_id = contact_group.id
          and assignment.ended_at is null
        order by assignment.started_at desc
        limit 1
      )
    end,
    campus.name,
    profile.id,
    profile.first_name,
    profile.last_name,
    profile.email,
    profile.phone,
    profile.photo_path,
    profile.status::text,
    profile.onboarding_completed_at,
    coalesce((
      select array_agg(profile_role.role::text order by profile_role.role::text)
      from public.profile_roles profile_role
      where profile_role.profile_id = profile.id
    ), array[]::text[])
  from permitted_group
  join public.groups contact_group on contact_group.id = target_group_id and contact_group.active
  left join public.campuses campus on campus.id = contact_group.campus_id
  join public.group_members membership on membership.group_id = contact_group.id and membership.ended_at is null
  join public.profiles profile on profile.id = membership.profile_id
  order by profile.first_name, profile.last_name, profile.id;
$$;
