-- DEV-only rollback verifier for the recipient-level Homework notification
-- workflow. Creates synthetic records, calls the real submission/worker RPCs,
-- and rolls every record back. No provider request or email is made.
begin;

create function pg_temp.force_homework_recipient_delivery_due(target_delivery_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.homework_completion_notification_deliveries
  set next_attempt_at=clock_timestamp()
  where id=target_delivery_id and status='pending';
$$;

create function pg_temp.inspect_homework_recipient_delivery(target_delivery_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('status',delivery.status,'attemptCount',delivery.attempt_count,
    'retryDelaySeconds',extract(epoch from (delivery.next_attempt_at-delivery.updated_at)))
  from public.homework_completion_notification_deliveries delivery where delivery.id=target_delivery_id;
$$;

do $setup$
declare
  ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  couple_group uuid := gen_random_uuid();
  counselor_group uuid := gen_random_uuid();
  case_id uuid;
  session_id uuid;
  homework_id uuid;
  version_id uuid;
  block_id uuid;
  block_snapshot_id uuid;
  assignment_id uuid;
  counselor_assignment_id uuid;
  revision_id uuid;
  case_session_id uuid;
  progress_a uuid;
  progress_b uuid;
  i integer;
begin
  for i in 1..8 loop
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
    values(ids[i],'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
      'recipient-runtime-'||ids[i]::text||'@example.invalid','',clock_timestamp(),'{}','{}');
    update public.profiles set status='active', first_name='Synthetic', last_name='Recipient '||i where id=ids[i];
  end loop;
  insert into public.profile_roles(profile_id,role) values(ids[1],'super_admin'),(ids[2],'couple'),(ids[3],'couple'),
    (ids[4],'counselor'),(ids[5],'counselor'),(ids[7],'counselor'),(ids[8],'counselor');
  insert into public.groups(id,group_type,name) values(couple_group,'couple','Synthetic recipient delivery couple');
  insert into public.group_members(group_id,profile_id) values(couple_group,ids[2]),(couple_group,ids[3]);
  insert into public.groups(id,group_type,name) values(counselor_group,'counselor_team','Synthetic recipient delivery Counselors');
  insert into public.group_members(group_id,profile_id) values(counselor_group,ids[4]),(counselor_group,ids[5]);
  insert into public.groups(group_type,name) values('counselor_team','Synthetic unassigned team') returning id into case_id;
  -- Reuse the sixth profile only as an unassigned Counselor identity.
  insert into public.profile_roles(profile_id,role) values(ids[6],'counselor');
  insert into public.group_members(group_id,profile_id) values(case_id,ids[6]);
  insert into public.counseling_cases(couple_group_id,created_by,status) values(couple_group,ids[1],'active') returning id into case_id;
  insert into public.case_assignments(counseling_case_id,assigned_group_id,assignment_type,assigned_by)
    values(case_id,counselor_group,'counselor',ids[1]) returning id into counselor_assignment_id;
  insert into public.sessions(title,created_by) values('Synthetic recipient delivery session',ids[1]) returning id into session_id;
  insert into public.homeworks(session_id) values(session_id) returning id into homework_id;
  insert into public.homework_versions(homework_id,status,created_by) values(homework_id,'draft',ids[1]) returning id into version_id;
  insert into public.homework_blocks(homework_id) values(homework_id) returning id into block_id;
  insert into public.homework_version_blocks(homework_version_id,homework_block_id,block_type,position,title,description,rich_text_content)
    values(version_id,block_id,'long_answer',0,'Synthetic prompt',null,
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic prompt"}]}]}'::jsonb)
    returning id into block_snapshot_id;
  perform set_config('homework_recipient_runtime.ctx',jsonb_build_object('admin',ids[1],'a',ids[2],'b',ids[3],
    'counselor_a',ids[4],'counselor_b',ids[5],'replacement_a',ids[7],'replacement_b',ids[8],
    'block',block_snapshot_id,'homework',homework_id,'version',version_id,'case',case_id,'session',session_id,
    'counselor_assignment',counselor_assignment_id)::text,true);
end;
$setup$;

set local role authenticated;
do $publish$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb; assignment_id uuid; revision_id uuid;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'admin',true);
  perform public.publish_homework_version((ctx->>'version')::uuid);
  assignment_id:=public.assign_homework((ctx->>'homework')::uuid,(ctx->>'case')::uuid,(ctx->>'version')::uuid);
  select id into revision_id from public.homework_assignment_revisions where homework_assignment_id=assignment_id and ended_at is null;
  ctx:=ctx||jsonb_build_object('assignment',assignment_id,'revision',revision_id,
    'progress_a',(select id from public.homework_participant_progress where assignment_revision_id=revision_id and profile_id=(ctx->>'a')::uuid),
    'progress_b',(select id from public.homework_participant_progress where assignment_revision_id=revision_id and profile_id=(ctx->>'b')::uuid));
  perform set_config('homework_recipient_runtime.ctx',ctx::text,true);
end;
$publish$;
reset role;

do $link_session$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb; case_session_id uuid;
begin
  insert into public.case_sessions(counseling_case_id,session_id,actual_sequence,template_sequence_number,title,
    homework_assignment_revision_id,material_released_at,homework_released_at,activated_at,activated_by)
  values((ctx->>'case')::uuid,(ctx->>'session')::uuid,1,1,'Synthetic recipient delivery session',(ctx->>'revision')::uuid,
    now(),now(),now(),(ctx->>'admin')::uuid) returning id into case_session_id;
  perform set_config('homework_recipient_runtime.ctx',(ctx||jsonb_build_object('case_session',case_session_id))::text,true);
end;
$link_session$;

set local role authenticated;
do $submit$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb; answers jsonb;
begin
  answers:=jsonb_build_object(ctx->>'block','Synthetic answer');
  perform set_config('request.jwt.claim.sub',ctx->>'a',true);
  assert public.persist_participant_homework((ctx->>'progress_a')::uuid,answers,'submit')='submitted',
    'First synthetic partner submission failed';
  perform set_config('request.jwt.claim.sub',ctx->>'b',true);
  assert public.persist_participant_homework((ctx->>'progress_b')::uuid,answers,'submit')='submitted',
    'Second synthetic partner submission failed';
end;
$submit$;
reset role;

do $cycle_assertions$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
begin
  assert (select count(*)=1 from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1),
    'Exactly one completion cycle was not created';
  assert (select count(*)=2 from public.homework_completion_notification_deliveries d join public.homework_completion_notifications n on n.id=d.notification_id
    where n.case_session_id=(ctx->>'case_session')::uuid and n.completion_cycle=1 and d.status='pending'),
    'Two eligible Counselors did not receive independent pending deliveries';
  perform set_config('homework_recipient_runtime.cycle',
    (select id::text from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=1),true);
end;
$cycle_assertions$;

set local role service_role;
do $worker_outcomes$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
  claimed record; delivery_ids uuid[]:='{}'; accepted_delivery uuid; retry_delivery uuid; cycle_id uuid;
  recipient_context jsonb; attempt_id uuid; accepted_attempt uuid; accepted_email text;
  candidate jsonb; prepared jsonb; started jsonb; outcome text; processed integer:=0;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  cycle_id:=current_setting('homework_recipient_runtime.cycle')::uuid;
  for claimed in select * from public.claim_due_homework_completion_recipient_deliveries(10) where notification_id=cycle_id loop
    recipient_context:=public.get_homework_completion_recipient_delivery_context(claimed.notification_id,claimed.delivery_id,claimed.claim_token);
    assert recipient_context is not null,'Claimed delivery context missing';
    attempt_id:=public.get_homework_completion_notification_attempt_id(claimed.notification_id,claimed.claim_token);
    assert attempt_id is not null,'Recipient attempt lookup failed';
    candidate:=jsonb_build_object('from','Marriage Ministry Test <test@example.invalid>',
      'to',jsonb_build_array(recipient_context->>'recipient_email'),'subject','Synthetic Homework Ready for Review',
      'html','<p>Synthetic notice; no Homework answers.</p>','text','Synthetic notice; no Homework answers.',
      'tags',jsonb_build_array(jsonb_build_object('name','notification_delivery_id','value',claimed.delivery_id::text),
        jsonb_build_object('name','notification_id','value',claimed.notification_id::text),
        jsonb_build_object('name','notification_attempt_id','value',attempt_id::text),
        jsonb_build_object('name','notification_type','value','homework_completion')));
    prepared:=public.prepare_homework_completion_recipient_payload(claimed.notification_id,claimed.delivery_id,claimed.claim_token,candidate);
    assert prepared is not null and prepared->>'idempotencyKey' is not null,'Recipient payload was not frozen';
    started:=public.authorize_homework_completion_recipient_delivery(claimed.notification_id,claimed.delivery_id,claimed.claim_token);
    assert started is not null and started->>'attemptId'=attempt_id::text,'Provider start authorization failed';
    if processed=0 then outcome:='accepted'; accepted_delivery:=claimed.delivery_id; accepted_attempt:=attempt_id;
      accepted_email:=recipient_context->>'recipient_email';
    else outcome:='rejected_retryable'; retry_delivery:=claimed.delivery_id; end if;
    assert public.finish_homework_completion_recipient_attempt(claimed.notification_id,claimed.delivery_id,claimed.claim_token,
      outcome,'synthetic-message-'||processed,case when outcome='rejected_retryable' then 'synthetic_transient_rejection' else null end)
      =case when outcome='accepted' then 'sent' else 'pending' end,'Synthetic provider result did not persist';
    if outcome='accepted' then
      assert public.verify_homework_completion_notification_webhook(claimed.notification_id,attempt_id,claimed.delivery_id,
        'synthetic-message-'||processed,array[recipient_context->>'recipient_email'])='verified',
        'Recipient-specific webhook evidence did not match its delivery and attempt';
      assert public.reconcile_homework_completion_recipient_attempt(attempt_id,'delivered','synthetic-message-'||processed,
        'synthetic-event-delivered',null)='delivered','Verified delivery evidence did not reconcile';
    end if;
    delivery_ids:=array_append(delivery_ids,claimed.delivery_id); processed:=processed+1;
  end loop;
  assert processed=2 and accepted_delivery is not null and retry_delivery is not null,'Worker did not process each recipient independently';
  assert public.verify_homework_completion_notification_webhook(cycle_id,accepted_attempt,retry_delivery,
    'synthetic-message-0',array[accepted_email])='unmatched',
    'Webhook correlation accepted a delivery ID belonging to another recipient';
  perform set_config('homework_recipient_runtime.worker_result',jsonb_build_object('cycle',cycle_id,'accepted_delivery',accepted_delivery,
    'retry_delivery',retry_delivery,'cycle_one_accepted_attempt',accepted_attempt,'cycle_one_accepted_email',accepted_email)::text,true);
end;
$worker_outcomes$;
reset role;

do $independent_state_assertions$
declare result jsonb:=current_setting('homework_recipient_runtime.worker_result')::jsonb;
begin
  assert (select status='delivered' from public.homework_completion_notification_deliveries where id=(result->>'accepted_delivery')::uuid),
    'Successful recipient was changed by the other recipient failure';
  assert (select status='pending' and next_attempt_at>clock_timestamp() from public.homework_completion_notification_deliveries where id=(result->>'retry_delivery')::uuid),
    'Transient failure did not schedule an independent retry';
end;
$independent_state_assertions$;

set local role service_role;
do $worker_table_denial$
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  begin
    perform 1 from public.homework_completion_notification_deliveries limit 1;
    raise exception 'service_role unexpectedly read the private delivery table directly';
  exception when insufficient_privilege then null; end;
  begin
    update public.homework_completion_notification_deliveries set status='sent';
    raise exception 'service_role unexpectedly modified the private delivery table directly';
  exception when insufficient_privilege then null; end;
end;
$worker_table_denial$;
reset role;

-- Assigned Counselor reopening cancels only the still-pending recipient delivery.
set local role authenticated;
do $reopen$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb; result jsonb:=current_setting('homework_recipient_runtime.worker_result')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'counselor_a',true);
  assert public.reopen_participant_homework((ctx->>'case')::uuid,(ctx->>'progress_a')::uuid) is not null,
    'Assigned Counselor could not reopen synthetic Homework';
end;
$reopen$;
reset role;

do $reopen_assertions$
declare result jsonb:=current_setting('homework_recipient_runtime.worker_result')::jsonb;
begin
  assert (select status='cancelled' from public.homework_completion_notifications where id=(result->>'cycle')::uuid),
    'Reopening did not cancel the incomplete completion cycle';
  assert (select status='cancelled' from public.homework_completion_notification_deliveries where id=(result->>'retry_delivery')::uuid),
    'Reopening did not cancel the unsent recipient delivery';
  assert (select status='delivered' from public.homework_completion_notification_deliveries where id=(result->>'accepted_delivery')::uuid),
    'Reopening altered the other recipient successful outcome';
end;
$reopen_assertions$;

set local role authenticated;
do $private_table_denial$
begin
  perform set_config('request.jwt.claim.sub',current_setting('homework_recipient_runtime.ctx')::jsonb->>'a',true);
  begin
    perform 1 from public.homework_completion_notification_deliveries limit 1;
    raise exception 'Authenticated participant unexpectedly read private recipient delivery rows';
  exception when insufficient_privilege then null; end;
  begin
    update public.homework_completion_notification_deliveries set status='sent';
    raise exception 'Authenticated participant unexpectedly modified recipient delivery rows';
  exception when insufficient_privilege then null; end;
end;
$private_table_denial$;
reset role;

-- The next completion cycle snapshots only the one Counselor who remains eligible.
do $one_eligible_setup$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
begin
  delete from public.profile_roles where profile_id=(ctx->>'counselor_b')::uuid and role='counselor';
end;
$one_eligible_setup$;
set local role authenticated;
do $one_eligible_resubmit$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'a',true);
  assert public.persist_participant_homework((ctx->>'progress_a')::uuid,
    jsonb_build_object(ctx->>'block','Synthetic response after reopening'),'submit')='submitted',
    'Reopened Couple participant could not resubmit';
