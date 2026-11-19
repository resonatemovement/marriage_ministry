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
  values (case_id, counselor_group, 'counselor', ids[1]) returning id into assignment_id;
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
  perform set_config('paired_response_test.ctx', jsonb_build_object('admin',ids[1],'a',ids[2],'b',ids[3],'counselor',ids[4],'unassigned_counselor',ids[6], 'homework',homework_id,'version',version_id,'case',case_id,'session',session_id,'left',left_snapshot,'right',right_snapshot,'left_optional',left_optional_snapshot,'right_optional',right_optional_snapshot, 'id1',left_id_one,'id2',left_id_two,'optional_id',optional_id, 'counselor_group',counselor_group,'unassigned_group',unrelated_counselor_group,'case_assignment',assignment_id)::text, true);
  assert private.homework_side_by_side_pair_is_valid(version_id, group_id::text), 'Required paired block snapshot is invalid';
  assert private.homework_side_by_side_pair_is_valid(version_id, optional_group_id::text), 'Optional paired block snapshot is invalid';
end;
$setup$;

-- Test-only SECURITY DEFINER helper can read the deliberately private claim
-- snapshot, then exercise the actual service-role prepare/start RPC contract.
create function pg_temp.prepare_synthetic_homework_notification_payload(
  target_notification_id uuid,
  target_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare recipient_emails jsonb; candidate jsonb;
begin
  select jsonb_agg(to_jsonb(lower(btrim(profile.email))) order by profile.id)
  into recipient_emails
  from public.homework_completion_notification_attempts attempt
  join public.profiles profile on profile.id = any(attempt.recipient_profile_ids)
  where attempt.notification_id = target_notification_id and attempt.claim_token = target_claim_token;
  candidate := jsonb_build_object(
    'from', 'Marriage Ministry Test <test@example.invalid>',
    'to', recipient_emails,
    'subject', 'Synthetic Homework Ready for Review',
    'html', '<p>Synthetic notification without answers.</p>',
    'text', 'Synthetic notification without answers.'
  );
  return public.prepare_homework_completion_notification_payload(
    target_notification_id, target_claim_token, candidate
  );
end;
$$;

create function pg_temp.inspect_synthetic_homework_notification_payload(target_notification_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'firstProviderStartedAt', payload.first_provider_started_at,
    'idempotencyCutoffAt', payload.idempotency_cutoff_at
  )
  from public.homework_completion_notification_payloads payload
  where payload.notification_id = target_notification_id and payload.payload_kind = 'automatic';
$$;

create function pg_temp.attempt_synthetic_homework_payload_cutoff_mutation(target_notification_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare error_message text;
begin
  update public.homework_completion_notification_payloads
  set idempotency_cutoff_at = idempotency_cutoff_at + interval '1 second'
  where notification_id = target_notification_id and payload_kind = 'automatic';
  return 'update unexpectedly succeeded';
exception when others then
  get stacked diagnostics error_message = message_text;
  return error_message;
end;
$$;

create function pg_temp.inspect_synthetic_homework_notification(target_notification_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', notification.status,
    'statusCode', notification.status_code,
    'attemptCount', notification.attempt_count,
    'claimSequence', notification.claim_sequence,
    'claimToken', notification.claim_token,
    'nextAttemptAt', notification.next_attempt_at,
    'providerIdempotencyKey', notification.provider_idempotency_key,
    'recipientProfileIds', notification.recipient_profile_ids,
    'manualRecoveryRecipientProfileIds', notification.manual_recovery_recipient_profile_ids,
    'manualRecoveryReservedBy', notification.manual_recovery_reserved_by,
    'manualRecoveryUsedAt', notification.manual_recovery_used_at,
    'manualRecoveryPending', notification.manual_recovery_pending
  )
  from public.homework_completion_notifications notification
  where notification.id = target_notification_id;
$$;

create function pg_temp.inspect_synthetic_homework_attempt(target_attempt_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', attempt.status,
    'providerMessageId', attempt.provider_message_id,
    'errorCategory', attempt.error_category,
    'cancellationRequestedAt', attempt.cancellation_requested_at,
    'claimToken', attempt.claim_token,
    'attemptNumber', attempt.attempt_number
  )
  from public.homework_completion_notification_attempts attempt
  where attempt.id = target_attempt_id;
$$;

create function pg_temp.inspect_synthetic_homework_attempt_sequence(target_notification_id uuid, target_claim_sequence integer)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object('status', attempt.status, 'attemptNumber', attempt.attempt_number)
  from public.homework_completion_notification_attempts attempt
  where attempt.notification_id = target_notification_id and attempt.claim_sequence = target_claim_sequence;
$$;

create function pg_temp.claim_synthetic_homework_notifications(stage_name text, claim_limit integer)
returns table (notification_id uuid, claim_token uuid, manual_recovery boolean)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query select * from public.claim_due_homework_completion_notifications(claim_limit);
exception when unique_violation then
  raise exception 'Synthetic worker-claim stage % hit a duplicate attempt sequence: %', stage_name, sqlerrm;
end;
$$;

create function pg_temp.make_synthetic_homework_notification_due(target_notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.homework_completion_notifications
  set next_attempt_at = clock_timestamp()
  where id = target_notification_id and status = 'pending';
$$;

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
    'progress_b',(select id from public.homework_participant_progress where assignment_revision_id=revision_id and profile_id=(ctx->>'b')::uuid),
    'homework_assignment',assignment_id);
  perform set_config('paired_response_test.ctx', ctx::text, true);
end;
$authorize_and_assign$;

reset role;

do $link_case_session$
declare
  ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
  case_session_id uuid;
begin
  insert into public.case_sessions(counseling_case_id, session_id, actual_sequence, template_sequence_number,
    title, homework_assignment_revision_id, material_released_at, homework_released_at, activated_at, activated_by)
  values ((ctx->>'case')::uuid, (ctx->>'session')::uuid, 1, 1, 'Paired response rollback session',
    (select id from public.homework_assignment_revisions where homework_assignment_id=
      (select id from public.homework_assignments where homework_id=(ctx->>'homework')::uuid and counseling_case_id=(ctx->>'case')::uuid and unassigned_at is null)
      and ended_at is null), now(), now(), now(), (ctx->>'admin')::uuid)
  returning id into case_session_id;
  ctx := ctx || jsonb_build_object('case_session', case_session_id);
  perform set_config('paired_response_test.ctx', ctx::text, true);
  assert exists (
    select 1
    from public.homework_participant_progress progress
    join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
    join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
    join public.case_sessions session on session.homework_assignment_revision_id = revision.id
      and session.counseling_case_id = assignment.counseling_case_id
    where progress.profile_id = (ctx->>'a')::uuid
      and assignment.homework_id = (ctx->>'homework')::uuid
      and session.session_id = (ctx->>'session')::uuid
  ), 'Synthetic submission fixture is not linked to its current Homework revision and Session';
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
  notification_count integer;
  rejected boolean;
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
  perform set_config('request.jwt.claim.sub', ctx->>'admin', true);
  assert not exists (select 1 from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid),
    'A notification was queued before both partners submitted';
  perform set_config('request.jwt.claim.sub', b::text, true);
  assert auth.uid() = b, 'Synthetic partner B JWT claim was not active for the submission RPC';
  assert public.persist_participant_homework(pb, payload, 'submit') = 'submitted', 'Partner B could not submit independently';
  rejected := false;
  begin
    perform public.persist_participant_homework(pb, payload, 'submit');
  exception when others then
    get stacked diagnostics err = message_text;
    if err = 'Submitted answers are read-only' then rejected := true; else raise; end if;
  end;
  assert rejected, 'Duplicate submission was not rejected';
  perform set_config('request.jwt.claim.sub', ctx->>'admin', true);
  assert (select count(*)=1 from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1 and status='pending'),
    'Exactly one initial completion cycle was not queued';
  assert (select cardinality(recipient_profile_ids)=2 and provider_idempotency_key='homework-completion-cycle/' || id::text
    from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1),
    'Recipient snapshot or stable provider idempotency key is invalid';
  perform set_config('request.jwt.claim.sub', a::text, true);
  assert not exists (select 1 from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid),
    'Couple participant can read private notification records';
  begin
    perform * from public.claim_due_homework_completion_notifications(1);
    raise exception 'Expected authenticated worker-claim denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reconcile_homework_completion_notification_attempt(
      gen_random_uuid(), 'accepted', 'synthetic-message', 'synthetic-provider-event', null
    );
    raise exception 'Expected authenticated provider reconciliation denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.authorize_homework_completion_notification_delivery(gen_random_uuid(), gen_random_uuid());
    raise exception 'Expected authenticated provider-start denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.finish_homework_completion_notification_attempt(
      gen_random_uuid(), gen_random_uuid(), 'accepted', 'synthetic-message', null
    );
    raise exception 'Expected authenticated provider-finalization denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.homework_completion_notification_payloads limit 1;
    raise exception 'authenticated unexpectedly read private payload storage directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.homework_completion_notification_attempts limit 1;
    raise exception 'authenticated unexpectedly read private attempt storage directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.homework_completion_notification_provider_evidence limit 1;
    raise exception 'authenticated unexpectedly read private evidence storage directly';
  exception when insufficient_privilege then null;
  end;
  rejected := false;
  begin
    perform public.request_homework_completion_notification_recovery(
      (select id from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid));
  exception when others then
    get stacked diagnostics err = message_text;
    if err = 'Not authorized' then rejected := true; else raise; end if;
  end;
  assert rejected, 'Couple participant could request notification recovery';
  perform set_config('request.jwt.claim.sub', ctx->>'admin', true);
  select count(*) into notification_count from public.homework_completion_notifications
  where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1;
  assert notification_count=1, 'Admin cannot read the durable notification record';
  assert not public.request_homework_completion_notification_recovery(
    (select id from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid)),
    'Pending notification must not allow manual recovery';
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
  perform set_config('request.jwt.claim.sub', ctx->>'admin', true);
  assert (select status='cancelled' and status_code='homework_reopened' from public.homework_completion_notifications
    where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1),
    format('Reopening did not cancel the unsent completion cycle (status=%s, code=%s)',
      (select status from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1),
      (select status_code from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1));
  assert (select status='in_progress' and submitted_at is null from public.homework_participant_progress where id=pa), 'Reopen did not reset submission state';
  perform set_config('request.jwt.claim.sub', ctx->>'counselor', true);
  assert public.get_counselor_submitted_homework_review(pb) is not null,
    'Reopening one partner incorrectly hid the other partner submitted response from assigned Counselor';
  perform set_config('request.jwt.claim.sub', a::text, true);
  assert (select answer_text::jsonb ? 'rows' and answer_text like '%line one%' from public.homework_answers where participant_progress_id=pa and homework_version_block_id=left_block), 'Reopen discarded existing paired responses';
  resubmission := jsonb_set(payload, array[left_block::text], to_jsonb(jsonb_build_object('version',1,'rows',jsonb_build_array(
    jsonb_build_object('id',ctx->>'id1','value','Revised after reopen'), jsonb_build_object('id',ctx->>'id2','value','left two')) )::text));
  assert public.persist_participant_homework(pa, resubmission, 'submit') = 'submitted', 'Participant could not edit and resubmit reopened paired responses';
  perform set_config('request.jwt.claim.sub', ctx->>'admin', true);
  assert (select count(*)=2 from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid),
    'Resubmission did not preserve the original cycle and create a new cycle';
  assert (select status='pending' from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=2),
    'Resubmission did not queue the next completion cycle';
  perform set_config('request.jwt.claim.sub', a::text, true);
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
end;
$participant_checks$;

