-- DEV-only coordinator scenarios. All users and domain records are rolled back.
begin;

do $setup$
declare
  admin_id uuid := gen_random_uuid();
  partner_a uuid := gen_random_uuid();
  partner_b uuid := gen_random_uuid();
  couple_id uuid;
  case_id uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data)
  values
    (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'homework-coordinator-admin-' || admin_id::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb),
    (partner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'homework-coordinator-a-' || partner_a::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb),
    (partner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'homework-coordinator-b-' || partner_b::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);
  update public.profiles set status = 'active', first_name = 'Homework', last_name = 'Coordinator Admin' where id = admin_id;
  update public.profiles set status = 'active', first_name = 'Homework', last_name = 'Coordinator A' where id = partner_a;
  update public.profiles set status = 'active', first_name = 'Homework', last_name = 'Coordinator B' where id = partner_b;
  insert into public.profile_roles(profile_id, role)
  values (admin_id, 'super_admin'), (partner_a, 'couple'), (partner_b, 'couple');
  insert into public.groups(group_type, name) values ('couple', 'Homework coordinator rollback Couple') returning id into couple_id;
  insert into public.group_members(group_id, profile_id) values (couple_id, partner_a), (couple_id, partner_b);
  insert into public.counseling_cases(couple_group_id, created_by) values (couple_id, admin_id) returning id into case_id;
  perform set_config('homework.coordinator_ctx', jsonb_build_object(
    'admin', admin_id, 'case', case_id, 'partner_a', partner_a, 'partner_b', partner_b)::text, true);
end;
$setup$;

set local role authenticated;

do $verify$
declare
  ctx jsonb := current_setting('homework.coordinator_ctx')::jsonb;
  admin_id uuid := (ctx ->> 'admin')::uuid;
  case_id uuid := (ctx ->> 'case')::uuid;
  saved jsonb;
  result jsonb;
  sid uuid;
  hid uuid;
  version_id uuid;
  pending_id uuid;
  published_version uuid;
  empty_session_id uuid;
  empty_version_id uuid;
  revision_id uuid;
  version_count integer;
  old_title text;
  rich jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Coordinator reading"}]}]}'::jsonb;
  answer jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Explain the pattern"}]}]}'::jsonb;
  materials jsonb := '[{"client_id":"material:one","block_type":"rich_text","title":"Session material","rich_text_content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Welcome"}]}]},"url":null,"description":null}]'::jsonb;
  homework jsonb := '[{"client_id":"local:reading","block_type":"rich_text","title":"Reading","rich_text_content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Coordinator reading"}]}]},"url":null,"description":null},{"client_id":"local:question","block_type":"long_answer","title":"Question","rich_text_content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Explain the pattern"}]}]},"url":null,"description":null}]'::jsonb;
