-- Rollback-only DEV verification of Assessment progression gates and result RLS.
-- All identities, Cases, Sessions, Homeworks, Assessment content, and responses
-- are synthetic. Email-like values use the reserved .invalid domain. The two
-- global Assessment setup triggers are paused only while fixture data is made,
-- preventing temporary schedule writes against real DEV Cases; the production
-- configuration and progression RPCs remain enabled and are exercised below.
begin;

do $$
declare
  p uuid[];
  couple_group uuid;
  counselor_group uuid;
  cases uuid[] := array[]::uuid[];
  sessions uuid[] := array[]::uuid[];
  homeworks uuid[] := array[]::uuid[];
  revisions uuid[] := array[]::uuid[];
  progress_ids uuid[] := array[]::uuid[];
  assessment_id uuid;
  version_id uuid;
  category_id uuid;
  question_id uuid;
  choice_id uuid;
  other_choice_id uuid;
  assignment_id uuid;
  revision_id uuid;
  progress_id uuid;
  case_session_id uuid;
  meeting_session_id uuid;
  homework_version_id uuid;
  homework_block_id uuid;
  material_id uuid;
  schedule_id uuid;
  attempt_id uuid;
  n integer;
  partner integer;
  person_role public.app_role;
  session_row public.sessions%rowtype;