reset role;

do $prepare_notification_worker_fixture$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  ctx := ctx || jsonb_build_object('cycle_2_notification', (
    select id from public.homework_completion_notifications
    where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=2
  ));
  perform set_config('paired_response_test.ctx',ctx::text,true);
end;
$prepare_notification_worker_fixture$;

set local role service_role;
do $claim_and_start$
declare
  ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
  claimed record;
  started jsonb;
  frozen jsonb;
  replay jsonb;
  prepared_at timestamptz;
  first_started timestamptz;
  retry_cutoff timestamptz;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select * into claimed from pg_temp.claim_synthetic_homework_notifications('initial completion cycle',10)
  where notification_id=(ctx->>'cycle_2_notification')::uuid;
  assert claimed.notification_id is not null, 'Due synthetic cycle could not be claimed';
  frozen:=pg_temp.prepare_synthetic_homework_notification_payload(claimed.notification_id,claimed.claim_token);
  prepared_at:=clock_timestamp();
  assert frozen->>'cutoffAt' is null and frozen->>'firstProviderStartedAt' is null,
    'Payload preparation incorrectly started the provider idempotency window';
  perform pg_sleep(0.05);
  replay:=public.prepare_homework_completion_notification_payload(
    claimed.notification_id,claimed.claim_token,
    jsonb_set(frozen->'payload','{subject}','"Changed retry subject"'::jsonb)
  );
  assert replay->'payload'=frozen->'payload' and replay->>'idempotencyKey'=frozen->>'idempotencyKey',
    'Retry payload was reconstructed or changed under the same idempotency key';
  started:=public.authorize_homework_completion_notification_delivery(claimed.notification_id,claimed.claim_token);
  assert started is not null and started->>'attemptId' is not null
    and started->'providerPayload'=frozen->'payload', 'Valid lease did not start using its frozen payload';
  select (payload->>'firstProviderStartedAt')::timestamptz,
    (payload->>'idempotencyCutoffAt')::timestamptz
  into first_started,retry_cutoff
  from (select pg_temp.inspect_synthetic_homework_notification_payload(claimed.notification_id) payload) inspected;
  assert first_started > prepared_at and retry_cutoff=first_started+interval '23 hours'
    and (started->>'firstProviderStartedAt')::timestamptz=first_started
    and (started->>'idempotencyCutoffAt')::timestamptz=retry_cutoff,
    'The immutable 23-hour cutoff was not anchored to first durable provider start';
  assert pg_temp.attempt_synthetic_homework_payload_cutoff_mutation(claimed.notification_id)
    like '%payload identity is immutable%', 'Provider cutoff was not immutable';
  begin
    perform 1 from public.homework_completion_notification_payloads limit 1;
    raise exception 'service_role unexpectedly read private payload storage directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.homework_completion_notification_attempts limit 1;
    raise exception 'service_role unexpectedly read private attempt storage directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.homework_completion_notification_provider_evidence limit 1;
    raise exception 'service_role unexpectedly read private evidence storage directly';
  exception when insufficient_privilege then null;
  end;
  ctx:=ctx||jsonb_build_object('inflight_notification',claimed.notification_id,
    'inflight_token',claimed.claim_token,'inflight_attempt',started->>'attemptId');
  perform set_config('paired_response_test.ctx',ctx::text,true);
end;
$claim_and_start$;
reset role;

do $cancel_inflight$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  update public.groups set active=false where id=(ctx->>'counselor_group')::uuid;
  assert (select status='cancelled' from public.homework_completion_notifications where id=(ctx->>'inflight_notification')::uuid),
    'Eligibility loss did not terminally cancel the parent notification';
  assert (select status='started' and cancellation_requested_at is not null
    from public.homework_completion_notification_attempts where id=(ctx->>'inflight_attempt')::uuid),
    'Cancellation erased the in-flight attempt outcome record';
end;
$cancel_inflight$;

