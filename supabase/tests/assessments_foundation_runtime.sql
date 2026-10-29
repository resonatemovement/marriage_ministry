-- DEV-only focused contract test. Run with `supabase db query --linked --project-ref <DEV_REF> --file supabase/tests/assessments_foundation_runtime.sql`.
-- All fixtures and assertions run in one transaction and are rolled back at the end.
begin;

-- Capture existing actors, two active Session 1 Cases, and one Case awaiting its first Session.
select set_config('assessment_test.admin', (
  select profile.id::text from public.profiles profile join public.profile_roles role_map on role_map.profile_id = profile.id
  where profile.status = 'active' and role_map.role = 'admin'
    and not exists (select 1 from public.profile_roles counselor_role where counselor_role.profile_id = profile.id and counselor_role.role = 'counselor')
  order by profile.id limit 1
), true);
select set_config('assessment_test.super_admin', (
  select profile.id::text from public.profiles profile join public.profile_roles role_map on role_map.profile_id = profile.id
  where profile.status = 'active' and role_map.role = 'super_admin' order by profile.id limit 1
), true);
select set_config('assessment_test.case_a', (
  select counseling_case.id::text from public.counseling_cases counseling_case
  join public.case_sessions case_session on case_session.counseling_case_id = counseling_case.id and case_session.status = 'active'
  join public.sessions session on session.id = case_session.session_id and session.sequence_number = 1
  where counseling_case.closed_at is null
    and exists (select 1 from public.case_assignments assignment where assignment.counseling_case_id = counseling_case.id and assignment.assignment_type = 'counselor' and assignment.ended_at is null)
    and (select count(*) from public.group_members member where member.group_id = counseling_case.couple_group_id and member.ended_at is null) = 2
  order by counseling_case.id limit 1
), true);
select set_config('assessment_test.case_b', (
  select counseling_case.id::text from public.counseling_cases counseling_case
  join public.case_sessions case_session on case_session.counseling_case_id = counseling_case.id and case_session.status = 'active'
  join public.sessions session on session.id = case_session.session_id and session.sequence_number = 1
  where counseling_case.closed_at is null
    and counseling_case.id <> nullif(current_setting('assessment_test.case_a'), '')::uuid
    and exists (select 1 from public.case_assignments assignment where assignment.counseling_case_id = counseling_case.id and assignment.assignment_type = 'counselor' and assignment.ended_at is null)
    and (select count(*) from public.group_members member where member.group_id = counseling_case.couple_group_id and member.ended_at is null) = 2
  order by counseling_case.id limit 1
), true);
select set_config('assessment_test.initial_case', (
  select counseling_case.id::text from public.counseling_cases counseling_case
  join public.case_session_meetings initial_meeting on initial_meeting.counseling_case_id = counseling_case.id
    and initial_meeting.session_id is null and initial_meeting.completed_at is null
  where counseling_case.closed_at is null
    and not exists (select 1 from public.case_sessions case_session where case_session.counseling_case_id = counseling_case.id)
    and exists (select 1 from public.case_assignments assignment where assignment.counseling_case_id = counseling_case.id and assignment.assignment_type = 'counselor' and assignment.ended_at is null)
    and (select count(*) from public.group_members member where member.group_id = counseling_case.couple_group_id and member.ended_at is null) = 2
    and not exists (select 1 from public.assessment_case_schedules schedule where schedule.counseling_case_id = counseling_case.id)
  order by counseling_case.id limit 1
), true);
select set_config('assessment_test.initial_counselor', (
  select member.profile_id::text from public.case_assignments assignment
  join public.group_members member on member.group_id = assignment.assigned_group_id and member.ended_at is null
  where assignment.counseling_case_id = nullif(current_setting('assessment_test.initial_case'), '')::uuid
    and assignment.assignment_type = 'counselor' and assignment.ended_at is null
  order by member.profile_id limit 1
), true);
select set_config('assessment_test.case_b_counselor', (
  select member.profile_id::text from public.case_assignments assignment
  join public.group_members member on member.group_id = assignment.assigned_group_id and member.ended_at is null
  where assignment.counseling_case_id = nullif(current_setting('assessment_test.case_b'), '')::uuid
    and assignment.assignment_type = 'counselor' and assignment.ended_at is null
  order by member.profile_id limit 1
), true);
select set_config('assessment_test.session_1', (select id::text from public.sessions where sequence_number = 1 and status = 'published' order by id limit 1), true);
select set_config('assessment_test.session_10', (select id::text from public.sessions where sequence_number = 10 and status = 'published' order by id limit 1), true);
select set_config('assessment_test.session_final', (select id::text from public.sessions where is_final and status = 'published' order by id limit 1), true);
select set_config('assessment_test.session_1_material', (
  select block.id::text from public.session_material_blocks block
  where block.session_id = nullif(current_setting('assessment_test.session_1'), '')::uuid
  order by block.position limit 1
), true);
select set_config('assessment_test.session_10_material', (
  select block.id::text from public.session_material_blocks block
  where block.session_id = nullif(current_setting('assessment_test.session_10'), '')::uuid
  order by block.position limit 1
), true);
select set_config('assessment_test.session_final_material', (
  select block.id::text from public.session_material_blocks block
  where block.session_id = nullif(current_setting('assessment_test.session_final'), '')::uuid
  order by block.position limit 1
), true);
select set_config('assessment_test.version_1', (
  select version.id::text from public.assessment_versions version join public.assessment_definitions definition on definition.id = version.assessment_id
  where definition.slug = 'love_languages' and version.version_number = 1 and version.status = 'draft'
), true);
select set_config('assessment_test.assessment_id', (select id::text from public.assessment_definitions where slug = 'love_languages'), true);

