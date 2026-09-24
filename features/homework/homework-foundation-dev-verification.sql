-- DEV-only integration verifier. The entire fixture is rolled back.
begin;

do $setup$
declare
  ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  i integer;
  couple_group_id uuid;
  case_id uuid;
begin
  for i in 1..4 loop
    insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data)
    values
      (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'homework-e2e-' || ids[i]::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);
    update public.profiles
    set status = 'active', first_name = 'Homework', last_name = 'Rollback Verifier ' || i
    where id = ids[i];
    insert into public.profile_roles(profile_id, role)
    values (ids[i], case when i = 1 then 'super_admin'::public.app_role
                         when i = 4 then 'author'::public.app_role
                         else 'couple'::public.app_role end);
  end loop;

  insert into public.groups(group_type, name)
  values ('couple', 'Homework E2E rollback verifier Couple') returning id into couple_group_id;
  insert into public.group_members(group_id, profile_id)
  values (couple_group_id, ids[2]), (couple_group_id, ids[3]);
  insert into public.counseling_cases(couple_group_id, created_by)
  values (couple_group_id, ids[1]) returning id into case_id;

  assert (select count(*) from public.group_members
          where group_id = couple_group_id and ended_at is null) = 2,
    'Verifier Couple must have two active members';
  perform set_config('homework.verifier_ctx', jsonb_build_object(
    'admin', ids[1], 'partner_a', ids[2], 'partner_b', ids[3], 'author', ids[4],
    'couple_group', couple_group_id, 'case', case_id)::text, true);
end;
$setup$;

set local role authenticated;

do $authoring$
declare
  ctx jsonb := current_setting('homework.verifier_ctx')::jsonb;
  actor uuid := (ctx ->> 'admin')::uuid;
  sid uuid;
  hid uuid;
  draft uuid;
  again uuid;
  rich_block uuid;
  video_block uuid;
  answer_a_block uuid;
  answer_b_block uuid;
  rich_snapshot uuid;
  video_snapshot uuid;
  answer_a_snapshot uuid;
  answer_b_snapshot uuid;
  assignment_id uuid;
  v1_revision uuid;
  progress_a uuid;
  progress_b uuid;
  prompt_a jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Question A original"}]}]}'::jsonb;
  prompt_b jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Question B original"}]}]}'::jsonb;
  rich_content jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Homework verifier introduction"}]}]}'::jsonb;
  error_text text;