set local role service_role;
do $reconcile_canceled_delivery$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb; result text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  assert public.finish_homework_completion_notification_attempt(
    (ctx->>'inflight_notification')::uuid,(ctx->>'inflight_token')::uuid,'accepted','synthetic-message',null
  ) is null, 'Worker finalized a canceled provider attempt';
  result:=public.reconcile_homework_completion_notification_attempt(
    (ctx->>'inflight_attempt')::uuid,'accepted','synthetic-message','synthetic-provider-event',null
  );
  assert result='cancelled', 'Reconciliation changed the terminal parent state';
  assert public.reconcile_homework_completion_notification_attempt(
    (ctx->>'inflight_attempt')::uuid,'accepted','synthetic-message','synthetic-provider-event',null
  )='cancelled', 'Identical provider evidence replay was not an idempotent no-op';
  begin
    perform public.reconcile_homework_completion_notification_attempt(
      (ctx->>'inflight_attempt')::uuid,'delivered','synthetic-message','synthetic-provider-event',null
    );
    raise exception 'Conflicting provider evidence replay was accepted';
  exception when others then
    if sqlerrm not like '%Conflicting provider evidence replay%' then raise; end if;
  end;
  begin
    perform public.reconcile_homework_completion_notification_attempt(
      (ctx->>'inflight_attempt')::uuid,'delivered','   ',null,null
    );
    raise exception 'Blank provider evidence identifier was accepted';
  exception when others then
    if sqlerrm not like '%Provider message ID is invalid%' then raise; end if;
  end;
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('late_cancelled_result',result))::text,true);
end;
$reconcile_canceled_delivery$;
reset role;

do $assert_reconciled_cancellation$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  assert ctx->>'late_cancelled_result'='cancelled', 'Canceled parent outcome was not returned';
  assert (select status='cancelled' from public.homework_completion_notifications where id=(ctx->>'inflight_notification')::uuid),
    'Accepted late outcome restored canceled delivery eligibility';
  assert (select status='accepted' and provider_message_id='synthetic-message'
    from public.homework_completion_notification_attempts where id=(ctx->>'inflight_attempt')::uuid),
    'Late accepted provider outcome was not preserved independently';
end;
$assert_reconciled_cancellation$;

do $seed_recovery_cases$
declare
  ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
  old_profiles uuid[];
  current_profiles uuid[];
  fixture record;
  notification_id uuid;
  token uuid;
  expired_id uuid:=gen_random_uuid();
  expired_token uuid:=gen_random_uuid();
  expired_started_attempt_id uuid;
begin
  update public.case_assignments set assigned_group_id=(ctx->>'unassigned_group')::uuid
  where id=(ctx->>'case_assignment')::uuid;
  select coalesce(array_agg(member.profile_id order by member.profile_id),'{}'::uuid[]) into old_profiles
  from public.group_members member where member.group_id=(ctx->>'counselor_group')::uuid and member.ended_at is null;
  select coalesce(array_agg(member.profile_id order by member.profile_id),'{}'::uuid[]) into current_profiles
  from public.group_members member where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null;
  for fixture in select * from (values
    (3,'failed','rejected_permanent'),
    (4,'uncertain','uncertain'),
    (5,'sent','accepted'),
    (6,'delivered','delivered'),
    (7,'cancelled','rejected_permanent'),
    (8,'failed','rejected_permanent'),
    (9,'failed','bounced')
  ) as cases(cycle,parent_status,attempt_status)
  loop
    notification_id:=gen_random_uuid(); token:=gen_random_uuid();
    insert into public.homework_completion_notifications(
      id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
      partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
      status,attempt_count,claim_sequence,provider_idempotency_key
    ) values (
      notification_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,
      (select revision.id from public.homework_assignment_revisions revision
        join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
        where assignment.homework_id=(ctx->>'homework')::uuid and assignment.counseling_case_id=(ctx->>'case')::uuid
          and assignment.unassigned_at is null and revision.ended_at is null),
      fixture.cycle,array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],
      (ctx->>'case_assignment')::uuid,(ctx->>'counselor_group')::uuid,old_profiles,
      fixture.parent_status,1,1,'verifier/homework-cycle/'||notification_id::text
    );
    insert into public.homework_completion_notification_attempts(
      notification_id,claim_sequence,attempt_number,is_manual_recovery,claim_token,lease_expires_at,
      recipient_assignment_id,recipient_group_id,recipient_profile_ids,provider_idempotency_key,
      status,started_at,completed_at,provider_message_id
    ) values (
      notification_id,1,1,false,token,clock_timestamp()-interval '1 minute',
      (ctx->>'case_assignment')::uuid,(ctx->>'counselor_group')::uuid,old_profiles,
      'verifier/homework-cycle/'||notification_id::text,fixture.attempt_status,
      clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',
      case when fixture.attempt_status in ('accepted','delivered') then 'synthetic-message-'||fixture.cycle::text else null end
    );
    ctx:=ctx||jsonb_build_object('cycle_'||fixture.cycle::text,notification_id);
  end loop;
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,claim_sequence,claim_token,lease_expires_at,provider_idempotency_key
  ) values (
    expired_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,
    (select revision.id from public.homework_assignment_revisions revision
      join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
      where assignment.homework_id=(ctx->>'homework')::uuid and assignment.counseling_case_id=(ctx->>'case')::uuid
        and assignment.unassigned_at is null and revision.ended_at is null),
    10,array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],(ctx->>'case_assignment')::uuid,
    (ctx->>'unassigned_group')::uuid,current_profiles,'claimed',1,expired_token,clock_timestamp()-interval '1 minute',
    'verifier/homework-cycle/'||expired_id::text
  );
  insert into public.homework_completion_notification_attempts(
    notification_id,claim_sequence,is_manual_recovery,claim_token,lease_expires_at,
    recipient_assignment_id,recipient_group_id,recipient_profile_ids,provider_idempotency_key,status
  ) values (
    expired_id,1,false,expired_token,clock_timestamp()-interval '1 minute',(ctx->>'case_assignment')::uuid,
    (ctx->>'unassigned_group')::uuid,current_profiles,'verifier/homework-cycle/'||expired_id::text,'claimed'
  );
  notification_id:=gen_random_uuid(); token:=gen_random_uuid();
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,attempt_count,claim_sequence,claim_token,lease_expires_at,provider_idempotency_key
  ) values (
    notification_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,
    (select revision.id from public.homework_assignment_revisions revision
      join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
      where assignment.homework_id=(ctx->>'homework')::uuid and assignment.counseling_case_id=(ctx->>'case')::uuid
        and assignment.unassigned_at is null and revision.ended_at is null),
    11,array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],(ctx->>'case_assignment')::uuid,
    (ctx->>'unassigned_group')::uuid,current_profiles,'claimed',1,1,token,clock_timestamp()-interval '1 minute',
    'verifier/homework-cycle/'||notification_id::text
  );
  insert into public.homework_completion_notification_attempts(
    notification_id,claim_sequence,attempt_number,is_manual_recovery,claim_token,lease_expires_at,
    recipient_assignment_id,recipient_group_id,recipient_profile_ids,provider_idempotency_key,
    status,started_at
  ) values (
    notification_id,1,1,false,token,clock_timestamp()-interval '1 minute',(ctx->>'case_assignment')::uuid,
    (ctx->>'unassigned_group')::uuid,current_profiles,'verifier/homework-cycle/'||notification_id::text,
    'started',clock_timestamp()-interval '2 minutes'
  ) returning id into expired_started_attempt_id;
  ctx:=ctx||jsonb_build_object('expired_started_notification',notification_id,'expired_started_token',token,
    'expired_started_attempt',expired_started_attempt_id);
  ctx:=ctx||jsonb_build_object('expired_notification',expired_id,'expired_token',expired_token);
  perform set_config('paired_response_test.ctx',ctx::text,true);