do $$
declare
  case_a uuid := nullif(current_setting('assessment_test.case_a'), '')::uuid;
  case_b uuid := nullif(current_setting('assessment_test.case_b'), '')::uuid;
  session_1 uuid := nullif(current_setting('assessment_test.session_1'), '')::uuid;
  session_10 uuid := nullif(current_setting('assessment_test.session_10'), '')::uuid;
  session_final uuid := nullif(current_setting('assessment_test.session_final'), '')::uuid;
  version_1 uuid := nullif(current_setting('assessment_test.version_1'), '')::uuid;
begin
  if nullif(current_setting('assessment_test.admin'), '') is null
    or nullif(current_setting('assessment_test.super_admin'), '') is null
    or case_a is null or case_b is null or nullif(current_setting('assessment_test.initial_case'), '') is null
    or nullif(current_setting('assessment_test.initial_counselor'), '') is null
    or nullif(current_setting('assessment_test.case_b_counselor'), '') is null
    or session_1 is null or session_10 is null or session_final is null or version_1 is null then
    raise exception 'Assessment runtime test preconditions are not met';
  end if;
  if exists (select 1 from public.assessment_questions where assessment_version_id = version_1)
    or exists (select 1 from public.assessment_choices choice join public.assessment_questions question on question.id = choice.question_id where question.assessment_version_id = version_1) then
    raise exception 'Love Languages draft version 1 is not empty; refusing to alter existing test content';
  end if;
  if exists (select 1 from public.assessment_versions where status = 'published')
    or not private.assessment_initial_requirements_complete((
      select case_session.id from public.case_sessions case_session
      where case_session.counseling_case_id = case_a and case_session.status = 'active'
    )) then
    raise exception 'An unavailable Assessment version blocked Session progression';
  end if;
end;
$$;

-- Synthetic versions exercise valid and rejected publishing without using copyrighted prompts.
with inserted as (
  insert into public.assessment_versions(assessment_id, version_number, status)
  values (nullif(current_setting('assessment_test.assessment_id'), '')::uuid, 2, 'draft'),
         (nullif(current_setting('assessment_test.assessment_id'), '')::uuid, 3, 'draft'),
         (nullif(current_setting('assessment_test.assessment_id'), '')::uuid, 4, 'draft'),
         (nullif(current_setting('assessment_test.assessment_id'), '')::uuid, 5, 'draft')
  returning id, version_number
)
select set_config('assessment_test.version_' || version_number::text, id::text, true) from inserted;

insert into public.assessment_categories(assessment_version_id, category_key, label, position)
select version_id, category.category_key, category.label, category.position
from unnest(array[
  nullif(current_setting('assessment_test.version_2'), '')::uuid,
  nullif(current_setting('assessment_test.version_3'), '')::uuid,
  nullif(current_setting('assessment_test.version_4'), '')::uuid
]) version_id
cross join (values
  ('words_of_affirmation', 'Words of Affirmation', 0),
  ('quality_time', 'Quality Time', 1),
  ('receiving_gifts', 'Receiving Gifts', 2),
  ('acts_of_service', 'Acts of Service', 3),
  ('physical_touch', 'Physical Touch', 4)
) category(category_key, label, position);

insert into public.assessment_categories(assessment_version_id, category_key, label, position)
values
  (nullif(current_setting('assessment_test.version_5'), '')::uuid, 'words_of_affirmation', 'Words of Affirmation', 0),
  (nullif(current_setting('assessment_test.version_5'), '')::uuid, 'quality_time', 'Quality Time', 1),
  (nullif(current_setting('assessment_test.version_5'), '')::uuid, 'receiving_gifts', 'Receiving Gifts', 2),
  (nullif(current_setting('assessment_test.version_5'), '')::uuid, 'acts_of_service', 'Acts of Service', 3),
  (nullif(current_setting('assessment_test.version_5'), '')::uuid, 'unapproved_key', 'Synthetic Unapproved Category', 4);

insert into public.assessment_questions(assessment_version_id, position, prompt)
select version_id, question_number, 'Synthetic assessment question ' || question_number
from (values
  (nullif(current_setting('assessment_test.version_1'), '')::uuid, 30),
  (nullif(current_setting('assessment_test.version_2'), '')::uuid, 29),
  (nullif(current_setting('assessment_test.version_3'), '')::uuid, 30),
  (nullif(current_setting('assessment_test.version_4'), '')::uuid, 30),
  (nullif(current_setting('assessment_test.version_5'), '')::uuid, 30)
) version_fixture(version_id, question_count)
cross join lateral generate_series(0, question_count - 1) question_number;