begin
  perform set_config('request.jwt.claim.sub', actor::text, true);
  assert auth.uid() = actor and private.current_user_has_role(array['super_admin']::public.app_role[]),
    'Authenticated admin impersonation failed';

  insert into public.sessions(title, created_by)
  values ('Homework E2E rollback verifier Session', actor) returning id into sid;
  draft := public.get_or_create_homework_draft_for_session(sid);
  again := public.get_or_create_homework_draft_for_session(sid);
  assert draft = again, 'Session Draft RPC did not reuse Draft';
  select id into hid from public.homeworks where session_id = sid;
  assert (select count(*) from public.homeworks where session_id = sid) = 1,
    'Session has multiple Homework roots';
  assert (select count(*) from public.homework_versions
          where homework_id = hid and status = 'draft') = 1,
    'Session has multiple Drafts';

  begin
    perform public.publish_homework_version(draft);
    raise exception 'Verifier expected empty Draft publication rejection';
  exception when others then
    get stacked diagnostics error_text = message_text;
    if error_text <> 'Homework must contain at least one block' then raise; end if;
  end;

  insert into public.homework_blocks(homework_id) values (hid) returning id into rich_block;
  insert into public.homework_blocks(homework_id) values (hid) returning id into video_block;
  insert into public.homework_blocks(homework_id) values (hid) returning id into answer_a_block;
  insert into public.homework_blocks(homework_id) values (hid) returning id into answer_b_block;

  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content)
  values (draft, rich_block, 'rich_text', 0, rich_content) returning id into rich_snapshot;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, url)
  values (draft, video_block, 'video_link', 1, 'https://example.com/homework-video')
  returning id into video_snapshot;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content)
  values (draft, answer_a_block, 'long_answer', 2, prompt_a)
  returning id into answer_a_snapshot;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content)
  values (draft, answer_b_block, 'long_answer', 3, prompt_b)
  returning id into answer_b_snapshot;

  for error_text in select 'empty_rich' union all select 'whitespace_rich'
                    union all select 'empty_answer' union all select 'whitespace_answer'
                    union all select 'invalid_url'
  loop
    begin
      if error_text = 'empty_rich' then
        update public.homework_version_blocks set rich_text_content = '{"type":"doc","content":[]}'::jsonb
        where id = rich_snapshot;
      elsif error_text = 'whitespace_rich' then
        update public.homework_version_blocks set rich_text_content =
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"   "}]}]}'::jsonb
        where id = rich_snapshot;
      elsif error_text = 'empty_answer' then
        update public.homework_version_blocks set rich_text_content = '{"type":"doc","content":[]}'::jsonb
        where id = answer_a_snapshot;
      elsif error_text = 'whitespace_answer' then
        update public.homework_version_blocks set rich_text_content =
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"   "}]}]}'::jsonb
        where id = answer_b_snapshot;
      else
        update public.homework_version_blocks set url = 'https://:' where id = video_snapshot;
      end if;
      raise exception 'Verifier expected content rejection: %', error_text;
    exception when others then
      if sqlerrm not in ('Rich text content must be meaningful',
                        'Video link must be a valid http or https URL with a host') then
        raise;
      end if;
    end;
  end loop;

  assert (select count(*) from public.homework_version_blocks
          where homework_version_id = draft) = 4, 'V1 must contain four snapshots';
  assert (select count(*) from public.homework_version_blocks vb
          join public.homework_blocks b on b.id = vb.homework_block_id
          join public.homework_versions v on v.id = vb.homework_version_id
          where vb.homework_version_id = draft and b.homework_id = hid and v.homework_id = hid) = 4,
    'V1 snapshots have inconsistent Homework parents';

  perform public.publish_homework_version(draft);
  assert (select status = 'published' and version_number = 1 and published_at is not null
          from public.homework_versions where id = draft), 'V1 publication failed';
  assert (select count(*) from public.homework_audit_events
          where homework_id = hid and event_type = 'homework_published'
            and to_version_id = draft and actor_profile_id = actor) = 1,
    'V1 publish audit failed';

  update public.homework_version_blocks
  set rich_text_content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Temporarily edited while unassigned"}]}]}'::jsonb
  where id = rich_snapshot;
  assert found, 'Unassigned published content could not be edited';
  update public.homework_version_blocks set rich_text_content = rich_content where id = rich_snapshot;

  assignment_id := public.assign_homework(hid, (ctx ->> 'case')::uuid, draft);
  assert public.assign_homework(hid, (ctx ->> 'case')::uuid, draft) = assignment_id,
    'Active assignment was not reused';
  assert (select count(*) from public.homework_assignments
          where homework_id = hid and counseling_case_id = (ctx ->> 'case')::uuid
            and unassigned_at is null) = 1, 'Active assignment uniqueness failed';
  select id into v1_revision from public.homework_assignment_revisions
  where homework_assignment_id = assignment_id and ended_at is null;
  assert (select homework_version_id = draft from public.homework_assignment_revisions
          where id = v1_revision), 'V1 revision points to wrong version';
  assert (select count(*) from public.homework_participant_progress
          where assignment_revision_id = v1_revision) = 2,
    'Assignment did not create exactly two progress rows';
  select id into progress_a from public.homework_participant_progress
  where assignment_revision_id = v1_revision and profile_id = (ctx ->> 'partner_a')::uuid;
  select id into progress_b from public.homework_participant_progress
  where assignment_revision_id = v1_revision and profile_id = (ctx ->> 'partner_b')::uuid;
  assert progress_a is not null and progress_b is not null and progress_a <> progress_b,
    'Progress is not bound to two independent Couple members';
  assert (select count(*) from public.homework_audit_events
          where homework_assignment_id = assignment_id
            and event_type = 'homework_assignment_created') = 1,
    'Assignment reuse emitted a duplicate creation event';

  ctx := ctx || jsonb_build_object(
    'session', sid, 'homework', hid, 'v1', draft, 'rich_block', rich_block,
    'video_block', video_block, 'answer_a_block', answer_a_block,
    'answer_b_block', answer_b_block, 'rich_snapshot', rich_snapshot,
    'video_snapshot', video_snapshot, 'answer_a_snapshot', answer_a_snapshot,
    'answer_b_snapshot', answer_b_snapshot, 'assignment', assignment_id,
    'v1_revision', v1_revision, 'progress_a', progress_a, 'progress_b', progress_b);
  perform set_config('homework.verifier_ctx', ctx::text, true);