end;
$one_eligible_resubmit$;
reset role;
do $one_eligible_assertions$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb; cycle_id uuid; delivery_id uuid;
begin
  select id into cycle_id from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=2;
  assert cycle_id is not null,'One-eligible completion cycle was not created';
  select id into delivery_id from public.homework_completion_notification_deliveries where notification_id=cycle_id and status='pending';
  assert delivery_id is not null and (select count(*)=1 from public.homework_completion_notification_deliveries where notification_id=cycle_id),
    'One eligible Counselor did not produce exactly one independent delivery';
  assert (select recipient_profile_id=(ctx->>'counselor_a')::uuid from public.homework_completion_notification_deliveries where id=delivery_id),
    'The one delivery was not assigned to the remaining eligible Counselor';
  perform set_config('homework_recipient_runtime.cycle_two',cycle_id::text,true);
  perform set_config('homework_recipient_runtime.delivery_two',delivery_id::text,true);
end;
$one_eligible_assertions$;

-- Complete five automatic attempts for only this recipient. Test-only due-time
-- acceleration represents elapsed schedule time; payload and key must remain frozen.
set local role service_role;
do $retry_limit$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
  cycle_id uuid:=current_setting('homework_recipient_runtime.cycle_two')::uuid;
  delivery_id uuid:=current_setting('homework_recipient_runtime.delivery_two')::uuid;
  claimed record; recipient_context jsonb; attempt_id uuid; candidate jsonb; prepared jsonb; started jsonb;
  first_key text; first_payload jsonb; first_cutoff timestamptz; state jsonb; attempt_number integer;
  expected_delay integer[]:=array[300,900,3600,21600];
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  for attempt_number in 1..5 loop
    select * into claimed from public.claim_due_homework_completion_recipient_deliveries(10) where notification_id=cycle_id;
    assert claimed.delivery_id=delivery_id,'Retry claim selected a different recipient delivery';
    recipient_context:=public.get_homework_completion_recipient_delivery_context(cycle_id,delivery_id,claimed.claim_token);
    attempt_id:=public.get_homework_completion_notification_attempt_id(cycle_id,claimed.claim_token);
    candidate:=jsonb_build_object('from','Marriage Ministry Test <test@example.invalid>',
      'to',jsonb_build_array(recipient_context->>'recipient_email'),'subject','Synthetic retry test',
      'html','<p>No private answers.</p>','text','No private answers.',
      'tags',jsonb_build_array(jsonb_build_object('name','notification_delivery_id','value',delivery_id::text),
        jsonb_build_object('name','notification_id','value',cycle_id::text),
        jsonb_build_object('name','notification_attempt_id','value',attempt_id::text),
        jsonb_build_object('name','notification_type','value','homework_completion')));
    prepared:=public.prepare_homework_completion_recipient_payload(cycle_id,delivery_id,claimed.claim_token,candidate);
    if attempt_number=1 then first_key:=prepared->>'idempotencyKey'; first_payload:=prepared->'payload';
    else assert prepared->>'idempotencyKey'=first_key and prepared->'payload'=first_payload,
      'Automatic retry changed the immutable key or payload'; end if;
    started:=public.authorize_homework_completion_recipient_delivery(cycle_id,delivery_id,claimed.claim_token);
    assert (started->>'attemptNumber')::integer=attempt_number,'Automatic attempt number is not sequential per recipient';
    if attempt_number=1 then first_cutoff:=(started->>'idempotencyCutoffAt')::timestamptz;
    else assert (started->>'idempotencyCutoffAt')::timestamptz=first_cutoff,'Automatic retry reset the recipient cutoff'; end if;
    assert public.finish_homework_completion_recipient_attempt(cycle_id,delivery_id,claimed.claim_token,
      'rejected_retryable','synthetic-retry-'||attempt_number,'synthetic_transient_rejection')
      =case when attempt_number<5 then 'pending' else 'failed' end,'Automatic retry limit outcome is incorrect';
    if attempt_number<5 then
      state:=pg_temp.inspect_homework_recipient_delivery(delivery_id);
      assert state->>'status'='pending' and abs((state->>'retryDelaySeconds')::numeric-expected_delay[attempt_number])<2,
        'Automatic retry delay did not match the approved schedule';
      perform pg_temp.force_homework_recipient_delivery_due(delivery_id);
    end if;
  end loop;
  state:=pg_temp.inspect_homework_recipient_delivery(delivery_id);
  assert state->>'status'='failed' and (state->>'attemptCount')::integer=5,
    'Five automatic attempts did not end in recipient-scoped failure';
  perform set_config('homework_recipient_runtime.retry_result',jsonb_build_object('key',first_key,'payload',first_payload,
    'cutoff',first_cutoff,'cycle',cycle_id,'delivery',delivery_id)::text,true);