insert into public.assessment_choices(assessment_version_id, question_id, position, label)
select question.assessment_version_id, question.id, choice_position, 'Synthetic choice ' || choice_position
from public.assessment_questions question
cross join lateral generate_series(
  0,
  case when question.assessment_version_id = nullif(current_setting('assessment_test.version_3'), '')::uuid and question.position = 29 then 0 else 1 end
) choice_position
where question.assessment_version_id in (
  nullif(current_setting('assessment_test.version_1'), '')::uuid,
  nullif(current_setting('assessment_test.version_2'), '')::uuid,
  nullif(current_setting('assessment_test.version_3'), '')::uuid,
  nullif(current_setting('assessment_test.version_4'), '')::uuid,
  nullif(current_setting('assessment_test.version_5'), '')::uuid
);

insert into public.assessment_choice_scores(choice_id, assessment_version_id, category_id)
select choice.id, choice.assessment_version_id, category.id
from public.assessment_choices choice
join public.assessment_questions question on question.id = choice.question_id
join public.assessment_categories category
  on category.assessment_version_id = choice.assessment_version_id
  and category.position = case
    when choice.assessment_version_id = nullif(current_setting('assessment_test.version_4'), '')::uuid and question.position < 13 then 0
    else (question.position + choice.position) % 5
  end
where choice.assessment_version_id in (
  nullif(current_setting('assessment_test.version_1'), '')::uuid,
  nullif(current_setting('assessment_test.version_2'), '')::uuid,
  nullif(current_setting('assessment_test.version_3'), '')::uuid,
  nullif(current_setting('assessment_test.version_4'), '')::uuid,
  nullif(current_setting('assessment_test.version_5'), '')::uuid
);

set local role authenticated;

do $$
declare
  admin_id uuid := nullif(current_setting('assessment_test.admin'), '')::uuid;
  super_admin_id uuid := nullif(current_setting('assessment_test.super_admin'), '')::uuid;
  case_a uuid := nullif(current_setting('assessment_test.case_a'), '')::uuid;
  case_b uuid := nullif(current_setting('assessment_test.case_b'), '')::uuid;
  session_1 uuid := nullif(current_setting('assessment_test.session_1'), '')::uuid;
  session_10 uuid := nullif(current_setting('assessment_test.session_10'), '')::uuid;
  session_final uuid := nullif(current_setting('assessment_test.session_final'), '')::uuid;
  version_1 uuid := nullif(current_setting('assessment_test.version_1'), '')::uuid;
  version_2 uuid := nullif(current_setting('assessment_test.version_2'), '')::uuid;
  version_3 uuid := nullif(current_setting('assessment_test.version_3'), '')::uuid;
  version_4 uuid := nullif(current_setting('assessment_test.version_4'), '')::uuid;
  version_5 uuid := nullif(current_setting('assessment_test.version_5'), '')::uuid;
  assessment_id uuid := nullif(current_setting('assessment_test.assessment_id'), '')::uuid;
  schedule_a uuid;
  schedule_b uuid;
  rejected boolean;
begin
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  rejected := false;
  begin perform public.publish_assessment_version(version_2); exception when others then rejected := sqlerrm = 'Love Languages requires exactly 30 questions'; end;
  if not rejected then raise exception 'Publishing 29 Love Languages questions was not rejected'; end if;
  rejected := false;
  begin perform public.publish_assessment_version(version_3); exception when others then rejected := sqlerrm = 'Every paired-choice question must have exactly two choices'; end;
  if not rejected then raise exception 'Publishing a question with one choice was not rejected'; end if;
  rejected := false;
  begin perform public.publish_assessment_version(version_4); exception when others then rejected := sqlerrm = 'Love Languages category maximum cannot exceed 12'; end;
  if not rejected then raise exception 'Publishing a category with 13 possible points was not rejected'; end if;
  rejected := false;
  begin perform public.publish_assessment_version(version_5); exception when others then rejected := sqlerrm = 'Love Languages requires the five approved scoring categories'; end;
  if not rejected then raise exception 'Publishing an invalid Love Languages scoring key was not rejected'; end if;
  perform set_config('request.jwt.claim.sub', current_setting('assessment_test.case_b_counselor'), true);
  perform public.set_assessment_counselor_preference(assessment_id, session_final);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.publish_assessment_version(version_1);

  schedule_a := public.configure_case_assessment_schedule(case_a, assessment_id, version_1, session_1);
  perform set_config('assessment_test.schedule_a', schedule_a::text, true);
  select schedule.id into schedule_b from public.assessment_case_schedules schedule
  where schedule.counseling_case_id = case_b
    and schedule.assessment_id = nullif(current_setting('assessment_test.assessment_id'), '')::uuid;
  if schedule_b is null or not exists (
    select 1 from public.assessment_case_schedules schedule
    where schedule.id = schedule_b and schedule.session_id = session_final
      and schedule.schedule_source = 'counselor_preference' and schedule.case_session_id is null
  ) or exists (select 1 from public.assessment_participant_assignments where assessment_schedule_id = schedule_b) then
    raise exception 'Future Counselor preference did not wait for Session activation';
  end if;
  perform set_config('assessment_test.schedule_b', schedule_b::text, true);
  perform set_config('request.jwt.claim.sub', current_setting('assessment_test.initial_counselor'), true);
  perform set_config('assessment_test.initial_case_session', public.activate_first_case_session(
    nullif(current_setting('assessment_test.initial_case'), '')::uuid,
    session_1,
    array[nullif(current_setting('assessment_test.session_1_material'), '')::uuid],
    now() + interval '2 days',
    now() + interval '2 days 1 hour'
  )::text, true);
  if not exists (
    select 1 from public.assessment_case_schedules schedule
    where schedule.counseling_case_id = nullif(current_setting('assessment_test.initial_case'), '')::uuid
      and schedule.case_session_id = nullif(current_setting('assessment_test.initial_case_session'), '')::uuid
      and schedule.progression_case_session_id = nullif(current_setting('assessment_test.initial_case_session'), '')::uuid
  ) or (select count(*) from public.assessment_participant_assignments assignment
    join public.assessment_case_schedules schedule on schedule.id = assignment.assessment_schedule_id
    where schedule.counseling_case_id = nullif(current_setting('assessment_test.initial_case'), '')::uuid) <> 2 then
    raise exception 'First Session activation did not assign both partners';
  end if;