end;
$authoring$;

reset role;

do $assigned_guards$
declare
  ctx jsonb := current_setting('homework.verifier_ctx')::jsonb;
  v1 uuid := (ctx ->> 'v1')::uuid;
  rich_snapshot uuid := (ctx ->> 'rich_snapshot')::uuid;
  hid uuid := (ctx ->> 'homework')::uuid;
  probe_block uuid;
begin
  begin
    update public.homework_version_blocks set title = 'Forbidden edit' where id = rich_snapshot;
    raise exception 'Verifier expected assigned content update rejection';
  exception when others then
    if sqlerrm <> 'Assigned published Homework versions are immutable' then raise; end if;
  end;
  begin
    delete from public.homework_version_blocks where id = rich_snapshot;
    raise exception 'Verifier expected assigned snapshot delete rejection';
  exception when others then
    if sqlerrm <> 'Assigned published Homework versions are immutable' then raise; end if;
  end;
  insert into public.homework_blocks(homework_id) values (hid) returning id into probe_block;
  begin
    insert into public.homework_version_blocks
      (homework_version_id, homework_block_id, block_type, position, rich_text_content)
    values (v1, probe_block, 'rich_text', 4,
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Probe"}]}]}'::jsonb);
    raise exception 'Verifier expected assigned snapshot insert rejection';
  exception when others then
    if sqlerrm <> 'Assigned published Homework versions are immutable' then raise; end if;
  end;
  begin
    update public.homework_version_blocks set position = 4 where id = rich_snapshot;
    raise exception 'Verifier expected assigned reorder rejection';
  exception when others then
    if sqlerrm <> 'Assigned published Homework versions are immutable' then raise; end if;
  end;
  assert (select count(*) from public.homework_version_blocks
          where homework_version_id = v1) = 4, 'Assigned V1 history changed';
end;
$assigned_guards$;

set local role authenticated;

do $participant$
declare
  ctx jsonb := current_setting('homework.verifier_ctx')::jsonb;
  admin uuid := (ctx ->> 'admin')::uuid;
  partner_a uuid := (ctx ->> 'partner_a')::uuid;
  partner_b uuid := (ctx ->> 'partner_b')::uuid;
  author_id uuid := (ctx ->> 'author')::uuid;
  progress_a uuid := (ctx ->> 'progress_a')::uuid;
  progress_b uuid := (ctx ->> 'progress_b')::uuid;
  answer_a_snapshot uuid := (ctx ->> 'answer_a_snapshot')::uuid;
  answer_b_snapshot uuid := (ctx ->> 'answer_b_snapshot')::uuid;
  rich_snapshot uuid := (ctx ->> 'rich_snapshot')::uuid;
  video_snapshot uuid := (ctx ->> 'video_snapshot')::uuid;
  error_text text;
begin
  perform set_config('request.jwt.claim.sub', partner_a::text, true);
  perform public.save_homework_answer(progress_a, answer_a_snapshot, 'Partner A answer to unchanged question');
  assert (select status = 'in_progress' from public.homework_participant_progress where id = progress_a),
    'Partner A did not become in_progress';
  perform set_config('request.jwt.claim.sub', admin::text, true);
  assert (select status = 'not_started' from public.homework_participant_progress where id = progress_b),
    'Partner B changed with Partner A activity';
  perform set_config('request.jwt.claim.sub', partner_a::text, true);

  begin
    perform public.submit_homework(progress_a);
    raise exception 'Verifier expected missing-answer submission rejection';
  exception when others then
    if sqlerrm <> 'Every Long Answer requires a meaningful answer' then raise; end if;
  end;
  perform public.save_homework_answer(progress_a, answer_b_snapshot, '   ');
  begin
    perform public.submit_homework(progress_a);
    raise exception 'Verifier expected whitespace-answer submission rejection';
  exception when others then
    if sqlerrm <> 'Every Long Answer requires a meaningful answer' then raise; end if;
  end;

  for error_text in select 'rich' union all select 'video' union all select 'missing' union all select 'other_person'
  loop
    begin
      if error_text = 'rich' then
        perform public.save_homework_answer(progress_a, rich_snapshot, 'bad');
      elsif error_text = 'video' then
        perform public.save_homework_answer(progress_a, video_snapshot, 'bad');
      elsif error_text = 'missing' then
        perform public.save_homework_answer(progress_a, gen_random_uuid(), 'bad');
      else
        perform public.save_homework_answer(progress_b, answer_a_snapshot, 'bad');
      end if;
      raise exception 'Verifier expected invalid answer rejection: %', error_text;
    exception when others then
      if sqlerrm not in ('Answers may only target Long Answer blocks in the assigned version',
                        'Active participant progress is unavailable') then raise; end if;
    end;
  end loop;

  perform public.save_homework_answer(progress_a, answer_b_snapshot, 'Partner A answer to changed question');
  perform public.submit_homework(progress_a);
  assert (select status = 'submitted' and submitted_at is not null
          from public.homework_participant_progress where id = progress_a),
    'Partner A did not submit';
  perform set_config('request.jwt.claim.sub', admin::text, true);
  assert (select status = 'not_started' from public.homework_participant_progress where id = progress_b),
    'Partner B changed with Partner A submission';
  perform set_config('request.jwt.claim.sub', partner_a::text, true);

  for error_text in select 'answer_a' union all select 'answer_b'
  loop
    begin
      perform public.save_homework_answer(
        progress_a,
        case when error_text = 'answer_a' then answer_a_snapshot else answer_b_snapshot end,
        'Forbidden submitted update');
      raise exception 'Verifier expected submitted answer rejection';
    exception when others then
      if sqlerrm <> 'Submitted answers are read-only' then raise; end if;
    end;
  end loop;
  begin
    update public.homework_participant_progress set status = 'in_progress' where id = progress_a;
    raise exception 'Verifier expected direct progress write rejection';
  exception when others then
    if sqlerrm not like 'permission denied%' then raise; end if;
  end;

  assert (select count(*) from public.homework_answers where participant_progress_id = progress_a) = 2,
    'Partner A expected two answers';
  perform set_config('request.jwt.claim.sub', admin::text, true);
  assert (select count(*) from public.homework_answers where participant_progress_id = progress_b) = 0,
    'Partner B received an answer from Partner A activity';
  perform set_config('request.jwt.claim.sub', partner_b::text, true);
  assert (select count(*) from public.homework_answers) = 0,
    'Partner B can read Partner A answers';
  perform public.save_homework_answer(progress_b, answer_a_snapshot, 'Partner B independent answer');
  assert (select status = 'in_progress' from public.homework_participant_progress where id = progress_b),
    'Partner B did not independently become in_progress';
  perform set_config('request.jwt.claim.sub', partner_a::text, true);
  assert (select count(*) from public.homework_answers) = 2,
    'Partner A cannot read own answers or can read Partner B answer';
  perform set_config('request.jwt.claim.sub', partner_b::text, true);
  assert (select count(*) from public.homework_answers) = 1,
    'Partner B cannot read own answer or can read Partner A answers';
  perform set_config('request.jwt.claim.sub', author_id::text, true);
  assert (select count(*) from public.homework_answers) = 0,
    'Author can read participant answers';
  perform set_config('request.jwt.claim.sub', admin::text, true);
end;
$participant$;

do $version_two_draft$
declare
  ctx jsonb := current_setting('homework.verifier_ctx')::jsonb;
  hid uuid := (ctx ->> 'homework')::uuid;
  v1 uuid := (ctx ->> 'v1')::uuid;
  v2 uuid;
  v2_a uuid;
  v2_b uuid;
  v2_c uuid;
  c_block uuid;
  changed_b jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Question B changed for version two"}]}]}'::jsonb;
begin
  perform set_config('request.jwt.claim.sub', ctx ->> 'admin', true);
  v2 := public.get_or_create_homework_draft(hid, v1);
  assert public.get_or_create_homework_draft(hid, v1) = v2,
    'Version two Draft was not reused';
  assert v2 <> v1, 'V2 must be a new version';
  assert (select based_on_version_id = v1 and status = 'draft'
          from public.homework_versions where id = v2),
    'V2 Draft ancestry is incorrect';
  assert (select count(*) from public.homework_versions
          where homework_id = hid and status = 'draft') = 1,
    'More than one Draft exists';
  assert (select count(*) from public.homework_version_blocks
          where homework_version_id = v2) = 4,
    'V2 did not clone four snapshots';
  assert (select count(*) from public.homework_version_blocks old_block
          join public.homework_version_blocks new_block
            on new_block.homework_block_id = old_block.homework_block_id
          where old_block.homework_version_id = v1
            and new_block.homework_version_id = v2
            and old_block.id <> new_block.id) = 4,
    'V2 must preserve logical IDs but create new snapshots';

  select id into v2_a from public.homework_version_blocks
  where homework_version_id = v2 and homework_block_id = (ctx ->> 'answer_a_block')::uuid;
  select id into v2_b from public.homework_version_blocks
  where homework_version_id = v2 and homework_block_id = (ctx ->> 'answer_b_block')::uuid;
  perform set_config('request.jwt.claim.sub', ctx ->> 'partner_b', true);
  begin
    perform public.save_homework_answer((ctx ->> 'progress_b')::uuid, v2_a, 'Wrong version');
    raise exception 'Verifier expected wrong-version answer rejection';
  exception when others then
    if sqlerrm <> 'Answers may only target Long Answer blocks in the assigned version' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', ctx ->> 'admin', true);
  assert (select rich_text_content =
            (select rich_text_content from public.homework_version_blocks
             where id = (ctx ->> 'answer_a_snapshot')::uuid)
          from public.homework_version_blocks where id = v2_a),
    'Long Answer A prompt changed unexpectedly';
  update public.homework_version_blocks
  set rich_text_content = changed_b where id = v2_b;
  insert into public.homework_blocks(homework_id) values (hid) returning id into c_block;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content)
  values
    (v2, c_block, 'long_answer', 4,
     '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Question C new in version two"}]}]}'::jsonb)
  returning id into v2_c;
  assert (select count(*) from public.homework_version_blocks
          where homework_version_id = v2 and block_type = 'long_answer') = 3,
    'V2 should have three Long Answers';

  ctx := ctx || jsonb_build_object(
    'v2', v2, 'v2_a', v2_a, 'v2_b', v2_b, 'v2_c', v2_c, 'c_block', c_block);
  perform set_config('homework.verifier_ctx', ctx::text, true);