begin
  select array_agg(gen_random_uuid() order by g.n) into p from generate_series(1,16) as g(n);
  for n in 1..16 loop
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(p[n],'authenticated','authenticated',
      'assessment-release-'||p[n]::text||'@example.invalid','',now(),'{}','{}',now(),now());
    update public.profiles set first_name='Assessment Release',last_name='Fixture '||n::text,status='active' where id=p[n];
    person_role := case when n=1 then 'admin'::public.app_role
      when n=2 then 'super_admin'::public.app_role
      when n between 3 and 6 then 'counselor'::public.app_role
      else 'couple'::public.app_role end;
    insert into public.profile_roles(profile_id,role) values(p[n],person_role);
    perform set_config('assessment_release.profile_'||n::text,p[n]::text,true);
  end loop;

  insert into public.groups(group_type,name) values('counselor_team','Assessment Release Assigned Team') returning id into counselor_group;
  insert into public.group_members(group_id,profile_id) values(counselor_group,p[3]),(counselor_group,p[4]);
  insert into public.groups(group_type,name) values('counselor_team','Assessment Release Unassigned Team') returning id into couple_group;
  insert into public.group_members(group_id,profile_id) values(couple_group,p[5]),(couple_group,p[6]);
  perform set_config('assessment_release.assigned_counselor',p[3]::text,true);
  perform set_config('assessment_release.unassigned_counselor',p[5]::text,true);
  perform set_config('assessment_release.counselor_group',counselor_group::text,true);
  perform set_config('assessment_release.admin',p[1]::text,true);
  perform set_config('assessment_release.super_admin',p[2]::text,true);

  -- Author synthetic published Session and Homework templates.
  for n in 1..3 loop
    insert into public.sessions(title,status,created_by,is_final)
    values(case n when 1 then 'Assessment Release Current' when 2 then 'Assessment Release Next' else 'Assessment Release Final' end,
      'published',p[1],n=3) returning id into meeting_session_id;
    sessions := array_append(sessions,meeting_session_id);
    insert into public.homeworks(session_id) values(meeting_session_id) returning id into meeting_session_id;
    homeworks := array_append(homeworks,meeting_session_id);
    insert into public.homework_versions(homework_id,status,version_number,created_by,published_at)
    values(meeting_session_id,'published',1,p[1],now()) returning id into homework_version_id;
    insert into public.homework_blocks(homework_id) values(meeting_session_id) returning id into homework_block_id;
    insert into public.homework_version_blocks(homework_version_id,homework_block_id,block_type,position,title,rich_text_content)
    values(homework_version_id,homework_block_id,'rich_text',0,'Synthetic instructions',
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic content"}]}]}'::jsonb);
  end loop;
  insert into public.session_material_blocks(session_id,block_type,position,title,rich_text_content)
  values(sessions[2],'rich_text',0,'Synthetic selected material',
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Synthetic content"}]}]}'::jsonb) returning id into material_id;
  perform set_config('assessment_release.current_session',sessions[1]::text,true);
  perform set_config('assessment_release.next_session',sessions[2]::text,true);
  perform set_config('assessment_release.final_session',sessions[3]::text,true);
  perform set_config('assessment_release.current_homework',homeworks[1]::text,true);
  perform set_config('assessment_release.next_homework',homeworks[2]::text,true);
  perform set_config('assessment_release.final_homework',homeworks[3]::text,true);
  perform set_config('assessment_release.next_material',material_id::text,true);

  -- Make a minimal valid assessment version. Suppress only the normal publish
  -- backfill so no real Case receives temporary schedule rows in this test.
  insert into public.assessment_definitions(slug,title,description,created_by)
  values('assessment_release_'||substr(replace(gen_random_uuid()::text,'-',''),1,20),
    'Assessment Release Fixture','Synthetic rollback-only content',p[1]) returning id into assessment_id;
  insert into public.assessment_versions(assessment_id,version_number,status,created_by)
  values(assessment_id,1,'draft',p[1]) returning id into version_id;
  insert into public.assessment_categories(assessment_version_id,category_key,label,position)
  values(version_id,'fixture_result','Fixture Result',0) returning id into category_id;
  insert into public.assessment_questions(assessment_version_id,position,prompt)
  values(version_id,0,'Synthetic question') returning id into question_id;
  insert into public.assessment_choices(assessment_version_id,question_id,position,label)
  values(version_id,question_id,0,'Synthetic answer A') returning id into choice_id;
  insert into public.assessment_choices(assessment_version_id,question_id,position,label)
  values(version_id,question_id,1,'Synthetic answer B') returning id into other_choice_id;
  insert into public.assessment_choice_scores(choice_id,assessment_version_id,category_id)
  values(choice_id,version_id,category_id),(other_choice_id,version_id,category_id);
  execute 'alter table public.assessment_versions disable trigger assessment_version_auto_assignment';
  update public.assessment_versions set status='published',published_at=now() where id=version_id;
  execute 'alter table public.assessment_versions enable trigger assessment_version_auto_assignment';
  perform set_config('assessment_release.assessment',assessment_id::text,true);
  perform set_config('assessment_release.version',version_id::text,true);
  perform set_config('assessment_release.category',category_id::text,true);
  perform set_config('assessment_release.question',question_id::text,true);
  perform set_config('assessment_release.choice',choice_id::text,true);

  -- Case-session activation normally auto-assigns every globally published
  -- Assessment. Pause just this setup hook; the test creates its one explicit
  -- schedule using configure_case_assessment_schedule below.
  execute 'alter table public.case_sessions disable trigger assessment_case_session_auto_assignment';
  for n in 1..5 loop
    insert into public.groups(group_type,name) values('couple','Assessment Release Couple '||n::text) returning id into couple_group;
    partner := 7+(n-1)*2;
    insert into public.group_members(group_id,profile_id) values(couple_group,p[partner]),(couple_group,p[partner+1]);
    insert into public.counseling_cases(couple_group_id,status,created_by) values(couple_group,'active',p[1]) returning id into case_session_id;
    cases := array_append(cases,case_session_id);
    insert into public.case_assignments(counseling_case_id,assigned_group_id,assignment_type,assigned_by)
    values(case_session_id,counselor_group,'counselor',p[1]);

    homework_version_id := case when n=5 then homeworks[3] else homeworks[1] end;
    select version.id into homework_block_id
    from public.homework_versions version
    where version.homework_id=homework_version_id and version.status='published'
    order by version.version_number desc limit 1;
    insert into public.homework_assignments(homework_id,counseling_case_id,assigned_by)
    values(homework_version_id,case_session_id,p[1]) returning id into assignment_id;
    insert into public.homework_assignment_revisions(homework_assignment_id,homework_version_id,updated_by)
    values(assignment_id,homework_block_id,p[1]) returning id into revision_id;
    revisions := array_append(revisions,revision_id);

    for partner in 1..2 loop
      insert into public.homework_participant_progress(assignment_revision_id,profile_id,status,submitted_at)
      values(revision_id,p[7+(n-1)*2+partner-1],
        case when n in (2,3) and partner=2 then 'in_progress'::public.homework_progress_status else 'submitted'::public.homework_progress_status end,
        case when n in (2,3) and partner=2 then null else now() end)
      returning id into progress_id;
      progress_ids := array_append(progress_ids,progress_id);
    end loop;
    -- The loop reuses revision_id, so restore the active Homework revision id.
    select id into revision_id from public.homework_assignment_revisions where homework_assignment_id=assignment_id and ended_at is null;
    revisions[n] := revision_id;

    meeting_session_id := case when n=5 then sessions[3] else sessions[1] end;
    select * into session_row from public.sessions where id=meeting_session_id;
    insert into public.case_sessions(counseling_case_id,session_id,actual_sequence,template_sequence_number,title,
      homework_assignment_revision_id,material_released_at,homework_released_at,activated_at,activated_by)
    values(case_session_id,session_row.id,1,session_row.sequence_number,session_row.title,revision_id,now(),now(),now(),p[1])
    returning id into case_session_id;
    sessions := sessions; -- retain the three authored template IDs
    perform set_config('assessment_release.case_'||n::text,
      (select counseling_case_id::text from public.case_sessions where id=case_session_id),true);
    perform set_config('assessment_release.case_session_'||n::text,case_session_id::text,true);
    perform set_config('assessment_release.left_'||n::text,p[7+(n-1)*2]::text,true);
    perform set_config('assessment_release.right_'||n::text,p[8+(n-1)*2]::text,true);
    insert into public.case_session_meetings(counseling_case_id,session_id,case_session_id,starts_at,ends_at,location,scheduled_by)
    values((select counseling_case_id from public.case_sessions where id=case_session_id),session_row.id,case_session_id,
      now()+interval '3 days',now()+interval '3 days 1 hour','Synthetic location',p[1]);
  end loop;
  execute 'alter table public.case_sessions enable trigger assessment_case_session_auto_assignment';
  perform set_config('assessment_release.material',material_id::text,true);
end;
$$;

-- Use the production schedule RPC to create participant assignments for each
-- isolated active Case Session.
set local role authenticated;
do $$
declare
  n integer;
  case_id uuid;
  active_session_id uuid;
  schedule_id uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('assessment_release.admin'),true);
  for n in 1..5 loop
    case_id := current_setting('assessment_release.case_'||n::text)::uuid;
    active_session_id := case when n=5
      then current_setting('assessment_release.final_session')::uuid
      else current_setting('assessment_release.current_session')::uuid end;
    schedule_id := public.configure_case_assessment_schedule(
      case_id,current_setting('assessment_release.assessment')::uuid,
      current_setting('assessment_release.version')::uuid,active_session_id);
    if schedule_id is null then raise exception 'Synthetic schedule RPC returned no schedule'; end if;
    perform set_config('assessment_release.schedule_'||n::text,schedule_id::text,true);
  end loop;
end;
$$;
reset role;

-- Seed synthetic Assessment attempts before the gate assertions.
do $$
declare
  n integer;
  partner integer;
  participant_id uuid;
  assignment_id uuid;
  attempt_id uuid;
  submitted boolean;
begin
  for n in 1..5 loop
    for partner in 1..2 loop
      participant_id := current_setting('assessment_release.'||case when partner=1 then 'left_' else 'right_' end||n::text)::uuid;
      select assignment.id into assignment_id
      from public.assessment_participant_assignments assignment
      where assignment.assessment_schedule_id=current_setting('assessment_release.schedule_'||n::text)::uuid
        and assignment.profile_id=participant_id;
      if assignment_id is null then raise exception 'Synthetic participant assignment missing'; end if;
      insert into public.assessment_attempts(participant_assignment_id,profile_id,attempt_number)
      values(assignment_id,participant_id,1) returning id into attempt_id;
      insert into public.assessment_responses(attempt_id,profile_id,question_id,choice_id)
      values(attempt_id,participant_id,current_setting('assessment_release.question')::uuid,
        current_setting('assessment_release.choice')::uuid);
      submitted := (n=1 and partner=1) or n=3 or n=4 or (n=5 and partner=1);
      if submitted then
        insert into public.assessment_attempt_scores(attempt_id,assessment_version_id,category_id,score,rank,is_primary)
        values(attempt_id,current_setting('assessment_release.version')::uuid,
          current_setting('assessment_release.category')::uuid,1,1,true);
        update public.assessment_attempts set status='submitted',submitted_at=now() where id=attempt_id;
      end if;
      perform set_config('assessment_release.attempt_'||n::text||'_'||partner::text,attempt_id::text,true);
    end loop;
  end loop;
end;
$$;

-- Final-program Assessment gate with Homework complete.
set local role authenticated;
do $$
declare
  case_id uuid := current_setting('assessment_release.case_5')::uuid;
  target_case_session_id uuid := current_setting('assessment_release.case_session_5')::uuid;
  admin_id uuid := current_setting('assessment_release.admin')::uuid;
  rejected boolean;
begin
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  rejected:=false;
  begin
    perform public.complete_counseling_program(target_case_session_id,null);
  exception when others then
    rejected:=sqlerrm='Both partners must submit the required initial Assessment before completing the program';
    if not rejected then raise; end if;
  end;
  if not rejected then raise exception 'Final program completion bypassed incomplete Assessment'; end if;
  if not exists(select 1 from public.counseling_cases c where c.id=case_id and c.closed_at is null)
     or not exists(select 1 from public.case_sessions cs where cs.id=target_case_session_id and cs.status='active')
     or (select count(*) from public.case_session_meetings m where m.case_session_id=target_case_session_id and m.completed_at is null)<>1 then
    raise exception 'Blocked program completion partially changed Case, Session, or Meeting';
  end if;
end;
$$;
reset role;

-- Make Homework incomplete and verify exact Admin override cannot bypass the
-- still-incomplete required Assessment.
update public.homework_participant_progress progress
set status='in_progress',submitted_at=null,reviewed_at=null
where progress.profile_id=current_setting('assessment_release.right_5')::uuid
  and progress.assignment_revision_id=(select cs.homework_assignment_revision_id from public.case_sessions cs
    where cs.id=current_setting('assessment_release.case_session_5')::uuid);
set local role authenticated;
do $$
declare
  target_case_session_id uuid := current_setting('assessment_release.case_session_5')::uuid;
  case_id uuid := current_setting('assessment_release.case_5')::uuid;
  admin_id uuid := current_setting('assessment_release.admin')::uuid;
  rejected boolean;
begin
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  rejected:=false;
  begin
    perform public.complete_counseling_program(target_case_session_id,'OVERRIDE');
  exception when others then
    rejected:=sqlerrm='Both partners must submit the required initial Assessment before completing the program';
    if not rejected then raise; end if;
  end;
  if not rejected or not exists(select 1 from public.counseling_cases c where c.id=case_id and c.closed_at is null)
     or not exists(select 1 from public.case_sessions cs where cs.id=target_case_session_id and cs.status='active') then
    raise exception 'Homework OVERRIDE bypassed the Assessment gate or partially changed Case state';
  end if;
end;
$$;
reset role;

-- Mark both synthetic initial Assessments submitted. The saved answer rows and
-- score remain synthetic and are rolled back with the fixture transaction.
insert into public.assessment_attempt_scores(attempt_id,assessment_version_id,category_id,score,rank,is_primary)
values(current_setting('assessment_release.attempt_5_2')::uuid,
  current_setting('assessment_release.version')::uuid,current_setting('assessment_release.category')::uuid,1,1,true);
update public.assessment_attempts set status='submitted',submitted_at=now()
where id=current_setting('assessment_release.attempt_5_2')::uuid;

-- With Assessment complete and Homework incomplete, Admin's exact override
-- completes the final Case; inspect state then roll back that subtransaction.
set local role authenticated;
do $$
declare
  case_id uuid := current_setting('assessment_release.case_5')::uuid;
  target_case_session_id uuid := current_setting('assessment_release.case_session_5')::uuid;
  admin_id uuid := current_setting('assessment_release.admin')::uuid;
begin
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  begin
    perform public.complete_counseling_program(target_case_session_id,'OVERRIDE');
    if not exists(select 1 from public.counseling_cases c where c.id=case_id and c.status='finished' and c.closed_at is not null)
       or not exists(select 1 from public.case_sessions cs where cs.id=target_case_session_id and cs.status='completed')
       or (select count(*) from public.case_session_meetings m where m.case_session_id=target_case_session_id and m.completed_at is not null)<>1 then
      raise exception 'Authorized final Homework override did not finish the program';
    end if;
    raise exception 'assessment_release_rollback_success';
  exception when others then
    if sqlerrm<>'assessment_release_rollback_success' then raise; end if;
  end;
end;
$$;
reset role;

-- With both required Assessments complete, ordinary final completion succeeds.
update public.homework_participant_progress progress
set status='submitted',submitted_at=now(),reviewed_at=null
where progress.assignment_revision_id=(
  select case_session.homework_assignment_revision_id from public.case_sessions case_session
  where case_session.id=current_setting('assessment_release.case_session_5')::uuid
);
set local role authenticated;
do $$
declare
  case_id uuid := current_setting('assessment_release.case_5')::uuid;
  target_case_session_id uuid := current_setting('assessment_release.case_session_5')::uuid;
begin
  perform set_config('request.jwt.claim.sub',current_setting('assessment_release.admin'),true);
  begin
    perform public.complete_counseling_program(target_case_session_id,null);
    if not exists(select 1 from public.counseling_cases c where c.id=case_id and c.status='finished' and c.closed_at is not null)
       or not exists(select 1 from public.case_sessions cs where cs.id=target_case_session_id and cs.status='completed') then
      raise exception 'Normal eligible final program completion did not succeed';
    end if;
    raise exception 'assessment_release_rollback_success';
  exception when others then
    if sqlerrm<>'assessment_release_rollback_success' then raise; end if;
  end;
end;
$$;
reset role;

-- Anonymous users cannot read raw answers or execute restricted RPCs.
set local role anon;
do $$
declare denied boolean:=false;
begin
  begin
    perform count(*) from public.assessment_responses;
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Anonymous role can read Assessment answers'; end if;
  if has_function_privilege('anon','public.get_partner_assessment_score_history(uuid)','execute')
     or has_function_privilege('anon','public.complete_case_session_schedule_next(uuid,uuid,uuid[],timestamptz,timestamptz,text)','execute')
     or has_function_privilege('anon','public.complete_counseling_program(uuid,text)','execute') then
    raise exception 'Anonymous role has restricted Assessment or progression RPC access';
  end if;
end;
$$;
reset role;

-- Session progression: required Assessment gates, Homework-only override,
-- assigned-care authorization, success paths, and transaction atomicity.
set local role authenticated;
do $$
declare
  admin_id uuid := current_setting('assessment_release.admin')::uuid;
  super_admin_id uuid := current_setting('assessment_release.super_admin')::uuid;
  counselor_id uuid := current_setting('assessment_release.assigned_counselor')::uuid;
  unassigned_id uuid := current_setting('assessment_release.unassigned_counselor')::uuid;
  case_a uuid := current_setting('assessment_release.case_1')::uuid;
  case_b uuid := current_setting('assessment_release.case_2')::uuid;
  case_c uuid := current_setting('assessment_release.case_3')::uuid;
  case_d uuid := current_setting('assessment_release.case_4')::uuid;
  expected_assessment_error text := 'Both partners must submit the required initial Assessment before advancing';
  rejected boolean;
  actor_id uuid;
  next_case_session_id uuid;
begin
  -- Case 1 has complete Homework but an incomplete required Assessment.
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  rejected := false;
  begin
    perform public.complete_case_session_schedule_next(
      current_setting('assessment_release.case_session_1')::uuid,
      current_setting('assessment_release.next_session')::uuid,
      array[current_setting('assessment_release.material')::uuid],
      now()+interval '5 days',now()+interval '5 days 1 hour',null);
  exception when others then
    rejected := sqlerrm=expected_assessment_error;
    if not rejected then raise; end if;
  end;
  if not rejected then raise exception 'Normal progression bypassed incomplete required Assessment'; end if;
  if (select count(*) from public.case_sessions where counseling_case_id=case_a)<>1
     or not exists(select 1 from public.case_sessions where id=current_setting('assessment_release.case_session_1')::uuid and status='active')
     or (select count(*) from public.case_session_meetings where case_session_id=current_setting('assessment_release.case_session_1')::uuid and completed_at is null)<>1
     or exists(select 1 from public.case_session_meetings where counseling_case_id=case_a and session_id=current_setting('assessment_release.next_session')::uuid)
     or exists(select 1 from public.homework_assignments where counseling_case_id=case_a and homework_id=current_setting('assessment_release.next_homework')::uuid) then
    raise exception 'Failed progression partially changed the Session, Meeting, or Homework';
  end if;

  -- Case 2 has both gates blocked. Missing/wrong confirmation and non-admin
  -- confirmation fail at the Homework rule; exact Admin override reaches and
  -- is then rejected by the independent Assessment gate.
  foreach actor_id in array array[admin_id,counselor_id] loop
    perform set_config('request.jwt.claim.sub',actor_id::text,true);
    rejected := false;
    begin
      perform public.complete_case_session_schedule_next(
        current_setting('assessment_release.case_session_2')::uuid,
        current_setting('assessment_release.next_session')::uuid,
        array[current_setting('assessment_release.material')::uuid],
        now()+interval '5 days',now()+interval '5 days 1 hour',null);
    exception when others then
      rejected := sqlerrm like 'Both partners must submit Homework%';
      if not rejected then raise; end if;
    end;
    if not rejected then raise exception 'Missing Homework confirmation was not denied'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  rejected := false;
  begin
    perform public.complete_case_session_schedule_next(
      current_setting('assessment_release.case_session_2')::uuid,
      current_setting('assessment_release.next_session')::uuid,
      array[current_setting('assessment_release.material')::uuid],
      now()+interval '5 days',now()+interval '5 days 1 hour','incorrect');
  exception when others then
    rejected := sqlerrm like 'Both partners must submit Homework%';
    if not rejected then raise; end if;
  end;
  if not rejected then raise exception 'Incorrect Homework confirmation was not denied'; end if;
  rejected := false;
  begin
    perform public.complete_case_session_schedule_next(
      current_setting('assessment_release.case_session_2')::uuid,
      current_setting('assessment_release.next_session')::uuid,
      array[current_setting('assessment_release.material')::uuid],
      now()+interval '5 days',now()+interval '5 days 1 hour','OVERRIDE');
  exception when others then
    rejected := sqlerrm=expected_assessment_error;
    if not rejected then raise; end if;
  end;
  if not rejected then raise exception 'Admin Homework OVERRIDE bypassed required Assessment'; end if;
  if (select count(*) from public.case_sessions where counseling_case_id=case_b)<>1
     or not exists(select 1 from public.case_sessions where id=current_setting('assessment_release.case_session_2')::uuid and status='active')
     or (select count(*) from public.case_session_meetings where case_session_id=current_setting('assessment_release.case_session_2')::uuid and completed_at is null)<>1 then
    raise exception 'Blocked Admin override partially progressed the Case';
  end if;

  -- Case 3: assessments are complete, Homework is incomplete. Normal progress
  -- remains blocked; exact override works only for Admin/Super Admin.
  foreach actor_id in array array[admin_id,super_admin_id] loop
    perform set_config('request.jwt.claim.sub',actor_id::text,true);
    rejected := false;
    begin
      perform public.complete_case_session_schedule_next(
        current_setting('assessment_release.case_session_3')::uuid,
        current_setting('assessment_release.next_session')::uuid,
        array[current_setting('assessment_release.material')::uuid],
        now()+interval '5 days',now()+interval '5 days 1 hour',null);
    exception when others then
      rejected := sqlerrm like 'Both partners must submit Homework%';
      if not rejected then raise; end if;
    end;
    if not rejected then raise exception 'Normal progression ignored incomplete Homework'; end if;
    begin
      next_case_session_id := public.complete_case_session_schedule_next(
        current_setting('assessment_release.case_session_3')::uuid,
        current_setting('assessment_release.next_session')::uuid,
        array[current_setting('assessment_release.material')::uuid],
        now()+interval '5 days',now()+interval '5 days 1 hour','OVERRIDE');
      if next_case_session_id is null
         or not exists(select 1 from public.case_sessions where id=current_setting('assessment_release.case_session_3')::uuid and status='completed')
         or not exists(select 1 from public.case_sessions where id=next_case_session_id and status='active')
         or not exists(select 1 from public.case_session_meetings where case_session_id=next_case_session_id and completed_at is null)
         or not exists(select 1 from public.homework_assignments where counseling_case_id=case_c and homework_id=current_setting('assessment_release.next_homework')::uuid and unassigned_at is null) then
        raise exception 'Authorized Homework-only override did not advance to the next Session';
      end if;
      raise exception 'assessment_release_rollback_success';
    exception when others then
      if sqlerrm<>'assessment_release_rollback_success' then raise; end if;
    end;
    if (select count(*) from public.case_sessions where counseling_case_id=case_c)<>1
       or not exists(select 1 from public.case_sessions where id=current_setting('assessment_release.case_session_3')::uuid and status='active') then
      raise exception 'Successful override subtransaction did not roll back';
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub',counselor_id::text,true);
  rejected := false;
  begin
    perform public.complete_case_session_schedule_next(
      current_setting('assessment_release.case_session_3')::uuid,
      current_setting('assessment_release.next_session')::uuid,
      array[current_setting('assessment_release.material')::uuid],
      now()+interval '5 days',now()+interval '5 days 1 hour','OVERRIDE');
  exception when others then
    rejected := sqlerrm like 'Both partners must submit Homework%';
    if not rejected then raise; end if;
  end;
  if not rejected then raise exception 'Assigned Counselor used Admin-only Homework override'; end if;
  perform set_config('request.jwt.claim.sub',unassigned_id::text,true);
  rejected := false;
  begin
    perform public.complete_case_session_schedule_next(
      current_setting('assessment_release.case_session_3')::uuid,
      current_setting('assessment_release.next_session')::uuid,
      array[current_setting('assessment_release.material')::uuid],
      now()+interval '5 days',now()+interval '5 days 1 hour','OVERRIDE');
  exception when others then rejected:=sqlerrm='Not authorized'; end;
  if not rejected then raise exception 'Unassigned Counselor progressed a synthetic Case'; end if;

  -- Case 4 has all prerequisites complete; an assigned Counselor can advance
  -- normally. The expected subtransaction rollback keeps the fixture isolated.
  perform set_config('request.jwt.claim.sub',counselor_id::text,true);
  begin
    next_case_session_id := public.complete_case_session_schedule_next(
      current_setting('assessment_release.case_session_4')::uuid,
      current_setting('assessment_release.next_session')::uuid,
      array[current_setting('assessment_release.material')::uuid],
      now()+interval '5 days',now()+interval '5 days 1 hour',null);
    if next_case_session_id is null
       or not exists(select 1 from public.case_sessions where id=current_setting('assessment_release.case_session_4')::uuid and status='completed')
       or not exists(select 1 from public.case_sessions where id=next_case_session_id and status='active') then
      raise exception 'Normal eligible progression did not succeed';
    end if;
    raise exception 'assessment_release_rollback_success';
  exception when others then
    if sqlerrm<>'assessment_release_rollback_success' then raise; end if;
  end;
  if (select count(*) from public.case_sessions where counseling_case_id=case_d)<>1 then
    raise exception 'Normal progression success was not rolled back';
  end if;
end;
$$;
reset role;

-- Assessment result visibility and release behavior under authenticated RLS.
set local role authenticated;
do $$
declare
  row_count integer;
  schedule_a uuid := current_setting('assessment_release.schedule_1')::uuid;
  schedule_c uuid := current_setting('assessment_release.schedule_3')::uuid;
  schedule_d uuid := current_setting('assessment_release.schedule_4')::uuid;
  case_a uuid := current_setting('assessment_release.case_1')::uuid;
  case_d uuid := current_setting('assessment_release.case_4')::uuid;
  attempt_left_a uuid := current_setting('assessment_release.attempt_1_1')::uuid;
  attempt_right_a uuid := current_setting('assessment_release.attempt_1_2')::uuid;
  attempt_left_c uuid := current_setting('assessment_release.attempt_3_1')::uuid;
  left_a uuid := current_setting('assessment_release.left_1')::uuid;
  left_c uuid := current_setting('assessment_release.left_3')::uuid;
  assigned_counselor uuid := current_setting('assessment_release.assigned_counselor')::uuid;
  unassigned_counselor uuid := current_setting('assessment_release.unassigned_counselor')::uuid;
  admin_id uuid := current_setting('assessment_release.admin')::uuid;
  super_admin_id uuid := current_setting('assessment_release.super_admin')::uuid;
  actor_id uuid;
begin
  perform set_config('request.jwt.claim.sub',left_a::text,true);
  select count(*) into row_count from public.assessment_responses where attempt_id=attempt_left_a;
  if row_count<>1 then raise exception 'Participant cannot read own response'; end if;
  select count(*) into row_count from public.assessment_responses where attempt_id=attempt_right_a;
  if row_count<>0 then raise exception 'Partner raw answers leaked'; end if;
  select count(*) into row_count from public.assessment_attempt_scores where attempt_id=attempt_left_a;
  if row_count<>1 then raise exception 'Participant own result unavailable'; end if;
  select count(*) into row_count from public.assessment_attempt_scores where attempt_id=attempt_right_a;
  if row_count<>0 then raise exception 'Unreleased partner result leaked'; end if;
  select count(*) into row_count from public.get_partner_assessment_score_history(schedule_a);
  if row_count<>0 then raise exception 'Partner result released before both initial submissions'; end if;
  begin
    perform count(*) from public.get_partner_assessment_score_history(schedule_d);
    raise exception 'Cross-Couple result RPC unexpectedly succeeded';
  exception when others then if sqlerrm<>'Not authorized' then raise; end if; end;
  select count(*) into row_count from public.assessment_attempts attempt
    join public.assessment_participant_assignments assignment on assignment.id=attempt.participant_assignment_id
    where assignment.counseling_case_id=case_d;
  if row_count<>0 then raise exception 'Cross-Couple attempt data leaked'; end if;

  perform set_config('request.jwt.claim.sub',left_c::text,true);
  select count(*) into row_count from public.get_partner_assessment_score_history(schedule_c);
  if row_count<>1 then raise exception 'Partner result not released after both submissions'; end if;

  foreach actor_id in array array[assigned_counselor,admin_id,super_admin_id] loop
    perform set_config('request.jwt.claim.sub',actor_id::text,true);
    select count(*) into row_count from public.assessment_attempt_scores where attempt_id=attempt_left_c;
    if row_count<>1 then raise exception 'Authorized staff result summary unavailable'; end if;
    select count(*) into row_count from public.assessment_responses where attempt_id=attempt_left_c;
    if row_count<>0 then raise exception 'Staff role can read private raw answers'; end if;
  end loop;

  perform set_config('request.jwt.claim.sub',unassigned_counselor::text,true);
  select count(*) into row_count from public.assessment_attempt_scores where attempt_id=attempt_left_c;
  if row_count<>0 then raise exception 'Unassigned Counselor can read results'; end if;
  select count(*) into row_count from public.assessment_attempts attempt
    join public.assessment_participant_assignments assignment on assignment.id=attempt.participant_assignment_id
    where assignment.counseling_case_id=case_a;
  if row_count<>0 then raise exception 'Unassigned Counselor can read attempt status'; end if;
  begin
    perform count(*) from public.get_case_assessment_catalog(case_a);
    raise exception 'Unassigned Counselor catalog access unexpectedly succeeded';
  exception when others then if sqlerrm<>'Not authorized' then raise; end if; end;
end;
$$;
reset role;

rollback;