end;
$$;

reset role;

select set_config('assessment_test.couple_a', (
  select member.profile_id::text from public.group_members member join public.counseling_cases counseling_case on counseling_case.couple_group_id = member.group_id
  where counseling_case.id = nullif(current_setting('assessment_test.case_a'), '')::uuid and member.ended_at is null order by member.joined_at, member.profile_id limit 1
), true);
select set_config('assessment_test.couple_b', (
  select member.profile_id::text from public.group_members member join public.counseling_cases counseling_case on counseling_case.couple_group_id = member.group_id
  where counseling_case.id = nullif(current_setting('assessment_test.case_a'), '')::uuid and member.ended_at is null order by member.joined_at desc, member.profile_id desc limit 1
), true);
select set_config('assessment_test.counselor_a', (
  select member.profile_id::text from public.case_assignments assignment join public.group_members member on member.group_id = assignment.assigned_group_id and member.ended_at is null
  where assignment.counseling_case_id = nullif(current_setting('assessment_test.case_a'), '')::uuid and assignment.assignment_type = 'counselor' and assignment.ended_at is null
  order by member.profile_id limit 1
), true);
select set_config('assessment_test.unauthorized_counselor', (
  select profile.id::text from public.profiles profile join public.profile_roles role_map on role_map.profile_id = profile.id and role_map.role = 'counselor'
  where profile.status = 'active'
    and not exists (select 1 from public.case_assignments assignment join public.group_members member on member.group_id = assignment.assigned_group_id and member.ended_at is null where assignment.counseling_case_id in (nullif(current_setting('assessment_test.case_a'), '')::uuid, nullif(current_setting('assessment_test.case_b'), '')::uuid) and assignment.assignment_type = 'counselor' and assignment.ended_at is null and member.profile_id = profile.id)
  order by profile.id limit 1
), true);
select set_config('assessment_test.schedule_a', current_setting('assessment_test.schedule_a'), true);
select set_config('assessment_test.schedule_b', current_setting('assessment_test.schedule_b'), true);
select set_config('assessment_test.assignment_a', (
  select id::text from public.assessment_participant_assignments where assessment_schedule_id = nullif(current_setting('assessment_test.schedule_a'), '')::uuid and profile_id = nullif(current_setting('assessment_test.couple_a'), '')::uuid
), true);
select set_config('assessment_test.assignment_b', (
  select id::text from public.assessment_participant_assignments where assessment_schedule_id = nullif(current_setting('assessment_test.schedule_a'), '')::uuid and profile_id = nullif(current_setting('assessment_test.couple_b'), '')::uuid
), true);

set local role authenticated;

do $$
declare
  case_a uuid := nullif(current_setting('assessment_test.case_a'), '')::uuid;
  case_b uuid := nullif(current_setting('assessment_test.case_b'), '')::uuid;
  session_1 uuid := nullif(current_setting('assessment_test.session_1'), '')::uuid;
  session_10 uuid := nullif(current_setting('assessment_test.session_10'), '')::uuid;
  assessment_id uuid := nullif(current_setting('assessment_test.assessment_id'), '')::uuid;
  version_1 uuid := nullif(current_setting('assessment_test.version_1'), '')::uuid;
  couple_a uuid := nullif(current_setting('assessment_test.couple_a'), '')::uuid;
  couple_b uuid := nullif(current_setting('assessment_test.couple_b'), '')::uuid;
  counselor_a uuid := nullif(current_setting('assessment_test.counselor_a'), '')::uuid;
  admin_id uuid := nullif(current_setting('assessment_test.admin'), '')::uuid;
  unauthorized_counselor uuid := nullif(current_setting('assessment_test.unauthorized_counselor'), '')::uuid;
  schedule_a uuid := nullif(current_setting('assessment_test.schedule_a'), '')::uuid;
  schedule_b uuid := nullif(current_setting('assessment_test.schedule_b'), '')::uuid;
  assignment_a uuid := nullif(current_setting('assessment_test.assignment_a'), '')::uuid;
  assignment_b uuid := nullif(current_setting('assessment_test.assignment_b'), '')::uuid;
  attempt_a uuid;
  attempt_a_again uuid;
  attempt_b uuid;
  retake_b uuid;
  retake_b_again uuid;
  next_retake_b uuid;
  next_retake_b_again uuid;
  question_row record;
  rejected boolean;
  row_count integer;
  score_total integer;
