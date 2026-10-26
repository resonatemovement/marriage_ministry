-- Focused linked-DEV verifier for mixed Homework responses. Every row rolls back.
begin;

do $setup$
declare
  admin_id uuid := gen_random_uuid();
  partner_a uuid := gen_random_uuid();
  partner_b uuid := gen_random_uuid();
  couple_group uuid;
  case_id uuid;
  session_id uuid;
  homework_id uuid;
  version_id uuid;
  assignment_id uuid;
  revision_id uuid;
  progress_a uuid;
  progress_b uuid;
  long_logical uuid;
  checkbox_logical uuid;
  optional_checkbox_logical uuid;
  radio_logical uuid;
  optional_radio_logical uuid;
  long_snapshot uuid;
  checkbox_snapshot uuid;
  optional_checkbox_snapshot uuid;
  radio_snapshot uuid;
  optional_radio_snapshot uuid;
  checkbox_choice uuid := gen_random_uuid();
  checkbox_other uuid := gen_random_uuid();
  optional_checkbox_choice uuid := gen_random_uuid();
  optional_checkbox_other uuid := gen_random_uuid();
  radio_choice uuid := gen_random_uuid();
  radio_other uuid := gen_random_uuid();
  optional_radio_choice uuid := gen_random_uuid();
  optional_radio_other uuid := gen_random_uuid();
  legacy_session uuid;
  legacy_homework uuid;
  legacy_version uuid;
  legacy_logical uuid;
  legacy_snapshot uuid;
  legacy_assignment uuid;
  legacy_revision uuid;
  legacy_progress_a uuid;
  prompt jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Verifier prompt"}]}]}'::jsonb;
begin
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data)
  values
    (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'homework-selection-admin-' || admin_id::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb),
    (partner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'homework-selection-a-' || partner_a::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb),
    (partner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'homework-selection-b-' || partner_b::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);

  update public.profiles
  set status = 'active', first_name = 'Homework', last_name = 'Selection Rollback Verifier'
  where id in (admin_id, partner_a, partner_b);
  insert into public.profile_roles(profile_id, role)
  values (admin_id, 'super_admin'), (partner_a, 'couple'), (partner_b, 'couple');

  insert into public.groups(group_type, name)
  values ('couple', 'Homework selection rollback verifier Couple')
  returning id into couple_group;
  insert into public.group_members(group_id, profile_id)
  values (couple_group, partner_a), (couple_group, partner_b);
  insert into public.counseling_cases(couple_group_id, created_by)
  values (couple_group, admin_id) returning id into case_id;

  insert into public.sessions(title, created_by)
  values ('Homework selection rollback verifier', admin_id) returning id into session_id;
  insert into public.homeworks(session_id) values (session_id) returning id into homework_id;
  insert into public.homework_versions(homework_id, status, created_by)
  values (homework_id, 'draft', admin_id) returning id into version_id;

  insert into public.homework_blocks(homework_id) values (homework_id) returning id into long_logical;
  insert into public.homework_blocks(homework_id) values (homework_id) returning id into checkbox_logical;
  insert into public.homework_blocks(homework_id) values (homework_id) returning id into optional_checkbox_logical;
  insert into public.homework_blocks(homework_id) values (homework_id) returning id into radio_logical;
  insert into public.homework_blocks(homework_id) values (homework_id) returning id into optional_radio_logical;

  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content)
  values (version_id, long_logical, 'long_answer', 0, prompt)
  returning id into long_snapshot;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content, question_choices, is_required)
  values
    (version_id, checkbox_logical, 'checkbox_question', 1, prompt,
     jsonb_build_array(jsonb_build_object('id', checkbox_choice, 'label', 'First'), jsonb_build_object('id', checkbox_other, 'label', 'Second')), true)
  returning id into checkbox_snapshot;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content, question_choices, is_required)
  values
    (version_id, optional_checkbox_logical, 'checkbox_question', 2, prompt,
     jsonb_build_array(jsonb_build_object('id', optional_checkbox_choice, 'label', 'First'), jsonb_build_object('id', optional_checkbox_other, 'label', 'Second')), false)
  returning id into optional_checkbox_snapshot;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content, question_choices, is_required)
  values
    (version_id, radio_logical, 'radio_question', 3, prompt,
     jsonb_build_array(jsonb_build_object('id', radio_choice, 'label', 'First'), jsonb_build_object('id', radio_other, 'label', 'Second')), true)
  returning id into radio_snapshot;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content, question_choices, is_required)
  values
    (version_id, optional_radio_logical, 'radio_question', 4, prompt,
     jsonb_build_array(jsonb_build_object('id', optional_radio_choice, 'label', 'First'), jsonb_build_object('id', optional_radio_other, 'label', 'Second')), false)
  returning id into optional_radio_snapshot;

  insert into public.sessions(title, created_by)
  values ('Homework legacy rollback verifier', admin_id) returning id into legacy_session;
  insert into public.homeworks(session_id) values (legacy_session) returning id into legacy_homework;
  insert into public.homework_versions(homework_id, status, created_by)
  values (legacy_homework, 'draft', admin_id) returning id into legacy_version;
  insert into public.homework_blocks(homework_id) values (legacy_homework) returning id into legacy_logical;
  insert into public.homework_version_blocks
    (homework_version_id, homework_block_id, block_type, position, rich_text_content)
  values (legacy_version, legacy_logical, 'long_answer', 0, prompt)
  returning id into legacy_snapshot;

  perform set_config('homework.selection_fix_ctx', jsonb_build_object(
    'admin', admin_id, 'partner_a', partner_a, 'partner_b', partner_b,
    'case', case_id, 'homework', homework_id, 'version', version_id,
    'long', long_snapshot, 'checkbox', checkbox_snapshot,
    'optional_checkbox', optional_checkbox_snapshot, 'radio', radio_snapshot,
    'optional_radio', optional_radio_snapshot, 'checkbox_choice', checkbox_choice,
    'radio_choice', radio_choice, 'legacy_homework', legacy_homework,
    'legacy_version', legacy_version, 'legacy_snapshot', legacy_snapshot
  )::text, true);