end;
$version_two_draft$;

reset role;

do $move_guards$
declare
  ctx jsonb := current_setting('homework.verifier_ctx')::jsonb;
begin
  begin
    update public.homework_version_blocks
    set homework_version_id = (ctx ->> 'v2')::uuid
    where id = (ctx ->> 'rich_snapshot')::uuid;
    raise exception 'Verifier expected assigned-to-Draft move rejection';
  exception when others then
    if sqlerrm <> 'Assigned published Homework versions are immutable' then raise; end if;
  end;
  begin
    update public.homework_version_blocks
    set homework_version_id = (ctx ->> 'v1')::uuid
    where id = (ctx ->> 'v2_a')::uuid;
    raise exception 'Verifier expected Draft-to-assigned move rejection';
  exception when others then
    if sqlerrm <> 'Assigned published Homework versions are immutable' then raise; end if;
  end;
end;
$move_guards$;

set local role authenticated;

do $finish_workflow$
declare
  ctx jsonb := current_setting('homework.verifier_ctx')::jsonb;
  admin uuid := (ctx ->> 'admin')::uuid;
  partner_a uuid := (ctx ->> 'partner_a')::uuid;
  hid uuid := (ctx ->> 'homework')::uuid;
  assignment_id uuid := (ctx ->> 'assignment')::uuid;
  v1 uuid := (ctx ->> 'v1')::uuid;
  v2 uuid := (ctx ->> 'v2')::uuid;
  old_revision uuid := (ctx ->> 'v1_revision')::uuid;
  old_progress uuid := (ctx ->> 'progress_a')::uuid;
  new_revision uuid;
  new_progress_a uuid;
  new_progress_b uuid;
  error_text text;