end;
$seed_recovery_cases$;

set local role service_role;
do $expired_claim_recovery$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  reclaimed record;
  result text;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  assert public.authorize_homework_completion_notification_delivery(
    (ctx->>'expired_notification')::uuid,(ctx->>'expired_token')::uuid
  ) is null, 'Expired unstarted lease authorized provider start';
  select * into reclaimed from pg_temp.claim_synthetic_homework_notifications('expired lease recovery',10)
  where notification_id=(ctx->>'expired_notification')::uuid;
  assert reclaimed.notification_id is not null and reclaimed.claim_token<>(ctx->>'expired_token')::uuid,
    'Definitely unstarted claim was not safely reclaimed with a fresh token';
  assert public.finish_homework_completion_notification_attempt(
    (ctx->>'expired_started_notification')::uuid,(ctx->>'expired_started_token')::uuid,'accepted','late-message',null
  ) is null, 'Expired worker finalized its stale claim';
  result:=public.reconcile_homework_completion_notification_attempt(
    (ctx->>'expired_started_attempt')::uuid,
    'accepted','late-message','late-provider-event',null
  );
  assert result='sent', 'Restricted reconciliation did not preserve a late accepted provider outcome';
  result:=public.reconcile_homework_completion_notification_attempt(
    (ctx->>'expired_started_attempt')::uuid,
    'delivered','late-message','late-provider-delivered-event',null
  );
  assert result='delivered', 'A distinct verified delivery event did not advance accepted notification state';
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('expired_reclaimed_token',reclaimed.claim_token,'expired_late_result',result))::text,true);
end;
$expired_claim_recovery$;
reset role;

do $assert_expired_lease_recovery$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select status='expired_before_start' from public.homework_completion_notification_attempts
    where notification_id=(ctx->>'expired_notification')::uuid and claim_token=(ctx->>'expired_token')::uuid),
    'Expired unstarted claim was not recorded';
  assert (select status='claimed' and attempt_count=0 and claim_sequence=2 and claim_token=(ctx->>'expired_reclaimed_token')::uuid
    from public.homework_completion_notifications where id=(ctx->>'expired_notification')::uuid),
    'Reclaimed unstarted lease incorrectly consumed a provider attempt or did not rotate its token';
  assert (select status='delivered' from public.homework_completion_notifications
    where id=(ctx->>'expired_started_notification')::uuid), 'Late accepted evidence was not reconciled';
  assert (select status='delivered' and provider_message_id='late-message'
    from public.homework_completion_notification_attempts where id=(ctx->>'expired_started_attempt')::uuid),
    'Distinct accepted-to-delivered evidence was not retained on the expired worker attempt';
end;
$assert_expired_lease_recovery$;

do $seed_full_retry_fixture$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid:=gen_random_uuid();
begin
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,next_attempt_at,provider_idempotency_key
  ) values (
    target_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,
    (select revision.id from public.homework_assignment_revisions revision
      join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
      where assignment.homework_id=(ctx->>'homework')::uuid and assignment.counseling_case_id=(ctx->>'case')::uuid
        and assignment.unassigned_at is null and revision.ended_at is null),
    13,array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],(ctx->>'case_assignment')::uuid,
    (ctx->>'unassigned_group')::uuid,
    (select array_agg(member.profile_id order by member.profile_id) from public.group_members member
      where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null),
    'pending',clock_timestamp(),'verifier/homework-cycle/'||target_id::text
  );
  perform set_config('paired_response_test.ctx',(ctx||jsonb_build_object('retry_notification',target_id))::text,true);
end;
$seed_full_retry_fixture$;

set local role service_role;
do $full_retry_schedule$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  claimed record;
  frozen jsonb;
  prepared jsonb;
  started jsonb;
  result text;
  expected_delay interval;
  attempt_index integer;
  observed_due timestamptz;
  observed_notification jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  for attempt_index in 1..5 loop
    if attempt_index > 1 then perform pg_temp.make_synthetic_homework_notification_due((ctx->>'retry_notification')::uuid); end if;
    select * into claimed from pg_temp.claim_synthetic_homework_notifications('automatic retry schedule',1)
    where notification_id=(ctx->>'retry_notification')::uuid;
    assert claimed.notification_id is not null, 'Scheduled synthetic retry was not claimable';
    prepared:=pg_temp.prepare_synthetic_homework_notification_payload(claimed.notification_id,claimed.claim_token);
    if frozen is null then frozen:=prepared;
    else assert prepared->'payload'=frozen->'payload' and prepared->>'idempotencyKey'=frozen->>'idempotencyKey',
      'Automatic retries changed the canonical payload or provider idempotency key';
    end if;
    started:=public.authorize_homework_completion_notification_delivery(claimed.notification_id,claimed.claim_token);
    assert started->'providerPayload'=frozen->'payload' and started->>'attemptNumber'=attempt_index::text,
      'Provider start did not use the canonical payload or expected attempt number';
    if attempt_index < 5 then
      result:=public.finish_homework_completion_notification_attempt(
        claimed.notification_id,claimed.claim_token,'rejected_retryable',null,'synthetic_transient'
      );
      expected_delay:=case attempt_index
        when 1 then interval '5 minutes' when 2 then interval '15 minutes'
        when 3 then interval '1 hour' else interval '6 hours' end;
      observed_notification:=pg_temp.inspect_synthetic_homework_notification(claimed.notification_id);
      observed_due:=(observed_notification->>'nextAttemptAt')::timestamptz;
      assert result='pending' and observed_due between clock_timestamp()+expected_delay-interval '2 seconds'
        and clock_timestamp()+expected_delay+interval '2 seconds',
        'Automatic retry delay did not match the approved schedule';
    else
      result:=public.finish_homework_completion_notification_attempt(
        claimed.notification_id,claimed.claim_token,'rejected_retryable',null,'synthetic_transient'
      );
      assert result='failed', 'Fifth provider rejection did not exhaust automatic retries';
    end if;
  end loop;
  perform set_config('paired_response_test.ctx',(ctx||jsonb_build_object('retry_payload',frozen))::text,true);
end;
$full_retry_schedule$;
reset role;

do $assert_full_retry_schedule$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select status='failed' and attempt_count=5 and next_attempt_at is null
    from public.homework_completion_notifications where id=(ctx->>'retry_notification')::uuid),
    'Automatic retry limit did not stop after five provider attempts';
  assert (select count(*)=5 and bool_and(status='rejected_retryable') and count(distinct provider_idempotency_key)=1
    from public.homework_completion_notification_attempts where notification_id=(ctx->>'retry_notification')::uuid),
    'Retry attempt history or stable idempotency key was not preserved';
end;
$assert_full_retry_schedule$;

do $seed_reconciled_retry_fixture$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid:=gen_random_uuid();
  target_revision uuid;
begin
  select revision.id into target_revision
  from public.homework_assignment_revisions revision
  join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
  where assignment.homework_id=(ctx->>'homework')::uuid
    and assignment.counseling_case_id=(ctx->>'case')::uuid
    and assignment.unassigned_at is null and revision.ended_at is null;
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,next_attempt_at,provider_idempotency_key
  ) values (
    target_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,target_revision,14,
    array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,
    (select array_agg(member.profile_id order by member.profile_id) from public.group_members member
      where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null),
    'pending',clock_timestamp(),'verifier/homework-cycle/'||target_id::text
  );
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('reconciled_retry_notification',target_id))::text,true);
end;
$seed_reconciled_retry_fixture$;