begin
  if couple_a is null or couple_b is null or couple_a = couple_b or counselor_a is null or unauthorized_counselor is null
    or assignment_a is null or assignment_b is null or schedule_a is null or schedule_b is null then
    raise exception 'Assessment runtime actor or assignment is unavailable';
  end if;
  if has_table_privilege('authenticated', 'public.assessment_participant_assignments', 'INSERT')
    or has_table_privilege('authenticated', 'public.assessment_attempts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.assessment_responses', 'INSERT')
    or has_table_privilege('authenticated', 'public.assessment_responses', 'UPDATE')
    or has_table_privilege('authenticated', 'public.assessment_attempt_scores', 'INSERT') then
    raise exception 'Authenticated users have direct Assessment write privileges';
  end if;

  -- A Counselor can manage their assigned active Case, but not an unrelated Case.
  perform set_config('request.jwt.claim.sub', counselor_a::text, true);
  perform public.set_assessment_counselor_preference(assessment_id, session_10);
  if not private.assessment_can_manage_case(case_a) then raise exception 'Assigned Counselor could not manage their Case'; end if;
  if public.configure_case_assessment_schedule(case_a, assessment_id, version_1, null) <> schedule_a then
    raise exception 'Assigned Counselor could not manage the assigned Case schedule';
  end if;
  rejected := false;
  begin perform public.configure_case_assessment_schedule(case_b, assessment_id, version_1, session_1); exception when others then rejected := sqlerrm = 'Not authorized'; end;
  if not rejected then raise exception 'Unassigned Counselor configured another Case'; end if;

  -- Existing schedules do not change when a Counselor preference changes.
  if not exists (select 1 from public.assessment_case_schedules schedule where schedule.id = schedule_a and schedule.session_id = session_1) then
    raise exception 'Counselor preference unexpectedly rewrote the saved Case schedule';
  end if;

  -- Couple users cannot configure schedules; attempts are independent and initial start is idempotent.
  perform set_config('request.jwt.claim.sub', couple_a::text, true);
  rejected := false;
  begin perform public.configure_case_assessment_schedule(case_a, assessment_id, version_1, session_1); exception when others then rejected := sqlerrm = 'Not authorized'; end;
  if not rejected then raise exception 'Couple user configured a Case Assessment'; end if;
  if assignment_a is null or assignment_b is null or assignment_a = assignment_b then raise exception 'Partner assignments are not independent'; end if;
  attempt_a := public.start_assessment_attempt(assignment_a, false);
  attempt_a_again := public.start_assessment_attempt(assignment_a, false);
  if attempt_a is null or attempt_a <> attempt_a_again then raise exception 'Initial attempt creation is not idempotent'; end if;
  rejected := false;
  begin perform public.start_assessment_attempt(assignment_b, false); exception when others then rejected := sqlerrm = 'Not authorized'; end;
  if not rejected then raise exception 'One partner started the other partner''s attempt'; end if;

  for question_row in
    select question.id as question_id, choice.id as choice_id
    from public.assessment_questions question join public.assessment_choices choice on choice.question_id = question.id and choice.position = 0
    where question.assessment_version_id = version_1 order by question.position
  loop
    perform public.save_assessment_response(attempt_a, question_row.question_id, question_row.choice_id);
  end loop;
  select count(*) into row_count from public.assessment_responses response where response.attempt_id = attempt_a;
  if row_count <> 30 then raise exception 'Saved response count was not 30'; end if;
  select count(*) into row_count from public.assessment_attempts attempt where attempt.profile_id <> couple_a;
  if row_count <> 0 then raise exception 'Couple read another participant''s attempt'; end if;
  select count(*) into row_count from public.assessment_responses response where response.profile_id <> couple_a;
  if row_count <> 0 then raise exception 'Couple read another participant''s answers'; end if;
  select count(*), sum(result.score) into row_count, score_total from public.submit_assessment_attempt(attempt_a) result;
  if row_count <> 5 or score_total <> 30 then raise exception 'Server scoring did not return five scores totaling 30'; end if;
  if (select count(*) from public.assessment_attempt_scores result where result.attempt_id = attempt_a and result.is_primary) <> 5 then
    raise exception 'Synthetic equal-score assessment did not mark all five tied categories as Primary';
  end if;
  select count(*) into row_count from public.submit_assessment_attempt(attempt_a);
  if row_count <> 5 or (select count(*) from public.assessment_attempt_scores result where result.attempt_id = attempt_a) <> 5 then
    raise exception 'Resubmitting a submitted attempt duplicated or lost result rows';
  end if;
  rejected := false;
  begin perform public.save_assessment_response(attempt_a, (select id from public.assessment_questions where assessment_version_id = version_1 order by position limit 1), (select id from public.assessment_choices where assessment_version_id = version_1 order by question_id, position limit 1)); exception when others then rejected := sqlerrm = 'Submitted Assessment responses are read-only'; end;
  if not rejected then raise exception 'Submitted responses were not immutable'; end if;

  -- Partner score sharing remains empty until both initial assessments submit.
  select count(*) into row_count from public.get_partner_assessment_score_history(schedule_a);
  if row_count <> 0 then raise exception 'Partner results were shared before both initial submissions'; end if;

  perform set_config('request.jwt.claim.sub', couple_b::text, true);
  attempt_b := public.start_assessment_attempt(assignment_b, false);
  for question_row in
    select question.id as question_id, choice.id as choice_id
    from public.assessment_questions question join public.assessment_choices choice on choice.question_id = question.id and choice.position = 1
    where question.assessment_version_id = version_1 order by question.position
  loop
    perform public.save_assessment_response(attempt_b, question_row.question_id, question_row.choice_id);
  end loop;
  select count(*), sum(result.score) into row_count, score_total from public.submit_assessment_attempt(attempt_b) result;
  if row_count <> 5 or score_total <> 30 then raise exception 'Second server-calculated result is invalid'; end if;
  select count(*) into row_count from public.assessment_attempts attempt where attempt.profile_id <> couple_b;
  if row_count <> 0 then raise exception 'Second Couple member read another participant''s attempt'; end if;
  select count(*) into row_count from public.assessment_responses response where response.profile_id <> couple_b;
  if row_count <> 0 then raise exception 'Second Couple member read another participant''s answers'; end if;
  select count(*) into row_count from public.get_partner_assessment_score_history(schedule_a);
  if row_count <> 5 or not exists (
    select 1 from public.get_partner_assessment_score_history(schedule_a) shared
    where shared.partner_name = (select trim(concat_ws(' ', profile.first_name, profile.last_name)) from public.profiles profile where profile.id = couple_a)
  ) then raise exception 'Partner latest score projection or name was unavailable after both initial submissions'; end if;
  rejected := false;
  begin perform count(*) from public.get_partner_assessment_score_history(schedule_b); exception when others then rejected := sqlerrm = 'Not authorized'; end;
  if not rejected then raise exception 'Couple read a different Case''s Assessment scores'; end if;

  -- Retake starts reuse one active attempt. A submitted retake becomes the
  -- latest shared result, while a later unfinished retake does not replace it.
  retake_b := public.start_assessment_attempt(assignment_b, true);
  retake_b_again := public.start_assessment_attempt(assignment_b, true);
  if retake_b is null or retake_b <> retake_b_again then raise exception 'Repeated retake starts created duplicate active attempts'; end if;
  for question_row in
    select question.id as question_id, choice.id as choice_id
    from public.assessment_questions question join public.assessment_choices choice on choice.question_id = question.id and choice.position = 0
    where question.assessment_version_id = version_1 order by question.position
  loop
    perform public.save_assessment_response(retake_b, question_row.question_id, question_row.choice_id);
  end loop;
  perform public.submit_assessment_attempt(retake_b);
  perform set_config('request.jwt.claim.sub', couple_a::text, true);
  if (select count(*) from public.get_partner_assessment_score_history(schedule_a)) <> 5
    or exists (
      select shared.category_key, shared.score, shared.rank, shared.is_primary
      from public.get_partner_assessment_score_history(schedule_a) shared
      join public.assessment_categories category on category.category_key = shared.category_key and category.assessment_version_id = version_1
      join public.assessment_attempt_scores score on score.attempt_id = retake_b and score.category_id = category.id
      where (shared.score, shared.rank, shared.is_primary) <> (score.score, score.rank, score.is_primary)
    ) then raise exception 'Partner results did not update to the latest completed retake'; end if;
  perform set_config('request.jwt.claim.sub', couple_b::text, true);
  next_retake_b := public.start_assessment_attempt(assignment_b, true);
  next_retake_b_again := public.start_assessment_attempt(assignment_b, true);
  if next_retake_b is null or next_retake_b <> next_retake_b_again
    or (select count(*) from public.assessment_attempts attempt where attempt.participant_assignment_id = assignment_b and attempt.attempt_number > 1 and attempt.status = 'in_progress') <> 1
    then raise exception 'Repeated retake starts created duplicate active attempts'; end if;
  perform set_config('request.jwt.claim.sub', couple_a::text, true);
  if exists (
      select shared.category_key, shared.score
      from public.get_partner_assessment_score_history(schedule_a) shared
      join public.assessment_categories category on category.category_key = shared.category_key and category.assessment_version_id = version_1
      join public.assessment_attempt_scores score on score.attempt_id = retake_b and score.category_id = category.id
      where (shared.score, shared.is_primary) <> (score.score, score.is_primary)
    ) then raise exception 'An unfinished retake replaced the latest completed result'; end if;
  perform set_config('request.jwt.claim.sub', couple_b::text, true);
  select count(*) into row_count from public.assessment_attempts attempt where attempt.participant_assignment_id = assignment_b;
  if row_count <> 3 then raise exception 'Partner could not read personal completed and in-progress attempt history'; end if;
  perform set_config('request.jwt.claim.sub', couple_a::text, true);
  if exists (select 1 from public.assessment_attempts attempt where attempt.participant_assignment_id = assignment_b)
    or exists (select 1 from public.assessment_responses response where response.profile_id = couple_b) then
    raise exception 'Partner could read the other participant''s attempt or answers';
  end if;

  -- Counselor can see result status/scores for the assigned Case but not individual answers.
  perform set_config('request.jwt.claim.sub', counselor_a::text, true);
  select count(*) into row_count from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b);
  if row_count <> 4 then raise exception 'Assigned Counselor could not read all initial and retake statuses'; end if;
  select count(*) into row_count from public.assessment_attempt_scores result
  where result.attempt_id in (select attempt.id from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b));
  if row_count <> 15 then raise exception 'Assigned Counselor could not read result history'; end if;
  select count(*) into row_count from public.assessment_responses response
  where response.attempt_id in (select attempt.id from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b));
  if row_count <> 0 then raise exception 'Counselor could read individual answers'; end if;

  -- Admin-only scheduling capability does not grant participant result access.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select count(*) into row_count from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b);
  if row_count <> 0 then raise exception 'Admin-only user read participant Assessment attempts'; end if;
  select count(*) into row_count from public.assessment_attempt_scores result
  where result.attempt_id in (select attempt.id from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b));
  if row_count <> 0 then raise exception 'Admin-only user read participant Assessment results'; end if;

  perform set_config('request.jwt.claim.sub', unauthorized_counselor::text, true);
  select count(*) into row_count from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b);
  if row_count <> 0 then raise exception 'Unassigned Counselor read Assessment attempts'; end if;
  select count(*) into row_count from public.assessment_attempt_scores result
  where result.attempt_id in (select attempt.id from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b));
  if row_count <> 0 then raise exception 'Unassigned Counselor read Assessment results'; end if;
