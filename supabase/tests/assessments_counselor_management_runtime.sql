-- Read-only DEV authorization check. No fixture rows are created.
begin;

do $$
declare
  case_id uuid;
  assigned_counselor_id uuid;
  other_counselor_id uuid;
  admin_id uuid;
  couple_id uuid;
begin
  select counseling_case.id into case_id
  from public.counseling_cases counseling_case
  join public.case_assignments assignment
    on assignment.counseling_case_id = counseling_case.id
    and assignment.assignment_type = 'counselor' and assignment.ended_at is null
  where counseling_case.closed_at is null
  order by counseling_case.id limit 1;
  if case_id is null then raise exception 'No active assigned DEV Case is available for read-only validation'; end if;

  select member.profile_id into assigned_counselor_id
  from public.case_assignments assignment
  join public.group_members member on member.group_id = assignment.assigned_group_id and member.ended_at is null
  where assignment.counseling_case_id = case_id and assignment.assignment_type = 'counselor' and assignment.ended_at is null
  order by member.profile_id limit 1;
  select profile.id into other_counselor_id
  from public.profiles profile join public.profile_roles role_map on role_map.profile_id = profile.id and role_map.role = 'counselor'
  where profile.status = 'active' and profile.id <> assigned_counselor_id
    and not exists (
      select 1 from public.case_assignments assignment
      join public.group_members member on member.group_id = assignment.assigned_group_id and member.profile_id = profile.id and member.ended_at is null
      where assignment.counseling_case_id = case_id and assignment.assignment_type = 'counselor' and assignment.ended_at is null
    )
  order by profile.id limit 1;
  select profile.id into admin_id
  from public.profiles profile join public.profile_roles role_map on role_map.profile_id = profile.id and role_map.role = 'admin'
  where profile.status = 'active' order by profile.id limit 1;
  select member.profile_id into couple_id
  from public.counseling_cases counseling_case
  join public.group_members member on member.group_id = counseling_case.couple_group_id and member.ended_at is null
  where counseling_case.id = case_id order by member.profile_id limit 1;

  if assigned_counselor_id is null or other_counselor_id is null or admin_id is null or couple_id is null then
    raise exception 'Required existing DEV role identities are unavailable';
  end if;
  perform set_config('assessment_m5.case_id', case_id::text, true);
  perform set_config('assessment_m5.assigned_counselor_id', assigned_counselor_id::text, true);
  perform set_config('assessment_m5.other_counselor_id', other_counselor_id::text, true);
  perform set_config('assessment_m5.admin_id', admin_id::text, true);
  perform set_config('assessment_m5.couple_id', couple_id::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  case_id uuid := current_setting('assessment_m5.case_id')::uuid;
  catalog_count integer;
begin
  perform set_config('request.jwt.claim.sub', current_setting('assessment_m5.assigned_counselor_id'), true);
  select count(*) into catalog_count from public.get_case_assessment_catalog(case_id);
  if catalog_count = 0 then raise exception 'Assigned Counselor could not read the Assessment catalog'; end if;

  perform set_config('request.jwt.claim.sub', current_setting('assessment_m5.admin_id'), true);
  select count(*) into catalog_count from public.get_case_assessment_catalog(case_id);
  if catalog_count = 0 then raise exception 'Admin could not read the Assessment catalog'; end if;

  perform set_config('request.jwt.claim.sub', current_setting('assessment_m5.other_counselor_id'), true);
  begin
    perform count(*) from public.get_case_assessment_catalog(case_id);
    raise exception 'Unassigned Counselor unexpectedly read the catalog';
  exception when others then
    if sqlerrm <> 'Not authorized' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', current_setting('assessment_m5.couple_id'), true);
  begin
    perform count(*) from public.get_case_assessment_catalog(case_id);
    raise exception 'Couple user unexpectedly read the management catalog';
  exception when others then
    if sqlerrm <> 'Not authorized' then raise; end if;
  end;
end;
$$;

rollback;