begin
  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform public.publish_homework_version(v2);
  assert (select status = 'published' and version_number = 2 and published_at is not null
          from public.homework_versions where id = v2), 'V2 publication failed';
  assert (select count(*) from public.homework_audit_events
          where homework_id = hid and event_type = 'homework_published') = 2,
    'V2 publish audit missing or duplicated';
  assert (select count(*) from public.homework_version_blocks
          where homework_version_id = v1) = 4, 'V1 snapshots changed during V2 publication';

  perform public.force_update_homework_assignment(assignment_id, v2, 'Homework E2E verifier version update');
  assert (select ended_at is not null from public.homework_assignment_revisions
          where id = old_revision), 'Old revision was not ended';
  assert (select count(*) from public.homework_assignment_revisions
          where homework_assignment_id = assignment_id and ended_at is null) = 1,
    'Force update did not leave exactly one active revision';
  select id into new_revision from public.homework_assignment_revisions
  where homework_assignment_id = assignment_id and ended_at is null;
  assert (select homework_version_id = v2 from public.homework_assignment_revisions
          where id = new_revision), 'Active revision does not point to V2';
  select id into new_progress_a from public.homework_participant_progress
  where assignment_revision_id = new_revision and profile_id = partner_a;
  select id into new_progress_b from public.homework_participant_progress
  where assignment_revision_id = new_revision and profile_id = (ctx ->> 'partner_b')::uuid;
  assert new_progress_a is not null and new_progress_b is not null,
    'Force update did not create both participant progress rows';
  assert (select count(*) from public.homework_participant_progress
          where assignment_revision_id = old_revision) = 2,
    'Old progress was not preserved';
  assert (select count(*) from public.homework_answers
          where participant_progress_id = old_progress) = 2,
    'Old answers were not preserved';
  assert (select count(*) from public.homework_answers
          where participant_progress_id = new_progress_a
            and homework_version_block_id = (ctx ->> 'v2_a')::uuid
            and answer_text = 'Partner A answer to unchanged question') = 1,
    'Compatible Long Answer A was not carried to the new snapshot';
  assert (select count(*) from public.homework_answers
          where participant_progress_id = new_progress_a
            and homework_version_block_id in ((ctx ->> 'v2_b')::uuid, (ctx ->> 'v2_c')::uuid)) = 0,
    'Changed/new required answers were incorrectly copied';
  assert (select status = 'in_progress' and submitted_at is null
          from public.homework_participant_progress where id = new_progress_a),
    'Partner A remained submitted despite changed required work';
  assert (select count(*) from public.homework_audit_events
          where homework_assignment_id = assignment_id
            and event_type = 'homework_assignment_force_updated'
            and from_version_id = v1 and to_version_id = v2) = 1,
    'Force-update audit is missing or inconsistent';

  perform set_config('request.jwt.claim.sub', partner_a::text, true);
  assert (select count(*) from public.homework_answers
          where participant_progress_id = old_progress) = 2,
    'Partner A lost permitted historical answer visibility';
  begin
    perform public.save_homework_answer(old_progress, (ctx ->> 'answer_a_snapshot')::uuid, 'Forbidden old write');
    raise exception 'Verifier expected old answer write rejection';
  exception when others then
    if sqlerrm <> 'Active participant progress is unavailable' then raise; end if;
  end;
  begin
    perform public.submit_homework(old_progress);
    raise exception 'Verifier expected old submission rejection';
  exception when others then
    if sqlerrm <> 'Active participant progress is unavailable' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform public.unassign_homework(assignment_id);
  assert (select unassigned_at is not null and unassigned_by = admin
          from public.homework_assignments where id = assignment_id),
    'Assignment was not unassigned';
  assert (select ended_at is not null from public.homework_assignment_revisions
          where id = new_revision), 'Active revision was not ended by unassign';
  assert (select count(*) from public.homework_audit_events
          where homework_assignment_id = assignment_id
            and event_type = 'homework_assignment_unassigned') = 1,
    'Unassign audit missing';
  perform set_config('request.jwt.claim.sub', partner_a::text, true);
  begin
    perform public.save_homework_answer(new_progress_a, (ctx ->> 'v2_a')::uuid, 'Forbidden unassigned write');
    raise exception 'Verifier expected post-unassign answer rejection';
  exception when others then
    if sqlerrm <> 'Active participant progress is unavailable' then raise; end if;
  end;
  begin
    perform public.submit_homework(new_progress_a);
    raise exception 'Verifier expected post-unassign submission rejection';
  exception when others then
    if sqlerrm <> 'Active participant progress is unavailable' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform public.withdraw_homework(hid);
  assert (select withdrawn_at is not null and withdrawn_by = admin
          from public.homeworks where id = hid), 'Homework withdrawal failed';
  assert (select count(*) from public.homework_audit_events
          where homework_id = hid and event_type = 'homework_withdrawn') = 1,
    'Withdrawal audit missing';
  begin
    perform public.assign_homework(hid, (ctx ->> 'case')::uuid, v2);
    raise exception 'Verifier expected withdrawn assignment rejection';
  exception when others then
    if sqlerrm <> 'Homework is unavailable' then raise; end if;
  end;
  begin
    perform public.get_or_create_homework_draft_for_session((ctx ->> 'session')::uuid);
    raise exception 'Verifier expected withdrawn root reuse rejection';
  exception when others then
    if sqlerrm <> 'Homework is withdrawn' then raise; end if;
  end;

  assert (select count(*) from public.homeworks where id = hid) = 1,
    'Withdraw removed the Homework root';
  assert (select count(*) from public.homework_versions where homework_id = hid) = 2,
    'Withdraw removed Homework versions';
  assert (select count(*) from public.homework_assignment_revisions
          where homework_assignment_id = assignment_id) = 2,
    'Unassign/withdraw removed revision history';
  assert (select count(*) from public.homework_answers answer
          join public.homework_participant_progress p on p.id = answer.participant_progress_id
          join public.homework_assignment_revisions r on r.id = p.assignment_revision_id
          where r.homework_assignment_id = assignment_id) >= 4,
    'Unassign/withdraw removed response history';
  assert (select count(*) from public.homework_audit_events
          where homework_id = hid) = 6,
    'Homework audit event count is incorrect';
  assert not exists (
    select 1 from public.homework_audit_events e
    left join public.homework_assignments a on a.id = e.homework_assignment_id
    left join public.homework_versions vf on vf.id = e.from_version_id
    left join public.homework_versions vt on vt.id = e.to_version_id
    where e.homework_id = hid
      and ((a.id is not null and a.homework_id <> hid)
        or (vf.id is not null and vf.homework_id <> hid)
        or (vt.id is not null and vt.homework_id <> hid)
        or e.actor_profile_id <> admin)
  ), 'Homework audit parents or actors are inconsistent';
  assert (select count(*) from public.audit_events
          where entity_type = 'homework' and entity_id = hid) = 0,
    'Homework events leaked into the shared audit table';

  ctx := ctx || jsonb_build_object(
    'v2_revision', new_revision, 'v2_progress_a', new_progress_a,
    'v2_progress_b', new_progress_b, 'result', 'passed');
  perform set_config('homework.verifier_ctx', ctx::text, true);
end;
$finish_workflow$;

select current_setting('homework.verifier_ctx') as verifier_fixture_ids;
rollback;