end;
$$;

reset role;

-- Both initial submissions permit forward progression; no Homework contract is
-- weakened because this test explicitly uses its existing Admin OVERRIDE.
update public.homework_participant_progress progress
set status = 'in_progress', submitted_at = null, reviewed_at = null
where progress.assignment_revision_id = (
  select case_session.homework_assignment_revision_id
  from public.case_sessions case_session
  where case_session.counseling_case_id = nullif(current_setting('assessment_test.case_a'), '')::uuid
    and case_session.status = 'active'
);
update public.homework_participant_progress progress
set status = 'in_progress', submitted_at = null, reviewed_at = null
where progress.assignment_revision_id = (
  select case_session.homework_assignment_revision_id
  from public.case_sessions case_session
  where case_session.counseling_case_id = nullif(current_setting('assessment_test.case_b'), '')::uuid
    and case_session.status = 'active'
);

set local role authenticated;
do $$
declare
  admin_id uuid := nullif(current_setting('assessment_test.admin'), '')::uuid;
  case_a uuid := nullif(current_setting('assessment_test.case_a'), '')::uuid;
  case_b uuid := nullif(current_setting('assessment_test.case_b'), '')::uuid;
  session_10 uuid := nullif(current_setting('assessment_test.session_10'), '')::uuid;
  session_final uuid := nullif(current_setting('assessment_test.session_final'), '')::uuid;
  unauthorized_counselor uuid := nullif(current_setting('assessment_test.unauthorized_counselor'), '')::uuid;
  schedule_b uuid := nullif(current_setting('assessment_test.schedule_b'), '')::uuid;
  counselor_b uuid := nullif(current_setting('assessment_test.case_b_counselor'), '')::uuid;
  counselor_a uuid := nullif(current_setting('assessment_test.counselor_a'), '')::uuid;
  couple_a uuid := nullif(current_setting('assessment_test.couple_a'), '')::uuid;
  schedule_a uuid := nullif(current_setting('assessment_test.schedule_a'), '')::uuid;
  assignment_a uuid := nullif(current_setting('assessment_test.assignment_a'), '')::uuid;
  current_case_session_id uuid;
  next_case_session_id uuid;
  row_count integer;
  rejected boolean;
  couple_ids uuid[];
  couple_id uuid;
  participant_assignment_id uuid;
  attempt_id uuid;
  question_row record;
