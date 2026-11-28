-- Rollback-only DEV verifier. It creates only synthetic rows inside this
-- transaction and always rolls the Session/Homework move fixtures back.
-- Run after the migration in the same transaction:
--   (printf 'begin;\n'; cat migration; cat this_file) | supabase db query --linked --project-ref <DEV_REF>
-- The final ROLLBACK leaves no Session content or Auth fixtures behind.
begin;

do $verify$
declare
  actor_id uuid;
  partner_a uuid := gen_random_uuid();
  partner_b uuid := gen_random_uuid();
  couple_group uuid;
  counseling_case uuid;
  homework_assignment uuid;
  assignment_revision uuid;
  progress_id uuid;
  source_session uuid;
  destination_session uuid;
  rollback_session uuid;
  source_homework uuid;
  destination_homework uuid;
  source_published_version uuid;
  source_draft_version uuid;
  destination_draft_version uuid;
  source_page_a uuid := gen_random_uuid();
  source_page_b uuid := gen_random_uuid();
  destination_page uuid := gen_random_uuid();
  rich_logical_id uuid;
  checkbox_logical_id uuid;
  long_logical_id uuid;
  side_left_logical_id uuid;
  side_right_logical_id uuid;
  destination_logical_id uuid;
  rich_snapshot_id uuid;
  checkbox_snapshot_id uuid;
  long_snapshot_id uuid;
  side_left_snapshot_id uuid;
  side_right_snapshot_id uuid;
  side_by_side_group_id uuid := gen_random_uuid();
  answer_id uuid;
  material_page_id uuid;
  material_video_id uuid;
  published_material_id uuid;
  fixture_resource_id uuid;
  fixture_resource_category text;
  question_choices_value jsonb := jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'label', 'Option A'),
    jsonb_build_object('id', gen_random_uuid(), 'label', 'Option B')
  );
  selected_page_block_count integer;
  call_result jsonb;
  before_value jsonb;
  after_value jsonb;
  expected_time timestamptz;
  message text;
  rich_content jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Preserve this","marks":[{"type":"bold"},{"type":"link","attrs":{"href":"https://example.invalid"}}]}]}]}'::jsonb;