end;
$retry_limit$;
reset role;

-- Admin recovery is restricted to the failed recipient and can be reserved once.
set local role authenticated;
do $recovery_authorization$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
  retry_result jsonb:=current_setting('homework_recipient_runtime.retry_result')::jsonb;
  denied boolean:=false; alerts integer;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'a',true);
  begin
    perform public.request_homework_completion_recipient_recovery((retry_result->>'delivery')::uuid);
  exception when others then
    if sqlerrm='Not authorized' then denied:=true; else raise; end if;
  end;
  assert denied,'Couple participant could invoke Admin recovery';
  perform set_config('request.jwt.claim.sub',ctx->>'admin',true);
  select count(*) into alerts from public.list_homework_completion_recipient_delivery_alerts(50)
    where delivery_id=(retry_result->>'delivery')::uuid and status='failed';
  assert alerts=1,'Admin alert did not identify the failed recipient delivery';
  assert public.request_homework_completion_recipient_recovery((retry_result->>'delivery')::uuid),
    'Authorized Admin could not reserve eligible manual recovery';
  assert not public.request_homework_completion_recipient_recovery((retry_result->>'delivery')::uuid),
    'Admin recovery reservation was not one-time';
end;
$recovery_authorization$;
reset role;

set local role service_role;
do $manual_recovery$
declare retry_result jsonb:=current_setting('homework_recipient_runtime.retry_result')::jsonb;
  cycle_id uuid:=(retry_result->>'cycle')::uuid; delivery_id uuid:=(retry_result->>'delivery')::uuid;
  claimed record; recipient_context jsonb; attempt_id uuid; candidate jsonb; prepared jsonb; started jsonb;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select * into claimed from public.claim_due_homework_completion_recipient_deliveries(10) where notification_id=cycle_id;
  assert claimed.delivery_id=delivery_id and claimed.manual_recovery,'Manual recovery claimed the wrong recipient or attempt type';
  recipient_context:=public.get_homework_completion_recipient_delivery_context(cycle_id,delivery_id,claimed.claim_token);
  attempt_id:=public.get_homework_completion_notification_attempt_id(cycle_id,claimed.claim_token);
  candidate:=jsonb_build_object('from','Marriage Ministry Test <test@example.invalid>',
    'to',jsonb_build_array(recipient_context->>'recipient_email'),'subject','Synthetic manual recovery',
    'html','<p>No private answers.</p>','text','No private answers.',
    'tags',jsonb_build_array(jsonb_build_object('name','notification_delivery_id','value',delivery_id::text),
      jsonb_build_object('name','notification_id','value',cycle_id::text),
      jsonb_build_object('name','notification_attempt_id','value',attempt_id::text),
      jsonb_build_object('name','notification_type','value','homework_completion')));
  prepared:=public.prepare_homework_completion_recipient_payload(cycle_id,delivery_id,claimed.claim_token,candidate);
  assert prepared->>'idempotencyKey'<>retry_result->>'key' and prepared->'payload'<>retry_result->'payload',
    'Manual recovery did not receive its own immutable payload/key';
  started:=public.authorize_homework_completion_recipient_delivery(cycle_id,delivery_id,claimed.claim_token);
  assert (started->>'manualRecovery')::boolean and started->>'idempotencyKey'=prepared->>'idempotencyKey',
    'Manual recovery start did not use its reserved recipient key';
  assert public.finish_homework_completion_recipient_attempt(cycle_id,delivery_id,claimed.claim_token,
    'accepted','synthetic-manual-recovery',null)='sent','Manual recovery outcome did not persist';