set local role service_role;
do $reconcile_transient_rejection_and_resume$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid:=(ctx->>'reconciled_retry_notification')::uuid;
  claimed record;
  notification_state jsonb;
  prepared jsonb;
  first_started jsonb;
  replayed text;
  retry_due timestamptz;
  first_payload jsonb;
  retry_prepared jsonb;
  second_started jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select * into claimed from pg_temp.claim_synthetic_homework_notifications('transient rejection reconciliation',10)
  where notification_id=target_id;
  assert claimed.notification_id is not null, 'Reconciliation retry fixture was not claimed';
  prepared:=pg_temp.prepare_synthetic_homework_notification_payload(target_id,claimed.claim_token);
  first_payload:=prepared->'payload';
  first_started:=public.authorize_homework_completion_notification_delivery(target_id,claimed.claim_token);
  assert first_started is not null and first_started->>'attemptNumber'='1',
    'Initial attempt for reconciliation retry did not start';
  replayed:=public.reconcile_homework_completion_notification_attempt(
    (first_started->>'attemptId')::uuid,'rejected_retryable','synthetic-retry-message','synthetic-retry-event','synthetic_transient'
  );
  assert public.reconcile_homework_completion_notification_attempt(
    (first_started->>'attemptId')::uuid,'rejected_retryable','synthetic-retry-message','synthetic-retry-event','synthetic_transient'
  )='pending', 'Identical transient-rejection evidence replay was not idempotent';
  begin
    perform public.reconcile_homework_completion_notification_attempt(
      (first_started->>'attemptId')::uuid,'accepted','synthetic-retry-message','synthetic-retry-event',null
    );
    raise exception 'Expected conflicting rejection-evidence replay denial';
  exception when others then
    if sqlerrm not like '%Conflicting provider evidence replay%' then raise; end if;
  end;
  notification_state:=pg_temp.inspect_synthetic_homework_notification(target_id);
  replayed:=notification_state->>'status';
  retry_due:=(notification_state->>'nextAttemptAt')::timestamptz;
  assert replayed='pending' and retry_due between clock_timestamp()+interval '5 minutes'-interval '2 seconds'
    and clock_timestamp()+interval '5 minutes'+interval '2 seconds',
    'Verified transient rejection did not resume the first approved retry delay';
  assert (notification_state->>'attemptCount')::integer=1
    and notification_state->>'providerIdempotencyKey'=first_started->>'idempotencyKey',
    'Reconciliation changed the automatic attempt counter or provider key';
  perform pg_temp.make_synthetic_homework_notification_due(target_id);
  select * into claimed from pg_temp.claim_synthetic_homework_notifications('transient rejection resumed retry',10)
  where notification_id=target_id;
  assert claimed.notification_id is not null, 'Reconciled retry did not become claimable when due';
  retry_prepared:=pg_temp.prepare_synthetic_homework_notification_payload(target_id,claimed.claim_token);
  assert retry_prepared->'payload'=first_payload
    and retry_prepared->>'idempotencyKey'=first_started->>'idempotencyKey'
    and retry_prepared->>'firstProviderStartedAt'=first_started->>'firstProviderStartedAt'
    and retry_prepared->>'cutoffAt'=first_started->>'idempotencyCutoffAt',
    'Reconciled retry changed payload/key or reset its immutable cutoff';
  second_started:=public.authorize_homework_completion_notification_delivery(target_id,claimed.claim_token);
  assert second_started is not null and second_started->>'attemptNumber'='2'
    and second_started->'providerPayload'=first_payload
    and second_started->>'idempotencyKey'=first_started->>'idempotencyKey',
    'Reconciled retry did not preserve the payload/key and advance the attempt number';
  assert public.finish_homework_completion_notification_attempt(
    target_id,claimed.claim_token,'accepted','synthetic-retry-accepted',null
  )='sent', 'Resumed retry could not finalize normally';
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('reconciled_retry_attempt',first_started->>'attemptId'))::text,true);
end;
$reconcile_transient_rejection_and_resume$;
reset role;

do $assert_reconciled_retry_history$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select status='rejected_retryable' and attempt_number=1
    from public.homework_completion_notification_attempts where id=(ctx->>'reconciled_retry_attempt')::uuid),
    'Reconciled provider rejection was not preserved as attempt history';
  assert (select status='sent' and attempt_count=2 and next_attempt_at is null
    from public.homework_completion_notifications where id=(ctx->>'reconciled_retry_notification')::uuid),
    'Resumed transient retry did not preserve parent state and counters';
end;
$assert_reconciled_retry_history$;

do $seed_expired_provider_cutoff$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid:=gen_random_uuid();
  target_key text:='verifier/homework-cycle/'||target_id::text;
  target_revision uuid;
  target_profile_ids uuid[];
  first_started timestamptz:=clock_timestamp()-interval '24 hours';
  provider_payload jsonb;
begin
  select revision.id into target_revision
  from public.homework_assignment_revisions revision
  join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
  where assignment.homework_id=(ctx->>'homework')::uuid
    and assignment.counseling_case_id=(ctx->>'case')::uuid
    and assignment.unassigned_at is null and revision.ended_at is null;
  select array_agg(member.profile_id order by member.profile_id) into target_profile_ids
  from public.group_members member where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null;
  select jsonb_build_object(
    'to',jsonb_agg(to_jsonb(lower(btrim(profile.email))) order by profile.id),
    'from','Resonate <noreply@example.invalid>','subject','Synthetic Homework ready',
    'html','<p>Synthetic notification without answers.</p>',
    'text','Synthetic notification without answers.'
  ) into provider_payload
  from public.profiles profile where profile.id=any(target_profile_ids);
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,attempt_count,claim_sequence,next_attempt_at,provider_idempotency_key
  ) values (
    target_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,target_revision,15,
    array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,target_profile_ids,
    'pending',1,1,clock_timestamp(),target_key
  );
  insert into public.homework_completion_notification_attempts(
    notification_id,claim_sequence,attempt_number,is_manual_recovery,claim_token,lease_expires_at,
    recipient_assignment_id,recipient_group_id,recipient_profile_ids,provider_idempotency_key,
    status,started_at,completed_at,error_category
  ) values (
    target_id,1,1,false,gen_random_uuid(),clock_timestamp()-interval '23 hours',
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,target_profile_ids,target_key,
    'rejected_retryable',first_started,clock_timestamp()-interval '23 hours','synthetic_transient'
  );
  insert into public.homework_completion_notification_payloads(
    notification_id,payload_kind,provider_idempotency_key,provider_payload,
    first_provider_started_at,idempotency_cutoff_at,created_at
  ) values (target_id,'automatic',target_key,provider_payload,first_started,
    first_started+interval '23 hours',first_started-interval '1 hour');
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('expired_cutoff_notification',target_id))::text,true);
end;
$seed_expired_provider_cutoff$;

set local role service_role;
do $expired_provider_cutoff_blocks_start$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid:=(ctx->>'expired_cutoff_notification')::uuid;
  claimed record;
  frozen jsonb;
  started jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select * into claimed from pg_temp.claim_synthetic_homework_notifications('expired provider cutoff',10)
  where notification_id=target_id;
  assert claimed.notification_id is not null, 'Expired-cutoff fixture was not claimed';
  frozen:=pg_temp.prepare_synthetic_homework_notification_payload(target_id,claimed.claim_token);
  assert frozen is not null and frozen->>'cutoffAt' is not null,
    'Preparation should return the expired persisted cutoff without resetting it';
  started:=public.authorize_homework_completion_notification_delivery(target_id,claimed.claim_token);
  assert started is null, 'Provider start was authorized after its immutable cutoff';
  assert pg_temp.inspect_synthetic_homework_notification(target_id)->>'status'='failed'
    and (pg_temp.inspect_synthetic_homework_notification(target_id)->>'attemptCount')::integer=1
    and pg_temp.inspect_synthetic_homework_notification(target_id)->>'nextAttemptAt' is null,
    'Expired idempotency window did not fail without consuming another provider attempt';
  assert pg_temp.inspect_synthetic_homework_attempt_sequence(target_id,2)->>'status'='expired_before_start'
    and pg_temp.inspect_synthetic_homework_attempt_sequence(target_id,2)->>'attemptNumber' is null,
    'Expired retry claim was not retained as a non-started attempt';
