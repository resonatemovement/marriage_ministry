-- Authenticated DEV authorization test. All temporary changes roll back.
begin;

do $$
declare
  test_case record;
  team_id uuid;
  member_id uuid;
  other_id uuid;
  saved_value boolean;
  observed_value boolean;
  identities jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'groups'
      and column_name = 'accepting_new_couples'
      and column_default = 'true' and is_nullable = 'NO'
  ) then raise exception 'Availability field does not default to ON'; end if;

  insert into public.groups (group_type, name)
  values ('counselor_team', 'rollback availability default test')
  returning id into team_id;
  select accepting_new_couples into observed_value from public.groups where id = team_id;
  if observed_value is distinct from true then raise exception 'New team default is not ON'; end if;

  for test_case in select * from (values
    ('counselor_team', 'counselor'::public.app_role),
    ('coach_team', 'coach'::public.app_role),
    ('campus_lead_team', 'campus_lead'::public.app_role)
  ) as expected(team_type, app_role) loop
    select team.id, member.profile_id into team_id, member_id
    from public.groups team
    join public.group_members member on member.group_id = team.id and member.ended_at is null
    join public.profile_roles role_map on role_map.profile_id = member.profile_id and role_map.role = test_case.app_role
    join public.profiles profile on profile.id = member.profile_id and profile.status = 'active'
    where team.group_type::text = test_case.team_type and team.active
    order by team.id, member.profile_id limit 1;
    if team_id is null or member_id is null then raise exception 'No active DEV member/team available for role %', test_case.app_role; end if;
    select team.accepting_new_couples into saved_value from public.groups team where team.id = team_id;
    select profile.id into other_id from public.profiles profile
    join public.profile_roles role_map on role_map.profile_id = profile.id and role_map.role <> test_case.app_role
    where profile.status = 'active' and profile.id <> member_id
      and not exists (select 1 from public.group_members membership where membership.group_id = team_id and membership.profile_id = profile.id and membership.ended_at is null)
    order by profile.id limit 1;
    if other_id is null then raise exception 'No unrelated DEV identity available'; end if;
    identities := identities || jsonb_build_array(jsonb_build_object('team_type', test_case.team_type, 'role', test_case.app_role, 'team_id', team_id, 'member_id', member_id, 'other_id', other_id, 'saved_value', saved_value));
  end loop;
  perform set_config('team_availability.identities', identities::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  test_case jsonb;
  team_id uuid;
  member_id uuid;
  other_id uuid;
  saved_value boolean;
  observed_value boolean;
begin
  for test_case in select value from jsonb_array_elements(current_setting('team_availability.identities')::jsonb) loop
    team_id := (test_case->>'team_id')::uuid;
    member_id := (test_case->>'member_id')::uuid;
    other_id := (test_case->>'other_id')::uuid;
    saved_value := (test_case->>'saved_value')::boolean;
    perform set_config('request.jwt.claim.sub', member_id::text, true);
    select availability.accepting_new_couples into observed_value
    from public.get_my_counseling_team_availability(test_case->>'team_type') availability;
    if observed_value is distinct from saved_value then raise exception 'Saved team availability could not be read for %', test_case->>'role'; end if;

    perform public.set_my_counseling_team_availability(team_id, false);
    select accepting_new_couples into observed_value from public.groups where id = team_id;
    if observed_value is distinct from false then raise exception 'Authorized % update did not persist', test_case->>'role'; end if;
    perform public.set_my_counseling_team_availability(team_id, true);
    select accepting_new_couples into observed_value from public.groups where id = team_id;
    if observed_value is distinct from true then raise exception 'Authorized % ON update did not persist', test_case->>'role'; end if;
    perform public.set_my_counseling_team_availability(team_id, saved_value);


    perform set_config('request.jwt.claim.sub', other_id::text, true);
    begin
      perform public.set_my_counseling_team_availability(team_id, false);
      raise exception 'Unrelated identity unexpectedly changed % availability', test_case->>'role';
    exception when others then
      if sqlerrm <> 'Not authorized' then raise; end if;
    end;

    perform set_config('request.jwt.claim.sub', '', true);
    begin
      perform public.set_my_counseling_team_availability(team_id, false);
      raise exception 'Unauthenticated caller unexpectedly changed availability';
    exception when others then
      if sqlerrm <> 'Not authorized' then raise; end if;
    end;
  end loop;
end;
$$;

rollback;