end;
$manual_recovery$;
reset role;

-- A later pending cycle is canceled on Counselor reassignment; the new assignment
-- must not revive delivery to the former Counselor.
set local role authenticated;
do $cycle_three_resubmit$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'counselor_a',true);
  perform public.reopen_participant_homework((ctx->>'case')::uuid,(ctx->>'progress_a')::uuid);
  perform set_config('request.jwt.claim.sub',ctx->>'a',true);
  assert public.persist_participant_homework((ctx->>'progress_a')::uuid,
    jsonb_build_object(ctx->>'block','Synthetic response before reassignment'),'submit')='submitted',
    'Participant could not create a new cycle after manual recovery';
end;
$cycle_three_resubmit$;
reset role;
do $reassignment$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb; cycle_id uuid; delivery_id uuid; new_team uuid;
begin
  select id into cycle_id from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=3;
  select id into delivery_id from public.homework_completion_notification_deliveries where notification_id=cycle_id and status='pending';
  assert cycle_id is not null and delivery_id is not null,'Pre-reassignment cycle did not have a pending recipient delivery';
  update public.case_assignments set ended_at=clock_timestamp(),end_reason='Synthetic verifier reassignment'
    where id=(ctx->>'counselor_assignment')::uuid and ended_at is null;
  assert (select status='cancelled' from public.homework_completion_notification_deliveries where id=delivery_id),
    'Reassigning the Counselor did not cancel the former recipient delivery';
  insert into public.groups(group_type,name) values('counselor_team','Synthetic replacement Counselor team') returning id into new_team;
  insert into public.group_members(group_id,profile_id) values(new_team,(ctx->>'replacement_a')::uuid),(new_team,(ctx->>'replacement_b')::uuid);
  insert into public.case_assignments(counseling_case_id,assigned_group_id,assignment_type,assigned_by)
    values((ctx->>'case')::uuid,new_team,'counselor',(ctx->>'admin')::uuid);
  assert (select status='cancelled' from public.homework_completion_notification_deliveries where id=delivery_id),
    'New Counselor assignment revived former recipient delivery';
  perform set_config('homework_recipient_runtime.cycle_three',cycle_id::text,true);