end;
$expired_provider_cutoff_blocks_start$;
reset role;

do $seed_retry_rejection_past_cutoff$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid:=gen_random_uuid();
  target_key text:='verifier/homework-cycle/'||target_id::text;
  target_revision uuid;
  target_profile_ids uuid[];
  first_started timestamptz:=clock_timestamp()-interval '22 hours 56 minutes';
  provider_payload jsonb;
begin
  select revision.id into target_revision
  from public.homework_assignment_revisions revision
  join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
  where assignment.homework_id=(ctx->>'homework')::uuid
    and assignment.counseling_case_id=(ctx->>'case')::uuid
    and assignment.unassigned_at is null and revision.ended_at is null;
  select array_agg(member.profile_id order by member.profile_id) into target_profile_ids
  from public.group_members member where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null;
  select jsonb_build_object(
    'to',jsonb_agg(to_jsonb(lower(btrim(profile.email))) order by profile.id),
    'from','Resonate <noreply@example.invalid>','subject','Synthetic Homework ready',
    'html','<p>Synthetic notification without answers.</p>',
    'text','Synthetic notification without answers.'
  ) into provider_payload
  from public.profiles profile where profile.id=any(target_profile_ids);
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,attempt_count,claim_sequence,provider_idempotency_key
  ) values (
    target_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,target_revision,18,
    array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,target_profile_ids,
    'uncertain',1,1,target_key
  );
  insert into public.homework_completion_notification_attempts(
    notification_id,claim_sequence,attempt_number,is_manual_recovery,claim_token,lease_expires_at,
    recipient_assignment_id,recipient_group_id,recipient_profile_ids,provider_idempotency_key,
    status,started_at,completed_at,error_category
  ) values (
    target_id,1,1,false,gen_random_uuid(),clock_timestamp()-interval '1 minute',
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,target_profile_ids,target_key,
    'uncertain',first_started,clock_timestamp()-interval '1 minute','synthetic_uncertain'
  );
  insert into public.homework_completion_notification_payloads(
    notification_id,payload_kind,provider_idempotency_key,provider_payload,
    first_provider_started_at,idempotency_cutoff_at
  ) values (target_id,'automatic',target_key,provider_payload,first_started,first_started+interval '23 hours');
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('near_cutoff_notification',target_id,
      'near_cutoff_attempt',(select id from public.homework_completion_notification_attempts where notification_id=target_id)))::text,true);
end;
$seed_retry_rejection_past_cutoff$;

set local role service_role;
do $retry_rejection_past_cutoff_fails$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb; result text;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  result:=public.reconcile_homework_completion_notification_attempt(
    (ctx->>'near_cutoff_attempt')::uuid,'rejected_retryable',
    'synthetic-cutoff-message','synthetic-cutoff-rejection-event','synthetic_transient'
  );
  assert result='failed'
    and pg_temp.inspect_synthetic_homework_notification((ctx->>'near_cutoff_notification')::uuid)->>'status'='failed'
    and pg_temp.inspect_synthetic_homework_notification((ctx->>'near_cutoff_notification')::uuid)->>'nextAttemptAt' is null
    and pg_temp.inspect_synthetic_homework_notification((ctx->>'near_cutoff_notification')::uuid)->>'statusCode'='provider_idempotency_window_expired',
    'Confirmed transient rejection scheduled a retry beyond the immutable idempotency cutoff';
end;
$retry_rejection_past_cutoff_fails$;
reset role;

do $seed_cancelled_started_rejection$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid:=gen_random_uuid();
  target_token uuid:=gen_random_uuid();
  target_key text:='verifier/homework-cycle/'||target_id::text;
  target_revision uuid;
  target_profile_ids uuid[];
  started_at_value timestamptz:=clock_timestamp()-interval '2 minutes';
  provider_payload jsonb;
begin
  select revision.id into target_revision
  from public.homework_assignment_revisions revision
  join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
  where assignment.homework_id=(ctx->>'homework')::uuid
    and assignment.counseling_case_id=(ctx->>'case')::uuid
    and assignment.unassigned_at is null and revision.ended_at is null;
  select array_agg(member.profile_id order by member.profile_id) into target_profile_ids
  from public.group_members member where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null;
  select jsonb_build_object(
    'to',jsonb_agg(to_jsonb(lower(btrim(profile.email))) order by profile.id),
    'from','Resonate <noreply@example.invalid>','subject','Synthetic Homework ready',
    'html','<p>Synthetic notification without answers.</p>',
    'text','Synthetic notification without answers.'
  ) into provider_payload
  from public.profiles profile where profile.id=any(target_profile_ids);
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,attempt_count,claim_sequence,provider_idempotency_key
  ) values (
    target_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,target_revision,16,
    array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,target_profile_ids,
    'cancelled',1,1,target_key
  );
  insert into public.homework_completion_notification_attempts(
    notification_id,claim_sequence,attempt_number,is_manual_recovery,claim_token,lease_expires_at,
    recipient_assignment_id,recipient_group_id,recipient_profile_ids,provider_idempotency_key,
    status,started_at,cancellation_requested_at
  ) values (
    target_id,1,1,false,target_token,clock_timestamp()-interval '1 minute',
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,target_profile_ids,target_key,
    'started',started_at_value,clock_timestamp()
  );
  insert into public.homework_completion_notification_payloads(
    notification_id,payload_kind,provider_idempotency_key,provider_payload,
    first_provider_started_at,idempotency_cutoff_at
  ) values (target_id,'automatic',target_key,provider_payload,started_at_value,started_at_value+interval '23 hours');
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('cancelled_rejection_notification',target_id,
      'cancelled_rejection_attempt',(select id from public.homework_completion_notification_attempts
        where notification_id=target_id)))::text,true);
end;
$seed_cancelled_started_rejection$;

set local role service_role;
do $rejection_after_cancellation$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb; result text;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  result:=public.reconcile_homework_completion_notification_attempt(
    (ctx->>'cancelled_rejection_attempt')::uuid,'rejected_retryable',
    'synthetic-cancelled-message','synthetic-cancelled-rejection-event','synthetic_transient'
  );
  assert result='cancelled', 'Confirmed rejection restored a canceled notification';
  assert pg_temp.inspect_synthetic_homework_notification((ctx->>'cancelled_rejection_notification')::uuid)->>'status'='cancelled'
    and pg_temp.inspect_synthetic_homework_notification((ctx->>'cancelled_rejection_notification')::uuid)->>'nextAttemptAt' is null,
    'Canceled notification became eligible for another attempt after evidence reconciliation';
end;
$rejection_after_cancellation$;
reset role;

do $seed_pre_delivery_recipient_failure$
declare
  ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid := gen_random_uuid();
  target_revision uuid;
  target_profile uuid;
begin
  select member.profile_id into target_profile from public.group_members member
  where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null
  order by member.profile_id limit 1;
  select revision.id into target_revision
  from public.homework_assignment_revisions revision
  join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
  where assignment.homework_id=(ctx->>'homework')::uuid
    and assignment.counseling_case_id=(ctx->>'case')::uuid
    and assignment.unassigned_at is null and revision.ended_at is null;
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,next_attempt_at,provider_idempotency_key
  ) values (
    target_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,target_revision,12,
    array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,
    (select array_agg(member.profile_id order by member.profile_id) from public.group_members member
      where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null),
    'pending',clock_timestamp(),'verifier/homework-cycle/'||target_id::text
  );
  update public.profiles set email=null where id=target_profile;
  ctx:=ctx||jsonb_build_object('predelivery_notification',target_id,'predelivery_profile',target_profile);
  perform set_config('paired_response_test.ctx',ctx::text,true);