begin
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select id into current_case_session_id from public.case_sessions
  where counseling_case_id = case_a and status = 'active';
  next_case_session_id := public.complete_case_session_schedule_next(
    current_case_session_id, session_10,
    array[nullif(current_setting('assessment_test.session_10_material'), '')::uuid],
    now() + interval '3 days', now() + interval '3 days 1 hour', 'OVERRIDE'
  );
  if not exists (select 1 from public.case_sessions where id = current_case_session_id and status = 'completed')
    or not exists (select 1 from public.case_sessions where id = next_case_session_id and status = 'active') then
    raise exception 'Both initial Assessment submissions did not permit Session progression';
  end if;

  -- Moving an assigned Assessment preserves old access and history. A voluntary
  -- retake does not add another progression requirement.
  perform set_config('request.jwt.claim.sub', counselor_a::text, true);
  perform public.configure_case_assessment_schedule(
    case_a,
    nullif(current_setting('assessment_test.assessment_id'), '')::uuid,
    nullif(current_setting('assessment_test.version_1'), '')::uuid,
    session_10
  );
  if not exists (
    select 1 from public.assessment_case_schedules schedule
    where schedule.id = schedule_a and schedule.case_session_id = next_case_session_id
      and schedule.progression_case_session_id = next_case_session_id
  ) or (select count(*) from public.assessment_participant_assignments assignment
      where assignment.assessment_schedule_id = schedule_a) <> 2 then
    raise exception 'Rescheduling removed assignments or failed to move the progression gate';
  end if;
  perform set_config('request.jwt.claim.sub', couple_a::text, true);
  select public.start_assessment_attempt(assignment_a, true) into attempt_id;
  if not exists (
    select 1 from public.assessment_attempts attempt
    where attempt.id = attempt_id and attempt.attempt_number = 2 and attempt.status = 'in_progress'
  ) then raise exception 'Rescheduled Assessment was not accessible for a voluntary retake'; end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.complete_counseling_program(next_case_session_id, 'OVERRIDE');
  if not exists (select 1 from public.counseling_cases where id = case_a and closed_at is not null) then
    raise exception 'Incomplete voluntary retake incorrectly blocked final Session completion';
  end if;

  -- The future Counselor-preference schedule waits for the explicitly
  -- designated final Session to activate, then assigns both participants.
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select id into current_case_session_id from public.case_sessions
  where counseling_case_id = case_b and status = 'active';
  perform set_config('request.jwt.claim.sub', unauthorized_counselor::text, true);
  rejected := false;
  begin
    perform public.complete_case_session_schedule_next(
      current_case_session_id, session_10,
      array[nullif(current_setting('assessment_test.session_10_material'), '')::uuid],
      now() + interval '4 days', now() + interval '4 days 1 hour', 'OVERRIDE'
    );
  exception when others then rejected := sqlerrm = 'Not authorized';
  end;
  if not rejected then raise exception 'Unassigned Counselor advanced another Case Session'; end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  next_case_session_id := public.complete_case_session_schedule_next(
    current_case_session_id, session_10,
    array[nullif(current_setting('assessment_test.session_10_material'), '')::uuid],
    now() + interval '4 days', now() + interval '4 days 1 hour', 'OVERRIDE'
  );
  perform set_config('request.jwt.claim.sub', counselor_b::text, true);
  select count(*)::integer into row_count
  from public.assessment_participant_assignments assignment
  where assignment.assessment_schedule_id = schedule_b;
  if row_count <> 2 or not exists (
    select 1 from public.assessment_case_schedules schedule
    where schedule.id = schedule_b and schedule.case_session_id = next_case_session_id
      and schedule.progression_case_session_id = next_case_session_id
      and schedule.session_id = session_final
  ) then raise exception 'Final Session activation did not assign both partners (assignments %, schedule session %, progression session %, activated session %)',
    row_count,
    (select schedule.session_id from public.assessment_case_schedules schedule where schedule.id = schedule_b),
    (select schedule.progression_case_session_id from public.assessment_case_schedules schedule where schedule.id = schedule_b),
    next_case_session_id;
  end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  rejected := false;
  begin perform public.complete_counseling_program(next_case_session_id, 'OVERRIDE');
  exception when others then
    rejected := sqlerrm = 'Both partners must submit the required initial Assessment before completing the program';
  end;
  if not rejected then raise exception 'Admin Homework OVERRIDE bypassed the final Assessment gate'; end if;

  select array_agg(member.profile_id order by member.profile_id) into couple_ids
  from public.group_members member
  join public.counseling_cases counseling_case on counseling_case.couple_group_id = member.group_id
  where counseling_case.id = case_b and member.ended_at is null;
  if couple_ids is null or cardinality(couple_ids) <> 2 then raise exception 'Future Case Couple membership is unavailable'; end if;

  foreach couple_id in array couple_ids loop
    perform set_config('request.jwt.claim.sub', couple_id::text, true);
    select id into participant_assignment_id from public.assessment_participant_assignments
    where assessment_schedule_id = schedule_b and profile_id = couple_id;
    attempt_id := public.start_assessment_attempt(participant_assignment_id, false);
    for question_row in
      select question.id as question_id, choice.id as choice_id
      from public.assessment_questions question
      join public.assessment_choices choice on choice.question_id = question.id and choice.position = 1
      where question.assessment_version_id = nullif(current_setting('assessment_test.version_1'), '')::uuid
      order by question.position
    loop
      perform public.save_assessment_response(attempt_id, question_row.question_id, question_row.choice_id);
    end loop;
    perform public.submit_assessment_attempt(attempt_id);
    if couple_id = couple_ids[1] then
      perform set_config('request.jwt.claim.sub', admin_id::text, true);
      rejected := false;
      begin perform public.complete_counseling_program(next_case_session_id, 'OVERRIDE');
      exception when others then
        rejected := sqlerrm = 'Both partners must submit the required initial Assessment before completing the program';
      end;
      if not rejected then raise exception 'Final completion proceeded after only one partner submitted'; end if;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.complete_counseling_program(next_case_session_id, 'OVERRIDE');
  if not exists (
    select 1 from public.counseling_cases
    where id = case_b and closed_at is not null
  ) then raise exception 'Final Session completion failed after both initial submissions'; end if;
end;
$$;

reset role;
rollback;