begin
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  assert auth.uid() = admin_id;

  -- A. One save creates the Session, Homework root, Draft, and logical identities.
  saved := public.save_session_homework_authoring_state(null, 'Coordinator Draft', '[]'::jsonb,
    true, null, homework, true, false, 'save');
  sid := (saved -> 'session' ->> 'session_id')::uuid;
  version_id := (saved -> 'homework' ->> 'version_id')::uuid;
  select id into hid from public.homeworks where session_id = sid;
  assert (select status = 'draft' from public.sessions where id = sid), 'A: Session remains Draft after Save';
  assert (select status = 'draft' from public.homework_versions where id = version_id), 'A: Homework remains Draft after Save';
  assert jsonb_array_length(saved -> 'homework' -> 'blocks') = 2, 'A: staged blocks receive persisted identities';
  assert (select count(*) = 2 from public.homework_blocks where homework_id = hid), 'A: logical Homework identities are created';
  select coalesce(jsonb_agg(blocks.value - 'position' order by blocks.value ->> 'position'), '[]'::jsonb)
  into homework from jsonb_array_elements(saved -> 'homework' -> 'blocks') as blocks(value);

  -- B. Direct Publish publishes both domains atomically.
  result := public.save_session_homework_authoring_state(sid, 'Coordinator Published', materials,
    true, version_id, homework, true, true, 'publish');
  published_version := (result -> 'homework' ->> 'version_id')::uuid;
  select coalesce(jsonb_agg(blocks.value - 'position' order by blocks.value ->> 'position'), '[]'::jsonb)
  into homework from jsonb_array_elements(result -> 'homework' -> 'blocks') as blocks(value);
  assert (select status = 'published' from public.sessions where id = sid), 'B: Session publishes directly';
  assert (select status = 'published' and version_number = 1 from public.homework_versions where id = published_version), 'B: authored Homework publishes as version 1';

  -- C. An unassigned Published version stays editable in place.
  homework := jsonb_set(homework, '{0,title}', '"Edited reading"');
  result := public.save_session_homework_authoring_state(sid, 'Coordinator Published', materials,
    false, published_version, homework, true, false, 'save');
  select coalesce(jsonb_agg(blocks.value - 'position' order by blocks.value ->> 'position'), '[]'::jsonb)
  into homework from jsonb_array_elements(result -> 'homework' -> 'blocks') as blocks(value);
  assert (result -> 'homework' ->> 'version_id')::uuid = published_version, 'C: unassigned published content keeps its version ID';
  assert (select count(*) = 1 from public.homework_versions where homework_id = hid), 'C: no unnecessary version is created';

  -- D. First assignment locks version 1; subsequent saves reuse one editable Draft.
  perform public.assign_homework(hid, case_id, published_version);
  select id into revision_id from public.homework_assignment_revisions
  where homework_version_id = published_version and ended_at is null;
  homework := jsonb_set(homework, '{0,title}', '"Assigned version edit"');
  result := public.save_session_homework_authoring_state(sid, 'Coordinator Published', materials,
    false, published_version, homework, true, false, 'save');
  pending_id := (result -> 'homework' ->> 'version_id')::uuid;
  select coalesce(jsonb_agg(blocks.value - 'position' order by blocks.value ->> 'position'), '[]'::jsonb)
  into homework from jsonb_array_elements(result -> 'homework' -> 'blocks') as blocks(value);
  assert pending_id <> published_version, 'D: assigned version edits use a Draft';
  assert (select count(*) = 2 from public.homework_versions where homework_id = hid), 'D: first edit creates one pending Draft';
  assert (select homework_version_id = published_version from public.homework_assignment_revisions where id = revision_id), 'D: existing assignment remains on its original version';
  homework := jsonb_set(homework, '{0,title}', '"Second pending edit"');
  result := public.save_session_homework_authoring_state(sid, 'Coordinator Published', materials,
    false, pending_id, homework, true, false, 'save');
  select coalesce(jsonb_agg(blocks.value - 'position' order by blocks.value ->> 'position'), '[]'::jsonb)
  into homework from jsonb_array_elements(result -> 'homework' -> 'blocks') as blocks(value);
  assert (result -> 'homework' ->> 'version_id')::uuid = pending_id, 'D: subsequent save reuses the pending Draft';
  assert (select count(*) = 2 from public.homework_versions where homework_id = hid), 'D: repeated saves do not create extra versions';

  -- E. Publish Changes advances Homework while preserving the existing assignment revision.
  result := public.save_session_homework_authoring_state(sid, 'Coordinator Published', materials,
    false, pending_id, homework, false, true, 'publish_changes');
  assert (result -> 'homework' ->> 'version_id')::uuid = pending_id, 'E: the pending version is published';
  assert (select status = 'published' and version_number = 2 from public.homework_versions where id = pending_id), 'E: next Homework version is published';
  assert (select homework_version_id = published_version from public.homework_assignment_revisions where id = revision_id), 'E: existing assignment history remains unchanged';

  -- F. A bad Homework URL rolls back already-staged Session changes in the same RPC.
  select title into old_title from public.sessions where id = sid;
  begin
    perform public.save_session_homework_authoring_state(sid, 'Must Roll Back', materials,
      true, pending_id,
      '[{"client_id":"local:bad-url","block_type":"video_link","title":"Broken","rich_text_content":null,"url":"https://:","description":null}]'::jsonb,
      true, false, 'save');
    raise exception 'F: expected invalid Homework content to reject the transaction';
  exception when others then
    if sqlerrm = 'F: expected invalid Homework content to reject the transaction' then raise; end if;
  end;
  assert (select title = old_title from public.sessions where id = sid), 'F: Session changes roll back when Homework validation fails';
  assert (select count(*) = 2 from public.homework_version_blocks where homework_version_id = pending_id), 'F: Homework block state rolls back';

  -- G. Homework is optional when publishing a Session.
  result := public.save_session_homework_authoring_state(null, 'No Homework Session', materials,
    true, null, '[]'::jsonb, false, true, 'publish');
  assert (select status = 'published' from public.sessions where id = (result -> 'session' ->> 'session_id')::uuid), 'G: an empty Homework Draft is not required to publish a Session';
  assert not exists (select 1 from public.homeworks where session_id = (result -> 'session' ->> 'session_id')::uuid), 'G: no empty Homework root is manufactured';

  -- H. An already-created empty Homework Draft stays unpublished when its Session is published.
  result := public.save_session_homework_authoring_state(null, 'Empty Homework Session', '[]'::jsonb,
    true, null, '[]'::jsonb, true, false, 'save');
  empty_session_id := (result -> 'session' ->> 'session_id')::uuid;
  empty_version_id := (result -> 'homework' ->> 'version_id')::uuid;
  result := public.save_session_homework_authoring_state(empty_session_id, 'Empty Homework Session', materials,
    true, empty_version_id, '[]'::jsonb, false, true, 'publish');
  assert (select status = 'published' from public.sessions where id = empty_session_id), 'H: a Session publishes with its existing empty Homework Draft';
  assert (select status = 'draft' from public.homework_versions where id = empty_version_id), 'H: the empty Homework Draft is not published';
  assert not exists (select 1 from public.homework_versions where homework_id = (select homework_id from public.homework_versions where id = empty_version_id) and status = 'published'), 'H: no empty Published Homework version is created';

  select count(*) into version_count from public.homework_versions where homework_id = hid;
  assert version_count = 2, 'I: coordinator state remains consistent through the full lifecycle';
end;
$verify$;

rollback;