end;
$seed_pre_delivery_recipient_failure$;

set local role service_role;
do $record_pre_delivery_recipient_failure$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb; claimed record;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select * into claimed from pg_temp.claim_synthetic_homework_notifications('pre-delivery recovery',10)
  where notification_id=(ctx->>'predelivery_notification')::uuid;
  assert claimed.notification_id is not null, 'Missing-email cycle could not be claimed for preflight';
  assert public.fail_homework_completion_notification_before_delivery(
    claimed.notification_id,claimed.claim_token,'recipient_email_missing'
  ), 'A verified missing recipient email was not recorded before provider delivery';
end;
$record_pre_delivery_recipient_failure$;
reset role;

do $correct_pre_delivery_recipient$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  update public.profiles set email='paired-response-rollback-'||(ctx->>'predelivery_profile')||'@example.invalid'
  where id=(ctx->>'predelivery_profile')::uuid;
end;
$correct_pre_delivery_recipient$;

set local role authenticated;
do $manual_recovery_eligibility$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb; failure text; target uuid;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'a',true);
  begin
    perform public.request_homework_completion_notification_recovery((ctx->>'cycle_8')::uuid);
    raise exception 'Expected Couple recovery denial';
  exception when others then
    get stacked diagnostics failure=message_text;
    if failure<>'Not authorized' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',ctx->>'admin',true);
  target:=(ctx->>'cycle_3')::uuid;
  assert public.request_homework_completion_notification_recovery(target),
    'Confirmed provider rejection did not allow one recovery reservation';
  assert not public.request_homework_completion_notification_recovery(target),
    'Duplicate request reserved a second manual recovery';
  assert not public.request_homework_completion_notification_recovery((ctx->>'cycle_4')::uuid), 'Uncertain delivery was retryable';
  assert not public.request_homework_completion_notification_recovery((ctx->>'cycle_5')::uuid), 'Accepted delivery was retryable';
  assert not public.request_homework_completion_notification_recovery((ctx->>'cycle_6')::uuid), 'Delivered notification was retryable';
  assert not public.request_homework_completion_notification_recovery((ctx->>'cycle_7')::uuid), 'Canceled notification was retryable';
  assert not public.request_homework_completion_notification_recovery((ctx->>'cycle_9')::uuid), 'Bounced notification was retryable';
  target:=(ctx->>'predelivery_notification')::uuid;
  assert public.request_homework_completion_notification_recovery(target),
    'Corrected missing Counselor email did not permit the approved pre-delivery recovery';
  assert (pg_temp.inspect_synthetic_homework_notification(target)->>'attemptCount')::integer=0
      and pg_temp.inspect_synthetic_homework_notification(target)->>'manualRecoveryUsedAt' is null
      and (pg_temp.inspect_synthetic_homework_notification(target)->>'manualRecoveryPending')::boolean
      and pg_temp.inspect_synthetic_homework_notification(target)->'manualRecoveryRecipientProfileIds' @> to_jsonb(array[(ctx->>'predelivery_profile')::uuid]),
    format('Pre-delivery recovery did not reserve one unconsumed attempt with the corrected recipient: %s',
      pg_temp.inspect_synthetic_homework_notification(target)::text);
end;
$manual_recovery_eligibility$;
reset role;

set local role service_role;
do $pre_delivery_recovery_provider_start$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  claimed record;
  predelivery_claim record;
  cycle3_claim record;
  started jsonb;
  result text;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  for claimed in select * from pg_temp.claim_synthetic_homework_notifications('manual and pre-delivery recovery batch',10) loop
    if claimed.notification_id=(ctx->>'predelivery_notification')::uuid then predelivery_claim:=claimed; end if;
    if claimed.notification_id=(ctx->>'cycle_3')::uuid then cycle3_claim:=claimed; end if;
  end loop;
  assert predelivery_claim.notification_id is not null and predelivery_claim.manual_recovery,
    'Pre-delivery recovery was not queued as one manual attempt';
  assert cycle3_claim.notification_id is not null and cycle3_claim.manual_recovery,
    'Concurrent manual recovery fixture was not claimed with the pre-delivery item';
  perform pg_temp.prepare_synthetic_homework_notification_payload(predelivery_claim.notification_id,predelivery_claim.claim_token);
  started:=public.authorize_homework_completion_notification_delivery(predelivery_claim.notification_id,predelivery_claim.claim_token);
  assert started is not null and started->>'manualRecovery'='true'
    and started->>'attemptNumber'='1', 'Corrected pre-delivery recipient could not start the reserved recovery';
  result:=public.finish_homework_completion_notification_attempt(
    predelivery_claim.notification_id,predelivery_claim.claim_token,'accepted','synthetic-pre-delivery-recovery-message',null
  );
  assert result='sent', 'Pre-delivery manual recovery outcome was not recorded';
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('recovery_claim_token',cycle3_claim.claim_token,
      'recovery_claim_notification',cycle3_claim.notification_id))::text,true);
end;
$pre_delivery_recovery_provider_start$;
reset role;

do $assert_pre_delivery_recovery_accounting$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select status='sent' and attempt_count=1 and manual_recovery_used_at is not null
      and manual_recovery_used_by=(ctx->>'admin')::uuid
    from public.homework_completion_notifications where id=(ctx->>'predelivery_notification')::uuid),
    'Pre-delivery recovery accounting did not consume exactly one attempt at durable start';
  assert (select status='accepted' and attempt_number=1 and started_at is not null
    from public.homework_completion_notification_attempts
    where notification_id=(ctx->>'predelivery_notification')::uuid and is_manual_recovery),
    'Pre-delivery recovery provider attempt history was not preserved';
end;
$assert_pre_delivery_recovery_accounting$;

do $assert_manual_recovery_reservation$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select manual_recovery_pending and manual_recovery_used_at is null and attempt_count=1
      and manual_recovery_reserved_by=(ctx->>'admin')::uuid
      and manual_recovery_recipient_group_id=(ctx->>'unassigned_group')::uuid
      and manual_recovery_idempotency_key=provider_idempotency_key||'/manual-recovery/1'
    from public.homework_completion_notifications where id=(ctx->>'cycle_3')::uuid),
    'Recovery reservation was consumed early or failed to snapshot corrected eligible recipients';
end;
$assert_manual_recovery_reservation$;

set local role service_role;
do $manual_recovery_cancel_before_start$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  assert pg_temp.inspect_synthetic_homework_notification((ctx->>'cycle_3')::uuid)->>'status'='claimed'
    and (pg_temp.inspect_synthetic_homework_notification((ctx->>'cycle_3')::uuid)->>'manualRecoveryPending')::boolean,
    'Reserved manual recovery was not claimable';
end;
$manual_recovery_cancel_before_start$;
reset role;

do $assert_recovery_claim_unconsumed$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select manual_recovery_used_at is null and attempt_count=1
    from public.homework_completion_notifications where id=(ctx->>'recovery_claim_notification')::uuid),
    'Manual recovery was consumed by queueing or claiming';
end;
$assert_recovery_claim_unconsumed$;

do $cancel_reserved_recovery$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  update public.groups set active=false where id=(ctx->>'unassigned_group')::uuid;
  assert (select status='cancelled' and not manual_recovery_pending and manual_recovery_used_at is null
    from public.homework_completion_notifications where id=(ctx->>'cycle_3')::uuid),
    'Cancellation before provider start was not terminal or consumed the recovery';
  assert (select status='cancelled_before_start' and started_at is null
    from public.homework_completion_notification_attempts
    where notification_id=(ctx->>'cycle_3')::uuid and claim_token=(ctx->>'recovery_claim_token')::uuid),
    'Canceled reservation was recorded as a provider attempt';
end;
$cancel_reserved_recovery$;

