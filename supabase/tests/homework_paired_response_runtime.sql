-- DEV-only rollback verifier. All synthetic Auth and Homework records roll back.
begin;

do $setup$
declare
  ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  couple_group uuid;
  counselor_group uuid;
  unrelated_counselor_group uuid;
  case_id uuid;
  session_id uuid;
  homework_id uuid;
  version_id uuid;
  left_block uuid;
  right_block uuid;
  left_optional_block uuid;
  right_optional_block uuid;
  left_snapshot uuid;
  right_snapshot uuid;
  left_optional_snapshot uuid;
  right_optional_snapshot uuid;
  left_id_one uuid := gen_random_uuid();
  right_id_one uuid := gen_random_uuid();
  left_id_two uuid := gen_random_uuid();
  right_id_two uuid := gen_random_uuid();
  optional_id uuid := gen_random_uuid();
  assignment_id uuid;
  revision_id uuid;
  progress_a uuid;
  progress_b uuid;
  group_id uuid := gen_random_uuid();
  optional_group_id uuid := gen_random_uuid();
  payload_a jsonb;
  payload_b jsonb;
  failure text;
  i integer;
begin
  for i in 1..7 loop
    insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data)
    values (ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'paired-response-rollback-' || ids[i]::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);
    update public.profiles set status = 'active', first_name = 'Rollback', last_name = 'Verifier ' || i where id = ids[i];
    insert into public.profile_roles(profile_id, role)
    values (ids[i], case when i = 1 then 'super_admin'::public.app_role when i <= 3 then 'couple'::public.app_role else 'counselor'::public.app_role end);
  end loop;
  insert into public.groups(group_type, name) values ('couple', 'Paired response rollback verifier') returning id into couple_group;
  insert into public.group_members(group_id, profile_id) values (couple_group, ids[2]), (couple_group, ids[3]);
  insert into public.groups(group_type, name) values ('counselor_team', 'Paired response assigned Counselor rollback verifier') returning id into counselor_group;
  insert into public.group_members(group_id, profile_id) values (counselor_group, ids[4]), (counselor_group, ids[5]);
  insert into public.groups(group_type, name) values ('counselor_team', 'Paired response unassigned Counselor rollback verifier') returning id into unrelated_counselor_group;
  insert into public.group_members(group_id, profile_id) values (unrelated_counselor_group, ids[6]), (unrelated_counselor_group, ids[7]);
  insert into public.counseling_cases(couple_group_id, created_by, status) values (couple_group, ids[1], 'active') returning id into case_id;
  insert into public.case_assignments(counseling_case_id, assigned_group_id, assignment_type, assigned_by)
  values (case_id, counselor_group, 'counselor', ids[1]);
  insert into public.sessions(title, created_by) values ('Paired response rollback verifier', ids[1]) returning id into session_id;
  insert into public.homeworks(session_id) values (session_id) returning id into homework_id;
  insert into public.homework_versions(homework_id, status, created_by) values (homework_id, 'draft', ids[1]) returning id into version_id;
  insert into public.homework_blocks(homework_id) values (homework_id) returning id into left_block;
  insert into public.homework_blocks(homework_id) values (homework_id) returning id into right_block;
  insert into public.homework_blocks(homework_id) values (homework_id) returning id into left_optional_block;
  insert into public.homework_blocks(homework_id) values (homework_id) returning id into right_optional_block;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, description, rich_text_content)
  values (version_id, left_block, 'long_answer', 0, 'Left', jsonb_build_object('kind','side_by_side_response','groupId',group_id,'side','left','instructions','','leftHeading','Left','rightHeading','Right','bothRequired',true,'responseMode','paired_rows_v1')::text, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Pair"}]}]}'::jsonb) returning id into left_snapshot;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, description, rich_text_content)
  values (version_id, right_block, 'long_answer', 1, 'Right', jsonb_build_object('kind','side_by_side_response','groupId',group_id,'side','right','instructions','','leftHeading','Left','rightHeading','Right','bothRequired',true,'responseMode','paired_rows_v1')::text, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Pair"}]}]}'::jsonb) returning id into right_snapshot;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, description, rich_text_content)
  values (version_id, left_optional_block, 'long_answer', 2, 'Optional left', jsonb_build_object('kind','side_by_side_response','groupId',optional_group_id,'side','left','instructions','','leftHeading','Optional left','rightHeading','Optional right','bothRequired',false,'responseMode','paired_rows_v1')::text, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Optional"}]}]}'::jsonb) returning id into left_optional_snapshot;
  insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, description, rich_text_content)
  values (version_id, right_optional_block, 'long_answer', 3, 'Optional right', jsonb_build_object('kind','side_by_side_response','groupId',optional_group_id,'side','right','instructions','','leftHeading','Optional left','rightHeading','Optional right','bothRequired',false,'responseMode','paired_rows_v1')::text, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Optional"}]}]}'::jsonb) returning id into right_optional_snapshot;
  perform set_config('paired_response_test.ctx', jsonb_build_object('admin',ids[1],'a',ids[2],'b',ids[3],'counselor',ids[4],'unassigned_counselor',ids[6], 'homework',homework_id,'case',case_id,'version',version_id,'session',session_id,'left',left_snapshot,'right',right_snapshot,'left_optional',left_optional_snapshot,'right_optional',right_optional_snapshot, 'id1',left_id_one,'id2',left_id_two,'optional_id',optional_id)::text, true);
  assert private.homework_side_by_side_pair_is_valid(version_id, group_id::text), 'Required paired block snapshot is invalid';
  assert private.homework_side_by_side_pair_is_valid(version_id, optional_group_id::text), 'Optional paired block snapshot is invalid';
end;
$setup$;

set local role authenticated;

do $authorize_and_assign$
declare
  ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
  assignment_id uuid;
  revision_id uuid;
begin
  perform set_config('request.jwt.claim.sub', ctx->>'admin', true);
  perform public.publish_homework_version((ctx->>'version')::uuid);
  assignment_id := public.assign_homework((ctx->>'homework')::uuid, (ctx->>'case')::uuid, (ctx->>'version')::uuid);
  select id into revision_id from public.homework_assignment_revisions where homework_assignment_id=assignment_id and ended_at is null;
  ctx := ctx || jsonb_build_object(
    'progress_a',(select id from public.homework_participant_progress where assignment_revision_id=revision_id and profile_id=(ctx->>'a')::uuid),
    'progress_b',(select id from public.homework_participant_progress where assignment_revision_id=revision_id and profile_id=(ctx->>'b')::uuid));
  perform set_config('paired_response_test.ctx', ctx::text, true);
end;
$authorize_and_assign$;

reset role;

do $link_case_session$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  insert into public.case_sessions(counseling_case_id, session_id, actual_sequence, template_sequence_number,
    title, homework_assignment_revision_id, material_released_at, homework_released_at, activated_at, activated_by)
  values ((ctx->>'case')::uuid, (ctx->>'session')::uuid, 1, 1, 'Paired response rollback session',
    (select id from public.homework_assignment_revisions where homework_assignment_id=
      (select id from public.homework_assignments where homework_id=(ctx->>'homework')::uuid and counseling_case_id=(ctx->>'case')::uuid and unassigned_at is null)
      and ended_at is null), now(), now(), now(), (ctx->>'admin')::uuid);
end;
$link_case_session$;

set local role authenticated;

do $participant_checks$
declare
  ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
  a uuid := (ctx->>'a')::uuid;
  b uuid := (ctx->>'b')::uuid;
  pa uuid := (ctx->>'progress_a')::uuid;
  pb uuid := (ctx->>'progress_b')::uuid;
  left_block uuid := (ctx->>'left')::uuid;
  right_block uuid := (ctx->>'right')::uuid;
  left_optional uuid := (ctx->>'left_optional')::uuid;
  right_optional uuid := (ctx->>'right_optional')::uuid;
  payload jsonb;
  resubmission jsonb;
  review jsonb;
  err text;
begin
  perform set_config('request.jwt.claim.sub', a::text, true);
  payload := jsonb_build_object(left_block::text, (jsonb_build_object('version',1,'rows',jsonb_build_array(
      jsonb_build_object('id',ctx->>'id1','value',E'line one\nline two'), jsonb_build_object('id',ctx->>'id2','value','left two'))))::text,
    right_block::text, (jsonb_build_object('version',1,'rows',jsonb_build_array(
      jsonb_build_object('id',ctx->>'id1','value','right one'), jsonb_build_object('id',ctx->>'id2','value','right two'))))::text,
    left_optional::text, (jsonb_build_object('version',1,'rows',jsonb_build_array(jsonb_build_object('id',ctx->>'optional_id','value',''))))::text,
    right_optional::text, (jsonb_build_object('version',1,'rows',jsonb_build_array(jsonb_build_object('id',ctx->>'optional_id','value',''))))::text);
  assert public.persist_participant_homework(pa, payload, 'save') = 'in_progress', 'Paired response draft did not persist';
  assert (select answer_text::jsonb #>> '{rows,0,value}' = E'line one\nline two' from public.homework_answers where participant_progress_id=pa and homework_version_block_id=left_block), 'Multiline paired response was not persisted';
  begin
    perform public.persist_participant_homework(pa, jsonb_set(payload, array[left_block::text], to_jsonb('{"version":1,"rows":[{"id":"malformed","value":"only one"}]}'::text)), 'save');
    raise exception 'Expected mismatched paired row rejection';
  exception when others then
    get stacked diagnostics err = message_text;
    if err <> 'Side-by-Side responses are invalid' then raise; end if;
  end;
  begin
    perform public.persist_participant_homework(pa, jsonb_set(payload, array[right_block::text], to_jsonb(jsonb_build_object('version',1,'rows',jsonb_build_array(jsonb_build_object('id',ctx->>'id1','value','right one'),jsonb_build_object('id',ctx->>'id2','value','')))::text)), 'submit');
    raise exception 'Expected incomplete required pair rejection';
  exception when others then
    get stacked diagnostics err = message_text;
    if err <> 'Every required Side-by-Side response pair needs both meaningful answers' then raise; end if;
  end;
  assert public.persist_participant_homework(pa, payload, 'submit') = 'submitted', 'Complete paired responses did not submit';
  assert not exists (select 1 from public.homework_answers where participant_progress_id=pb), 'Partner A answers leaked to partner B';
  perform set_config('request.jwt.claim.sub', ctx->>'counselor', true);
  review := public.get_counselor_submitted_homework_review(pa);
  assert review is not null and review->>'sessionTitle' = 'Paired response rollback session', 'Counselor-of-record could not review submitted Homework';
  assert review #>> '{questions,0,title}' = 'Left' and review #>> '{questions,1,title}' = 'Right', 'Published paired headings were not preserved for review';
  assert position('line one' in review #>> '{questions,0,answerText}') > 0 and position('line two' in review #>> '{questions,0,answerText}') > 0, 'Multiline submitted answer was not available to the Counselor';
  perform set_config('request.jwt.claim.sub', ctx->>'unassigned_counselor', true);
  assert public.get_counselor_submitted_homework_review(pa) is null, 'Unassigned Counselor could review Couple Homework';
  begin
    perform public.reopen_participant_homework((ctx->>'case')::uuid, pa);
    raise exception 'Expected unassigned Counselor reopen denial';
  exception when others then
    get stacked diagnostics err = message_text;
    if err <> 'Homework is unavailable' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', a::text, true);
  assert public.get_counselor_submitted_homework_review(pa) is null, 'Couple user could invoke Counselor review';
  begin
    perform public.reopen_participant_homework((ctx->>'case')::uuid, pa);
    raise exception 'Expected Couple role reopen denial';
  exception when others then
    get stacked diagnostics err = message_text;
    if err <> 'Homework is unavailable' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', ctx->>'counselor', true);
  assert public.reopen_participant_homework((ctx->>'case')::uuid, pa) is not null, 'Counselor-of-record could not reopen submitted Homework';
  assert (select status='in_progress' and submitted_at is null from public.homework_participant_progress where id=pa), 'Reopen did not reset submission state';
  assert public.get_counselor_submitted_homework_review(pb) is null,
    'Reopening one partner exposed the other partner response (status=' || coalesce((select status::text from public.homework_participant_progress where id=pb), 'unavailable') || ')';
  perform set_config('request.jwt.claim.sub', a::text, true);
  assert (select answer_text::jsonb ? 'rows' and answer_text like '%line one%' from public.homework_answers where participant_progress_id=pa and homework_version_block_id=left_block), 'Reopen discarded existing paired responses';
  resubmission := jsonb_set(payload, array[left_block::text], to_jsonb(jsonb_build_object('version',1,'rows',jsonb_build_array(
    jsonb_build_object('id',ctx->>'id1','value','Revised after reopen'), jsonb_build_object('id',ctx->>'id2','value','left two')) )::text));
  assert public.persist_participant_homework(pa, resubmission, 'submit') = 'submitted', 'Participant could not edit and resubmit reopened paired responses';
  assert (select answer_text::jsonb #>> '{rows,0,id}' = ctx->>'id1' and answer_text::jsonb #>> '{rows,1,id}' = ctx->>'id2' and answer_text::jsonb #>> '{rows,0,value}' = 'Revised after reopen' from public.homework_answers where participant_progress_id=pa and homework_version_block_id=left_block), 'Resubmission did not preserve stable pair IDs and updated text';
  perform set_config('request.jwt.claim.sub', ctx->>'counselor', true);
  review := public.get_counselor_submitted_homework_review(pa);
  assert review is not null and review #>> '{questions,0,answerText}' like '%Revised after reopen%', 'Counselor review did not reflect resubmitted response';
  perform set_config('request.jwt.claim.sub', b::text, true);
  begin
    perform public.persist_participant_homework(pa, payload, 'save');
    raise exception 'Expected cross-partner persistence denial';
  exception when others then
    get stacked diagnostics err = message_text;
    if err <> 'Active participant progress is unavailable' then raise; end if;
  end;
  assert public.persist_participant_homework(pb, payload, 'save') = 'in_progress', 'Independent partner paired-answer persistence failed';
end;
$participant_checks$;

reset role;
rollback;
