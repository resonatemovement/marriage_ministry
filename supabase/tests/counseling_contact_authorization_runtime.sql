-- DEV-only role-scoped contact RPC verification. Synthetic records roll back.
begin;

do $setup$
declare
  ids uuid[] := array[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid()
  ];
  couple_a uuid;
  couple_b uuid;
  assigned_team uuid;
  unassigned_team uuid;
  case_a uuid;
  case_b uuid;
  i integer;
begin
  for i in 1..9 loop
    insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data)
    values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'contact-rpc-rollback-' || ids[i]::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);
    update public.profiles
    set status = 'active', first_name = 'Rollback', last_name = 'Contact ' || i
    where id = ids[i];
    insert into public.profile_roles(profile_id, role)
    values (ids[i], case when i <= 4 then 'couple'::public.app_role when i <= 8 then 'counselor'::public.app_role else 'admin'::public.app_role end);
  end loop;

  insert into public.groups(group_type, name) values ('couple', 'Contact RPC rollback Couple A') returning id into couple_a;
  insert into public.groups(group_type, name) values ('couple', 'Contact RPC rollback Couple B') returning id into couple_b;
  insert into public.group_members(group_id, profile_id) values (couple_a, ids[1]), (couple_a, ids[2]), (couple_b, ids[3]), (couple_b, ids[4]);

  insert into public.groups(group_type, name) values ('counselor_team', 'Contact RPC rollback assigned team') returning id into assigned_team;
  insert into public.groups(group_type, name) values ('counselor_team', 'Contact RPC rollback unassigned team') returning id into unassigned_team;
  insert into public.group_members(group_id, profile_id) values (assigned_team, ids[5]), (assigned_team, ids[6]), (unassigned_team, ids[7]), (unassigned_team, ids[8]);

  insert into public.counseling_cases(couple_group_id, created_by, status)
  values (couple_a, ids[9], 'active') returning id into case_a;
  insert into public.counseling_cases(couple_group_id, created_by, status)
  values (couple_b, ids[9], 'active') returning id into case_b;
  insert into public.case_assignments(counseling_case_id, assigned_group_id, assignment_type, assigned_by)
  values (case_a, assigned_team, 'counselor', ids[9]);

  perform set_config('contact_rpc_test.ctx', jsonb_build_object(
    'couple_a', couple_a, 'couple_b', couple_b,
    'assigned_team', assigned_team, 'case_a', case_a, 'case_b', case_b,
    'assigned_counselor', ids[5], 'unassigned_counselor', ids[7], 'couple_member', ids[1]
  )::text, true);
end;
$setup$;

set local role authenticated;

do $authorization$
declare
  ctx jsonb := current_setting('contact_rpc_test.ctx')::jsonb;
  visible_count integer;
begin
  -- Assigned Counselor can read the Couple attached to the assigned case only.
  perform set_config('request.jwt.claim.sub', ctx->>'assigned_counselor', true);
  select count(*) into visible_count from public.get_counseling_contact_group((ctx->>'case_a')::uuid, (ctx->>'couple_a')::uuid);
  assert visible_count = 2, 'Assigned Counselor could not read the assigned Couple contact';
  select count(*) into visible_count from public.get_counseling_contact_group((ctx->>'case_a')::uuid, (ctx->>'couple_b')::uuid);
  assert visible_count = 0, 'Assigned Counselor could read another Couple through the assigned case';
  select count(*) into visible_count from public.get_counseling_contact_group((ctx->>'case_b')::uuid, (ctx->>'couple_b')::uuid);
  assert visible_count = 0, 'Assigned Counselor could read an unassigned case';

  -- Membership in a different Counselor team does not grant case access.
  perform set_config('request.jwt.claim.sub', ctx->>'unassigned_counselor', true);
  select count(*) into visible_count from public.get_counseling_contact_group((ctx->>'case_a')::uuid, (ctx->>'couple_a')::uuid);
  assert visible_count = 0, 'Unassigned Counselor could read the Couple contact';

  -- A Couple may read the active Counselor-of-record, not other Couples.
  perform set_config('request.jwt.claim.sub', ctx->>'couple_member', true);
  select count(*) into visible_count from public.get_current_couple_case_counselor();
  assert visible_count = 1, 'Assigned Couple could not resolve its Counselor-of-record';
  select count(*) into visible_count from public.get_counseling_contact_group((ctx->>'case_a')::uuid, (ctx->>'assigned_team')::uuid);
  assert visible_count = 2, 'Assigned Couple could not read the Counselor contact';
  select count(*) into visible_count from public.get_counseling_contact_group((ctx->>'case_a')::uuid, (ctx->>'couple_b')::uuid);
  assert visible_count = 0, 'Couple could read another Couple through its own case';
  select count(*) into visible_count from public.get_counseling_contact_group((ctx->>'case_b')::uuid, (ctx->>'couple_b')::uuid);
  assert visible_count = 0, 'Couple could read an unrelated Couple case';
end;
$authorization$;

rollback;