end;
$setup$;

set local role authenticated;

do $publish_and_assign$
declare
  ctx jsonb := current_setting('homework.selection_fix_ctx')::jsonb;
  assignment_id uuid;
  revision_id uuid;
  legacy_assignment uuid;
  legacy_revision uuid;
begin
  perform set_config('request.jwt.claim.sub', ctx ->> 'admin', true);
  perform public.publish_homework_version((ctx ->> 'version')::uuid);
  assignment_id := public.assign_homework((ctx ->> 'homework')::uuid, (ctx ->> 'case')::uuid, (ctx ->> 'version')::uuid);
  select id into revision_id from public.homework_assignment_revisions
  where homework_assignment_id = assignment_id and ended_at is null;

  perform public.publish_homework_version((ctx ->> 'legacy_version')::uuid);
  legacy_assignment := public.assign_homework((ctx ->> 'legacy_homework')::uuid, (ctx ->> 'case')::uuid, (ctx ->> 'legacy_version')::uuid);
  select id into legacy_revision from public.homework_assignment_revisions
  where homework_assignment_id = legacy_assignment and ended_at is null;

  ctx := ctx || jsonb_build_object(
    'assignment', assignment_id, 'revision', revision_id,
    'progress_a', (select id from public.homework_participant_progress where assignment_revision_id = revision_id and profile_id = (ctx ->> 'partner_a')::uuid),
    'progress_b', (select id from public.homework_participant_progress where assignment_revision_id = revision_id and profile_id = (ctx ->> 'partner_b')::uuid),
    'legacy_progress_a', (select id from public.homework_participant_progress where assignment_revision_id = legacy_revision and profile_id = (ctx ->> 'partner_a')::uuid)
  );
  perform set_config('homework.selection_fix_ctx', ctx::text, true);
end;
$publish_and_assign$;

do $participant_regression$
declare
  ctx jsonb := current_setting('homework.selection_fix_ctx')::jsonb;
  progress_a uuid := (ctx ->> 'progress_a')::uuid;
  progress_b uuid := (ctx ->> 'progress_b')::uuid;
  mixed jsonb := jsonb_build_object(
    ctx ->> 'long', 'A meaningful response',
    ctx ->> 'checkbox', jsonb_build_array(ctx ->> 'checkbox_choice'),
    ctx ->> 'optional_checkbox', '[]'::jsonb,
    ctx ->> 'radio', to_jsonb(ctx ->> 'radio_choice'),
    ctx ->> 'optional_radio', to_jsonb(''::text)
  );
  invalid jsonb;
  error_text text;
