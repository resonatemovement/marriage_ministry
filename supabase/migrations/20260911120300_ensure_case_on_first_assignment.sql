create or replace function public.ensure_and_assign_counseling_case(
  target_couple_group_id uuid,
  target_group_id uuid,
  target_profile_id uuid,
  target_assignment_type public.case_assignment_type,
  reassignment_reason text default 'Reassigned by administrator'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_case_id uuid;
  target_campus_id uuid;
  assignment_id uuid;
  is_admin boolean;
  is_campus_lead boolean;
begin
  is_admin := private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]);
  is_campus_lead := private.current_user_has_role(array['campus_lead']::public.app_role[]);
  if actor is null or not (is_admin or is_campus_lead) then
    raise exception 'Only an Admin, Super Admin, or Campus Lead may assign counseling cases';
  end if;

  select campus_id into target_campus_id
  from public.groups
  where id = target_couple_group_id and group_type = 'couple' and active
  for update;
  if target_campus_id is null then
    raise exception 'Choose an active Couple';
  end if;

  if not exists (
    select 1
    from public.group_members member
    join public.profiles profile on profile.id = member.profile_id
    where member.group_id = target_couple_group_id
      and member.ended_at is null
      and profile.status = 'active'
      and profile.onboarding_completed_at is not null
    group by member.group_id
    having count(*) = 2
  ) or exists (
    select 1 from public.invitations
    where group_id = target_couple_group_id and status = 'pending'
  ) then
    raise exception 'Couple is not ready for counseling assignment';
  end if;

  insert into public.counseling_cases (campus_id, couple_group_id, status, created_by)
  values (target_campus_id, target_couple_group_id, 'requested', actor)
  on conflict (couple_group_id) do update set updated_at = public.counseling_cases.updated_at
  returning id into target_case_id;

  if is_admin then
    if target_assignment_type = 'campus_lead' then
      assignment_id := public.assign_counseling_case_to_campus_lead(target_case_id, target_profile_id, reassignment_reason);
    else
      assignment_id := public.assign_counseling_case(target_case_id, target_group_id, target_assignment_type, reassignment_reason);
    end if;
  else
    if not private.current_user_oversees_campus(target_campus_id) then
      raise exception 'Counseling case is outside the Campus Lead scope';
    end if;
    assignment_id := public.assign_counseling_case_as_campus_lead(target_case_id, target_group_id, target_assignment_type, reassignment_reason);
  end if;

  return assignment_id;
end;
$$;

revoke execute on function public.ensure_and_assign_counseling_case(uuid, uuid, uuid, public.case_assignment_type, text) from public, anon;
grant execute on function public.ensure_and_assign_counseling_case(uuid, uuid, uuid, public.case_assignment_type, text) to authenticated;