end;
$reassignment$;

-- Remove eligibility for both replacement Counselors; the next cycle must be blocked.
set local role authenticated;
do $zero_eligible_resubmit$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'replacement_a',true);
  perform public.reopen_participant_homework((ctx->>'case')::uuid,(ctx->>'progress_a')::uuid);
end;
$zero_eligible_resubmit$;
reset role;
do $remove_final_eligibility$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
begin
  delete from public.profile_roles where profile_id in ((ctx->>'replacement_a')::uuid,(ctx->>'replacement_b')::uuid) and role='counselor';
end;
$remove_final_eligibility$;
set local role authenticated;
do $zero_eligible_submit$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'a',true);
  assert public.persist_participant_homework((ctx->>'progress_a')::uuid,
    jsonb_build_object(ctx->>'block','Synthetic response with no eligible Counselor'),'submit')='submitted',
    'Participant could not submit after the next reopen';
end;
$zero_eligible_submit$;
reset role;
do $zero_eligible_assertions$
declare ctx jsonb:=current_setting('homework_recipient_runtime.ctx')::jsonb; cycle_id uuid;
begin
  select id into cycle_id from public.homework_completion_notifications where case_session_id=(ctx->>'case_session')::uuid and completion_cycle=4;
  assert cycle_id is not null and (select status='blocked' and status_code='no_eligible_counselor'
    from public.homework_completion_notifications where id=cycle_id),'No-eligible cycle was not safely blocked';
  assert not exists(select 1 from public.homework_completion_notification_deliveries where notification_id=cycle_id),
    'A sendable delivery was created without an eligible Counselor';