begin
  perform set_config('request.jwt.claim.sub', ctx ->> 'partner_a', true);
  assert public.persist_participant_homework(progress_a, mixed, 'save') = 'in_progress',
    'Mixed Save Draft did not become in_progress';
  assert (select answer_value = to_jsonb(ctx ->> 'radio_choice')
          from public.homework_answers where participant_progress_id = progress_a
            and homework_version_block_id = (ctx ->> 'radio')::uuid),
    'Radio answer was not stored as a JSON scalar';
  assert (select answer_value = jsonb_build_array(ctx ->> 'checkbox_choice')
          from public.homework_answers where participant_progress_id = progress_a
            and homework_version_block_id = (ctx ->> 'checkbox')::uuid),
    'Checkbox answer was not stored as a JSON array';

  begin
    perform public.persist_participant_homework(progress_a, jsonb_set(mixed, array[ctx ->> 'checkbox'], '[]'::jsonb), 'submit');
    raise exception 'Expected required Checkbox rejection';
  exception when others then
    get stacked diagnostics error_text = message_text;
    if error_text <> 'Every required Homework response needs a meaningful answer' then raise; end if;
  end;
  begin
    perform public.persist_participant_homework(progress_a, jsonb_set(mixed, array[ctx ->> 'radio'], to_jsonb(''::text)), 'submit');
    raise exception 'Expected required Radio rejection';
  exception when others then
    get stacked diagnostics error_text = message_text;
    if error_text <> 'Every required Homework response needs a meaningful answer' then raise; end if;
  end;

  assert public.persist_participant_homework(progress_a, mixed, 'submit') = 'submitted',
    'Mixed answers did not submit with optional selections unanswered';
  assert (select status = 'submitted' and submitted_at is not null
          from public.homework_participant_progress where id = progress_a),
    'Mixed submission did not persist Submitted status';

  begin
    perform public.persist_participant_homework(progress_a, mixed, 'save');
    raise exception 'Expected submitted-answer immutability rejection';
  exception when others then
    if sqlerrm <> 'Submitted answers are read-only' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', ctx ->> 'partner_b', true);
  assert (select count(*) from public.homework_answers where participant_progress_id = progress_a) = 0,
    'Partner B can read Partner A selection answers';
  begin
    perform public.persist_participant_homework(progress_a, mixed, 'save');
    raise exception 'Expected cross-partner ownership rejection';
  exception when others then
    if sqlerrm <> 'Active participant progress is unavailable' then raise; end if;
  end;

  invalid := jsonb_build_object(ctx ->> 'radio', to_jsonb(gen_random_uuid()::text));
  begin
    perform public.persist_participant_homework(progress_b, invalid, 'save');
    raise exception 'Expected unknown Radio choice rejection';
  exception when others then
    if sqlerrm <> 'Selection response contains an unknown choice' then raise; end if;
  end;
  invalid := jsonb_build_object(ctx ->> 'checkbox', jsonb_build_array(ctx ->> 'checkbox_choice', ctx ->> 'checkbox_choice'));
  begin
    perform public.persist_participant_homework(progress_b, invalid, 'save');
    raise exception 'Expected duplicate Checkbox rejection';
  exception when others then
    if sqlerrm <> 'Checkbox response contains an invalid or duplicate choice' then raise; end if;
  end;
  invalid := jsonb_build_object(ctx ->> 'checkbox', to_jsonb(ctx ->> 'checkbox_choice'));
  begin
    perform public.persist_participant_homework(progress_b, invalid, 'save');
    raise exception 'Expected malformed Checkbox rejection';
  exception when others then
    if sqlerrm <> 'Homework answer does not belong to this assignment or has an invalid type' then raise; end if;
  end;
  invalid := jsonb_build_object(gen_random_uuid()::text, 'Wrong version');
  begin
    perform public.persist_participant_homework(progress_b, invalid, 'save');
    raise exception 'Expected pinned-version rejection';
  exception when others then
    if sqlerrm <> 'Homework answer does not belong to this assignment or has an invalid type' then raise; end if;
  end;
  assert (select status = 'not_started' from public.homework_participant_progress where id = progress_b),
    'Rejected Partner B payload changed progress';
  assert (select count(*) from public.homework_answers where participant_progress_id = progress_b) = 0,
    'Rejected Partner B payload persisted answers';

  perform set_config('request.jwt.claim.sub', ctx ->> 'partner_a', true);
  assert public.persist_participant_homework(
    (ctx ->> 'legacy_progress_a')::uuid,
    jsonb_build_object(ctx ->> 'legacy_snapshot', 'Legacy Long Answer response'),
    'submit'
  ) = 'submitted', 'Legacy Long Answer-only submission failed';
end;
$participant_regression$;

do $force_update_regression$
declare
  ctx jsonb := current_setting('homework.selection_fix_ctx')::jsonb;
  next_version uuid;
  next_revision uuid;
  next_progress uuid;
begin
  perform set_config('request.jwt.claim.sub', ctx ->> 'admin', true);
  next_version := public.get_or_create_homework_draft((ctx ->> 'homework')::uuid, (ctx ->> 'version')::uuid);
  perform public.publish_homework_version(next_version);
  perform public.force_update_homework_assignment((ctx ->> 'assignment')::uuid, next_version, 'Selection scalar regression verifier');
  select id into next_revision from public.homework_assignment_revisions
  where homework_assignment_id = (ctx ->> 'assignment')::uuid and ended_at is null;
  select id into next_progress from public.homework_participant_progress
  where assignment_revision_id = next_revision and profile_id = (ctx ->> 'partner_a')::uuid;
  assert (select status = 'submitted' and submitted_at is not null
          from public.homework_participant_progress where id = next_progress),
    'Forced version update did not preserve completed mixed responses';
  assert (select count(*) from public.homework_answers where participant_progress_id = next_progress) = 5,
    'Forced version update did not preserve every compatible mixed response';
  assert (select count(*) from public.homework_audit_events
          where homework_assignment_id = (ctx ->> 'assignment')::uuid
            and event_type = 'homework_assignment_force_updated') = 1,
    'Forced version update audit was not preserved';
end;
$force_update_regression$;

reset role;
rollback;