begin
  assert has_function_privilege('authenticated',
    'public.move_session_builder_content_between_sessions(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,timestamptz,uuid)', 'EXECUTE'),
    'Authenticated role cannot invoke the move RPC';
  assert not has_function_privilege('anon',
    'public.move_session_builder_content_between_sessions(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,timestamptz,uuid)', 'EXECUTE'),
    'Anonymous role can invoke the move RPC';

  select role_row.profile_id into actor_id
  from public.profile_roles role_row join public.profiles profile on profile.id = role_row.profile_id
  where role_row.role in ('admin','super_admin') and profile.status = 'active'
  order by case when role_row.role = 'super_admin' then 0 else 1 end, role_row.profile_id limit 1;
  if actor_id is null then raise exception 'No active Admin profile available for rollback-only move verification'; end if;

  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data)
  values
    (partner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'move-verifier-' || partner_a || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb),
    (partner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'move-verifier-' || partner_b || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);
  update public.profiles set status = 'active', first_name = 'Synthetic', last_name = 'Move Verifier' where id in (partner_a, partner_b);
  insert into public.profile_roles(profile_id, role) values (partner_a, 'couple'), (partner_b, 'couple');
  insert into public.groups(group_type, name) values ('couple', 'Rollback-only Move Verifier') returning id into couple_group;
  insert into public.group_members(group_id, profile_id) values (couple_group, partner_a), (couple_group, partner_b);
  insert into public.counseling_cases(couple_group_id, created_by, status)
    values (couple_group, actor_id, 'active') returning id into counseling_case;

  insert into public.sessions(title, created_by, status)
    values ('Rollback-only Move Source', actor_id, 'draft') returning id into source_session;
  insert into public.sessions(title, created_by, status)
    values ('Rollback-only Move Destination', actor_id, 'draft') returning id into destination_session;
  insert into public.sessions(title, created_by, status)
    values ('Rollback-only Move Rollback Destination', actor_id, 'draft') returning id into rollback_session;

  insert into public.homeworks(session_id) values (source_session) returning id into source_homework;
  insert into public.homeworks(session_id) values (destination_session) returning id into destination_homework;
  insert into public.homework_versions(homework_id, status, created_by, page_manifest)
    values (source_homework, 'draft', actor_id, jsonb_build_array(
      jsonb_build_object('id',source_page_a,'title','Source Page A','position',0),
      jsonb_build_object('id',source_page_b,'title','Source Page B','position',1))) returning id into source_published_version;
  insert into public.homework_blocks(homework_id) values (source_homework) returning id into rich_logical_id;
  insert into public.homework_blocks(homework_id) values (source_homework) returning id into checkbox_logical_id;
  insert into public.homework_blocks(homework_id) values (source_homework) returning id into long_logical_id;
  insert into public.homework_blocks(homework_id) values (source_homework) returning id into side_left_logical_id;
  insert into public.homework_blocks(homework_id) values (source_homework) returning id into side_right_logical_id;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, rich_text_content, page_id)
    values (source_published_version, rich_logical_id, 'rich_text', 0, null, rich_content, source_page_a) returning id into rich_snapshot_id;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title,
    rich_text_content, question_choices, is_required, page_id)
    values (source_published_version, checkbox_logical_id, 'checkbox_question', 1, null,
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Optional choice question"}]}]}'::jsonb,
      question_choices_value, false, source_page_a) returning id into checkbox_snapshot_id;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, rich_text_content, page_id)
    values (source_published_version, long_logical_id, 'long_answer', 2, 'Reflection',
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Answer this"}]}]}'::jsonb, source_page_b)
    returning id into long_snapshot_id;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, description, rich_text_content, is_required, page_id)
    values
      (source_published_version, side_left_logical_id, 'long_answer', 3, 'Partner A',
        jsonb_build_object('kind','side_by_side_response','groupId',side_by_side_group_id,'side','left',
          'instructions','Discuss together','leftHeading','Partner A','rightHeading','Partner B','bothRequired',true,'responseMode','paired_rows_v1')::text,
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Left side"}]}]}'::jsonb, true, source_page_b),
      (source_published_version, side_right_logical_id, 'long_answer', 4, 'Partner B',
        jsonb_build_object('kind','side_by_side_response','groupId',side_by_side_group_id,'side','right',
          'instructions','Discuss together','leftHeading','Partner A','rightHeading','Partner B','bothRequired',true,'responseMode','paired_rows_v1')::text,
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Right side"}]}]}'::jsonb, true, source_page_b);
  select id into side_left_snapshot_id from public.homework_version_blocks
    where homework_version_id = source_published_version and homework_block_id = side_left_logical_id;
  select id into side_right_snapshot_id from public.homework_version_blocks
    where homework_version_id = source_published_version and homework_block_id = side_right_logical_id;
  update public.homework_versions set status = 'published', version_number = 1, published_at = now()
    where id = source_published_version;
  insert into public.homework_versions(homework_id, status, created_by, page_manifest)
    values (destination_homework, 'draft', actor_id, jsonb_build_array(
      jsonb_build_object('id',destination_page,'title','Destination Page','position',0))) returning id into destination_draft_version;
  insert into public.homework_blocks(homework_id) values (destination_homework) returning id into destination_logical_id;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, rich_text_content, page_id)
    values (destination_draft_version, destination_logical_id, 'rich_text', 0, 'Existing destination content',
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Keep me"}]}]}'::jsonb, destination_page);

  insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
    values (source_homework, counseling_case, actor_id) returning id into homework_assignment;
  insert into public.homework_assignment_revisions(homework_assignment_id, homework_version_id)
    values (homework_assignment, source_published_version) returning id into assignment_revision;
  insert into public.homework_participant_progress(assignment_revision_id, profile_id, status)
    values (assignment_revision, partner_a, 'in_progress') returning id into progress_id;
  insert into public.homework_answers(participant_progress_id, homework_version_block_id, answer_text)
    values (progress_id, long_snapshot_id, 'Historical answer must remain untouched') returning id into answer_id;

  insert into public.session_material_blocks(session_id, block_type, position, title, rich_text_content)
    values (source_session, 'rich_text', 0, 'Material Page', rich_content) returning id into material_page_id;
  insert into public.session_material_blocks(session_id, block_type, position, title, url)
    values (source_session, 'video_link', 1, 'Session Video', 'https://example.invalid/video') returning id into material_video_id;

  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor_id, 'role', 'authenticated')::text, true);

  -- Move one Homework block out of the published-source-derived Draft first.
  select public.move_session_builder_content_between_sessions(
    source_session, destination_session, 'homework_block', long_snapshot_id, source_published_version,
    (select updated_at from public.sessions where id = source_session),
    (select updated_at from public.homework_versions where id = source_published_version),
    destination_draft_version,
    (select updated_at from public.sessions where id = destination_session),
    (select updated_at from public.homework_versions where id = destination_draft_version),
    destination_page) into call_result;
  source_draft_version := (call_result ->> 'source_homework_version_id')::uuid;
  assert (call_result ->> 'moved_count')::integer = 1, 'Individual Homework item was not moved exactly once';
  select id into side_left_snapshot_id from public.homework_version_blocks
    where homework_version_id = source_draft_version and homework_block_id = side_left_logical_id;
  select id into side_right_snapshot_id from public.homework_version_blocks
    where homework_version_id = source_draft_version and homework_block_id = side_right_logical_id;
  assert side_left_snapshot_id is not null and side_right_snapshot_id is not null,
    'Published Side-by-Side content was not cloned into the source Draft';
  assert (select count(*) = 1 from public.homework_version_blocks where homework_version_id = source_draft_version and homework_block_id = long_logical_id) = false,
    'Moved Homework item remains in the source Draft';
  assert exists (select 1 from public.homework_version_blocks where homework_version_id = destination_draft_version
    and page_id = destination_page and position = 1 and block_type = 'long_answer' and title = 'Reflection'),
    'Moved Homework item was not appended to the selected destination page';

  select public.move_session_builder_content_between_sessions(
    source_session, destination_session, 'homework_block', side_left_snapshot_id, source_draft_version,
    (select updated_at from public.sessions where id = source_session),
    (select updated_at from public.homework_versions where id = source_draft_version),
    destination_draft_version,
    (select updated_at from public.sessions where id = destination_session),
    (select updated_at from public.homework_versions where id = destination_draft_version),
    destination_page) into call_result;
  source_draft_version := (call_result ->> 'source_homework_version_id')::uuid;
  assert (call_result ->> 'moved_count')::integer = 2, 'Moving one Side-by-Side item did not move both paired rows';
  assert (select count(*) from public.homework_version_blocks b
    where b.homework_version_id = destination_draft_version
      and private.homework_side_by_side_metadata(b.description) ->> 'groupId' = side_by_side_group_id::text) = 2,
    'Side-by-Side settings were not preserved as one grouped destination item';
  assert (select count(*) from public.homework_version_blocks b
    where b.homework_version_id = source_draft_version
      and private.homework_side_by_side_metadata(b.description) ->> 'groupId' = side_by_side_group_id::text) = 0,
    'Moved Side-by-Side pair remains in the source Draft';

  -- Move the complete remaining Homework page, preserving formatting, question
  -- settings, and source page ordering while leaving its other page intact.
  select public.move_session_builder_content_between_sessions(
    source_session, destination_session, 'homework_page', source_page_a, source_draft_version,
    (select updated_at from public.sessions where id = source_session),
    (select updated_at from public.homework_versions where id = source_draft_version),
    destination_draft_version,
    (select updated_at from public.sessions where id = destination_session),
    (select updated_at from public.homework_versions where id = destination_draft_version),
    null) into call_result;
  assert (call_result ->> 'moved_count')::integer = 2, 'Whole Homework Page did not move both supported blocks';
  source_draft_version := (call_result ->> 'source_homework_version_id')::uuid;
  assert jsonb_array_length((select page_manifest from public.homework_versions where id = source_draft_version)) = 1,
    'Source Homework page removal did not preserve the remaining page';
  assert (select count(*) from public.homework_version_blocks where homework_version_id = destination_draft_version
    and page_id = (call_result ->> 'destination_page_id')::uuid) = 2, 'The moved Homework page content is incomplete';
  assert exists (select 1 from public.homework_version_blocks where homework_version_id = destination_draft_version
    and page_id = (call_result ->> 'destination_page_id')::uuid and block_type = 'rich_text'
    and title is null and rich_text_content = rich_content), 'Rich Text title/formatting was not preserved';
  assert exists (select 1 from public.homework_version_blocks where homework_version_id = destination_draft_version
    and page_id = (call_result ->> 'destination_page_id')::uuid and block_type = 'checkbox_question'
    and question_choices = question_choices_value and is_required = false), 'Question configuration was not preserved';

  -- A repeated request with the original snapshot ID must fail before a second
  -- destination insert. Published snapshot and stored answer remain unchanged.
  select count(*) into selected_page_block_count from public.homework_version_blocks where homework_version_id = destination_draft_version;
  begin
    perform public.move_session_builder_content_between_sessions(
      source_session, destination_session, 'homework_block', long_snapshot_id, source_draft_version,
      (select updated_at from public.sessions where id = source_session),
      (select updated_at from public.homework_versions where id = source_draft_version),
      destination_draft_version,
      (select updated_at from public.sessions where id = destination_session),
      (select updated_at from public.homework_versions where id = destination_draft_version),
      destination_page);
    raise exception 'Duplicate Homework move unexpectedly succeeded';
  exception when others then
    get stacked diagnostics message = message_text;
    if message = 'Duplicate Homework move unexpectedly succeeded' then raise; end if;
  end;
  assert (select count(*) from public.homework_version_blocks where homework_version_id = destination_draft_version) = selected_page_block_count,
    'Rejected duplicate request changed destination content';
  assert (select rich_text_content from public.homework_version_blocks where id = rich_snapshot_id) = rich_content,
    'Published source snapshot changed';
  assert (select answer_text from public.homework_answers where id = answer_id) = 'Historical answer must remain untouched',
    'Historical Couple answer changed';

  -- A failed move after destination Homework creation must roll that creation
  -- back with the function statement; no partial root or Draft may remain.
  begin
    perform public.move_session_builder_content_between_sessions(
      source_session, rollback_session, 'homework_page', gen_random_uuid(), source_draft_version,
      (select updated_at from public.sessions where id = source_session),
      (select updated_at from public.homework_versions where id = source_draft_version),
      null,
      (select updated_at from public.sessions where id = rollback_session), null, null);
    raise exception 'Invalid page move unexpectedly succeeded';
  exception when others then
    get stacked diagnostics message = message_text;
    if message = 'Invalid page move unexpectedly succeeded' then raise; end if;
    assert message = 'The selected Homework page is no longer available to move', 'Invalid page failed for an unexpected reason';
  end;
  assert not exists (select 1 from public.homeworks where session_id = rollback_session),
    'Failed Homework move left behind a destination Homework root';

  -- Session Material PAGE and individual Video/Link use the same atomic move
  -- path and append after destination content. Resource block coverage uses an
  -- existing read-only Resource reference, if DEV has one available.
  insert into public.session_material_blocks(session_id, block_type, position, title, url)
    values (destination_session, 'video_link', 0, 'Published Session test block', 'https://example.invalid/published')
    returning id into published_material_id;
  update public.sessions set status = 'published' where id = destination_session;
  begin
    perform public.move_session_builder_content_between_sessions(
      source_session, destination_session, 'session_material_resource', material_video_id, null,
      (select updated_at from public.sessions where id = source_session), null, null,
      (select updated_at from public.sessions where id = destination_session), null, null);
    raise exception 'Published Session Material move unexpectedly succeeded';
  exception when others then
    get stacked diagnostics message = message_text;
    if message = 'Published Session Material move unexpectedly succeeded' then raise; end if;
    assert message = 'Session Material moves require Draft Sessions', 'Published Session Material move failed for an unexpected reason';
  end;
  assert exists (select 1 from public.session_material_blocks where id = material_video_id and session_id = source_session)
    and exists (select 1 from public.session_material_blocks where id = published_material_id and session_id = destination_session),
    'Rejected published Session Material move changed either Session';
  update public.sessions set status = 'draft' where id = destination_session;

  select public.move_session_builder_content_between_sessions(
    source_session, destination_session, 'session_material_page', material_page_id, null,
    (select updated_at from public.sessions where id = source_session), null, null,
    (select updated_at from public.sessions where id = destination_session), null, null) into call_result;
  assert exists (select 1 from public.session_material_blocks where id = material_page_id and session_id = destination_session),
    'Session Material PAGE was not moved';
  select public.move_session_builder_content_between_sessions(
    source_session, destination_session, 'session_material_resource', material_video_id, null,
    (select updated_at from public.sessions where id = source_session), null, null,
    (select updated_at from public.sessions where id = destination_session), null, null) into call_result;
  assert exists (select 1 from public.session_material_blocks where id = material_video_id and session_id = destination_session),
    'Session Material Video/Link was not moved';

  select r.id, r.category::text into fixture_resource_id, fixture_resource_category from public.resources r
  where r.current_version_id is not null and r.archived_at is null order by r.id limit 1;
  if fixture_resource_id is not null then
    insert into public.session_material_blocks(session_id, block_type, position, resource_id, resource_category)
      values (source_session, 'library_resource', 0, fixture_resource_id, fixture_resource_category) returning id into material_video_id;
    select public.move_session_builder_content_between_sessions(
      source_session, destination_session, 'session_material_resource', material_video_id, null,
      (select updated_at from public.sessions where id = source_session), null, null,
      (select updated_at from public.sessions where id = destination_session), null, null) into call_result;
    assert exists (select 1 from public.session_material_blocks b where b.id = material_video_id and b.session_id = destination_session
      and b.resource_id = fixture_resource_id and b.resource_category = fixture_resource_category), 'Session Material Resource move lost its resource reference';
  else
    raise notice 'Skipped Resource-block runtime row: DEV contains no active library Resource';
  end if;

  -- A mismatched revision is rejected before mutation.
  select updated_at into expected_time from public.sessions where id = source_session;
  begin
    perform public.move_session_builder_content_between_sessions(
      source_session, destination_session, 'session_material_resource', gen_random_uuid(), null,
      expected_time - interval '1 second', null, null,
      (select updated_at from public.sessions where id = destination_session), null, null);
    raise exception 'Stale Session request unexpectedly succeeded';
  exception when others then
    get stacked diagnostics message = message_text;
    if message = 'Stale Session request unexpectedly succeeded' then raise; end if;
    assert message = 'Session content changed. Reload both Sessions and try again.', 'Unexpected stale request result';
  end;

  -- An authenticated Couple role is denied by the RPC regardless of IDs.
  perform set_config('request.jwt.claim.sub', partner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', partner_a, 'role', 'authenticated')::text, true);
  begin
    perform public.move_session_builder_content_between_sessions(
      source_session, destination_session, 'homework_page', source_page_b, source_draft_version,
      expected_time, null, destination_draft_version, expected_time, null, null);
    raise exception 'Unauthorized move unexpectedly succeeded';
  exception when others then
    get stacked diagnostics message = message_text;
    if message = 'Unauthorized move unexpectedly succeeded' then raise; end if;
    assert message = 'Not authorized', 'Unauthorized move returned an unexpected result';
  end;

  raise notice 'Session Builder content move rollback verifier passed; fixture Sessions, Homework, answers, and Auth users remain transaction-local.';
end;
$verify$;

rollback;