end;
$zero_eligible_assertions$;

do $cleanup_assertions$
begin
  assert (select count(*)=4 from public.homework_completion_notifications
    where case_session_id=(current_setting('homework_recipient_runtime.ctx')::jsonb->>'case_session')::uuid),
    'Expected four durable completion cycles across the synthetic lifecycle';
  assert (select count(*)=4 from public.homework_completion_notification_deliveries d join public.homework_completion_notifications n on n.id=d.notification_id
    where n.case_session_id=(current_setting('homework_recipient_runtime.ctx')::jsonb->>'case_session')::uuid),
    'Recipient delivery history does not match the exercised one/two/no-eligible cycles';
  assert (select count(*)=8 from public.homework_completion_notification_attempts a join public.homework_completion_notifications n on n.id=a.notification_id
    where n.case_session_id=(current_setting('homework_recipient_runtime.ctx')::jsonb->>'case_session')::uuid),
    'Expected two initial, five automatic retry, and one manual recovery attempts';
  assert (select count(*)=4 from public.homework_completion_notification_payloads p join public.homework_completion_notifications n on n.id=p.notification_id
    where n.case_session_id=(current_setting('homework_recipient_runtime.ctx')::jsonb->>'case_session')::uuid),
    'Immutable automatic and manual payload history is incomplete';
  assert (select count(*)=1 from public.homework_completion_notification_provider_evidence e
    where e.attempt_id in (select a.id from public.homework_completion_notification_attempts a join public.homework_completion_notifications n on n.id=a.notification_id
      where n.case_session_id=(current_setting('homework_recipient_runtime.ctx')::jsonb->>'case_session')::uuid)),
    'Expected one verified delivery evidence record for the synthetic accepted recipient';
end;
$cleanup_assertions$;

rollback;