do $reserve_started_recovery$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  update public.groups set active=true where id=(ctx->>'unassigned_group')::uuid;
  assert public.request_homework_completion_notification_recovery((ctx->>'cycle_8')::uuid),
    'Confirmed failed cycle could not reserve recovery';
end;
$reserve_started_recovery$;

set local role service_role;
do $manual_recovery_provider_start$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb; claimed record; started jsonb; result text;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select * into claimed from pg_temp.claim_synthetic_homework_notifications('recovery attempt canceled before start',10)
  where notification_id=(ctx->>'cycle_8')::uuid;
  assert claimed.notification_id is not null and claimed.manual_recovery, 'Recovery claim did not retain its manual marker';
  perform pg_temp.prepare_synthetic_homework_notification_payload(claimed.notification_id,claimed.claim_token);
  started:=public.authorize_homework_completion_notification_delivery(claimed.notification_id,claimed.claim_token);
  assert started is not null and started->>'manualRecovery'='true', 'Manual provider start failed';
  result:=public.finish_homework_completion_notification_attempt(claimed.notification_id,claimed.claim_token,'accepted','synthetic-recovery-message',null);
  assert result='sent', 'Accepted manual recovery outcome was not persisted';
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('used_recovery_notification',claimed.notification_id,'used_recovery_token',claimed.claim_token))::text,true);
end;
$manual_recovery_provider_start$;
reset role;

do $seed_invalid_email_recovery$
declare
  ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
  target_id uuid:=gen_random_uuid();
  target_revision uuid;
  target_profile uuid;
begin
  select member.profile_id into target_profile
  from public.group_members member
  where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null
  order by member.profile_id limit 1;
  select revision.id into target_revision
  from public.homework_assignment_revisions revision
  join public.homework_assignments assignment on assignment.id=revision.homework_assignment_id
  where assignment.homework_id=(ctx->>'homework')::uuid
    and assignment.counseling_case_id=(ctx->>'case')::uuid
    and assignment.unassigned_at is null and revision.ended_at is null;
  insert into public.homework_completion_notifications(
    id,case_session_id,counseling_case_id,assignment_revision_id,completion_cycle,
    partner_progress_ids,recipient_assignment_id,recipient_group_id,recipient_profile_ids,
    status,next_attempt_at,provider_idempotency_key
  ) values (
    target_id,(ctx->>'case_session')::uuid,(ctx->>'case')::uuid,target_revision,17,
    array[(ctx->>'progress_a')::uuid,(ctx->>'progress_b')::uuid],
    (ctx->>'case_assignment')::uuid,(ctx->>'unassigned_group')::uuid,
    (select array_agg(member.profile_id order by member.profile_id) from public.group_members member
      where member.group_id=(ctx->>'unassigned_group')::uuid and member.ended_at is null),
    'pending',clock_timestamp(),'verifier/homework-cycle/'||target_id::text
  );
  update public.profiles set email='not-an-email' where id=target_profile;
  perform set_config('paired_response_test.ctx',
    (ctx||jsonb_build_object('invalid_email_notification',target_id,'invalid_email_profile',target_profile))::text,true);
end;
$seed_invalid_email_recovery$;

set local role service_role;
do $record_invalid_email_pre_delivery_failure$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb; claimed record;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select * into claimed from pg_temp.claim_synthetic_homework_notifications('invalid-email recovery',10)
  where notification_id=(ctx->>'invalid_email_notification')::uuid;
  assert claimed.notification_id is not null, 'Invalid-email cycle was not claimed';
  assert public.fail_homework_completion_notification_before_delivery(
    claimed.notification_id,claimed.claim_token,'recipient_email_invalid'
  ), 'Verified invalid recipient email was not recorded before delivery';
end;
$record_invalid_email_pre_delivery_failure$;
reset role;

do $correct_invalid_email_and_reserve_recovery$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  update public.profiles set email='paired-response-rollback-'||(ctx->>'invalid_email_profile')||'@example.invalid'
  where id=(ctx->>'invalid_email_profile')::uuid;
end;
$correct_invalid_email_and_reserve_recovery$;

set local role authenticated;
do $authorize_invalid_email_recovery$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'admin',true);
  assert public.request_homework_completion_notification_recovery((ctx->>'invalid_email_notification')::uuid),
    'Corrected invalid Counselor email did not permit the approved pre-delivery recovery';
  assert (select attempt_count=0 and manual_recovery_pending and manual_recovery_used_at is null
    from public.homework_completion_notifications where id=(ctx->>'invalid_email_notification')::uuid),
    'Invalid-email recovery was consumed before a provider start';
end;
$authorize_invalid_email_recovery$;
reset role;

set local role service_role;
do $start_invalid_email_recovery$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb; claimed record; started jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select * into claimed from pg_temp.claim_synthetic_homework_notifications('manual recovery history',10)
  where notification_id=(ctx->>'invalid_email_notification')::uuid;
  assert claimed.notification_id is not null and claimed.manual_recovery,
    'Corrected invalid-email recovery was not queued as the one manual attempt';
  perform pg_temp.prepare_synthetic_homework_notification_payload(claimed.notification_id,claimed.claim_token);
  started:=public.authorize_homework_completion_notification_delivery(claimed.notification_id,claimed.claim_token);
  assert started is not null and started->>'manualRecovery'='true',
    'Corrected invalid-email recovery could not durably start';
  assert public.finish_homework_completion_notification_attempt(
    claimed.notification_id,claimed.claim_token,'accepted','synthetic-invalid-email-recovery',null
  )='sent', 'Invalid-email manual recovery outcome was not recorded';
end;
$start_invalid_email_recovery$;
reset role;

do $assert_invalid_email_recovery_consumed$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select status='sent' and attempt_count=1 and manual_recovery_used_at is not null
    from public.homework_completion_notifications where id=(ctx->>'invalid_email_notification')::uuid),
    'Invalid-email manual attempt was not consumed at durable provider start';
  assert (select status='rejected_before_start' and error_category='recipient_email_invalid'
    from public.homework_completion_notification_attempts
    where notification_id=(ctx->>'invalid_email_notification')::uuid and attempt_number is null),
    'Invalid-email pre-delivery failure history was not preserved';
end;
$assert_invalid_email_recovery_consumed$;

do $assert_manual_recovery_started$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select manual_recovery_used_at is not null and manual_recovery_used_by=(ctx->>'admin')::uuid and attempt_count=2
    from public.homework_completion_notifications where id=(ctx->>'used_recovery_notification')::uuid),
    'Manual attempt was not atomically consumed at provider start';
  assert (select status='accepted' and attempt_number=2
    from public.homework_completion_notification_attempts
    where notification_id=(ctx->>'used_recovery_notification')::uuid and claim_token=(ctx->>'used_recovery_token')::uuid),
    'Manual recovery provider outcome history is incomplete';
end;
$assert_manual_recovery_started$;
set local role authenticated;
do $recovery_not_reusable$
declare ctx jsonb:=current_setting('paired_response_test.ctx')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'admin',true);
  assert not public.request_homework_completion_notification_recovery((ctx->>'cycle_8')::uuid),
    'Consumed recovery was reusable';
end;
$recovery_not_reusable$;
reset role;

do $recipient_loss_check$
declare ctx jsonb := current_setting('paired_response_test.ctx')::jsonb;
begin
  assert (select status='cancelled' and status_code='homework_reopened'
    from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1),
    'Reopen cancellation history was not preserved';
  assert (select status='cancelled' from public.homework_completion_notifications
    where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=2),
    'Eligibility loss did not cancel the in-flight completion cycle';
  assert (select count(*)=1 from public.homework_completion_notification_events
    where notification_id=(ctx->>'inflight_notification')::uuid and provider_event_id='event:synthetic-provider-event'),
    'Late provider outcome evidence was not retained in append-only history';
end;
$recipient_loss_check$;

rollback;
