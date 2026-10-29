-- DEV-only focused contract test. Run with `supabase db query --linked --project-ref <DEV_REF> --file supabase/tests/assessments_foundation_runtime.sql`.
-- All fixtures and assertions run in one transaction and are rolled back at the end.
begin;

-- Capture existing actors and two active Cases with an active Session 1, but do not mutate them.
select set_config('assessment_test.admin', (
  select profile.id::text from public.profiles profile join public.profile_roles role_map on role_map.profile_id = profile.id
  where profile.status = 'active' and role_map.role = 'admin' order by profile.id limit 1
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
select set_config('assessment_test.session_1', (select id::text from public.sessions where sequence_number = 1 and status = 'published' order by id limit 1), true);
select set_config('assessment_test.session_10', (select id::text from public.sessions where sequence_number = 10 and status = 'published' order by id limit 1), true);
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
  version_1 uuid := nullif(current_setting('assessment_test.version_1'), '')::uuid;
begin
  if nullif(current_setting('assessment_test.admin'), '') is null
    or nullif(current_setting('assessment_test.super_admin'), '') is null
    or case_a is null or case_b is null or session_1 is null or session_10 is null or version_1 is null then
    raise exception 'Assessment runtime test preconditions are not met';
  end if;
  if exists (select 1 from public.assessment_questions where assessment_version_id = version_1)
    or exists (select 1 from public.assessment_choices choice join public.assessment_questions question on question.id = choice.question_id where question.assessment_version_id = version_1) then
    raise exception 'Love Languages draft version 1 is not empty; refusing to alter existing test content';
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
  perform public.publish_assessment_version(version_1);

  schedule_a := public.configure_case_assessment_schedule(case_a, assessment_id, version_1, session_1);
  perform set_config('assessment_test.schedule_a', schedule_a::text, true);
  perform set_config('request.jwt.claim.sub', super_admin_id::text, true);
  schedule_b := public.configure_case_assessment_schedule(case_b, assessment_id, version_1, session_1);
  perform set_config('assessment_test.schedule_b', schedule_b::text, true);
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
  unauthorized_counselor uuid := nullif(current_setting('assessment_test.unauthorized_counselor'), '')::uuid;
  schedule_a uuid := nullif(current_setting('assessment_test.schedule_a'), '')::uuid;
  schedule_b uuid := nullif(current_setting('assessment_test.schedule_b'), '')::uuid;
  assignment_a uuid := nullif(current_setting('assessment_test.assignment_a'), '')::uuid;
  assignment_b uuid := nullif(current_setting('assessment_test.assignment_b'), '')::uuid;
  attempt_a uuid;
  attempt_a_again uuid;
  attempt_b uuid;
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
  select count(*) into row_count from public.submit_assessment_attempt(attempt_a);
  if row_count <> 5 or (select count(*) from public.assessment_attempt_scores result where result.attempt_id = attempt_a) <> 5 then
    raise exception 'Resubmitting a submitted attempt duplicated or lost result rows';
  end if;
  rejected := false;
  begin perform public.save_assessment_response(attempt_a, (select id from public.assessment_questions where assessment_version_id = version_1 order by position limit 1), (select id from public.assessment_choices where assessment_version_id = version_1 order by question_id, position limit 1)); exception when others then rejected := sqlerrm = 'Submitted Assessment responses are read-only'; end;
  if not rejected then raise exception 'Submitted responses were not immutable'; end if;

  -- Partner score sharing is denied until both initial assessments are submitted.
  rejected := false;
  begin perform count(*) from public.get_partner_assessment_score_history(schedule_a); exception when others then rejected := sqlerrm = 'Partner results are available after both initial Assessments are submitted'; end;
  if not rejected then raise exception 'Partner results were shared before both initial submissions'; end if;

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
  if row_count <> 5 then raise exception 'Partner score history was unavailable after both initial submissions'; end if;
  rejected := false;
  begin perform count(*) from public.get_partner_assessment_score_history(schedule_b); exception when others then rejected := sqlerrm = 'Not authorized'; end;
  if not rejected then raise exception 'Couple read a different Case''s Assessment scores'; end if;

  -- Counselor can see result status/scores for the assigned Case but not individual answers.
  perform set_config('request.jwt.claim.sub', counselor_a::text, true);
  select count(*) into row_count from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b);
  if row_count <> 2 then raise exception 'Assigned Counselor could not read both attempt statuses'; end if;
  select count(*) into row_count from public.assessment_attempt_scores result where result.attempt_id in (attempt_a, attempt_b);
  if row_count <> 10 then raise exception 'Assigned Counselor could not read result history'; end if;
  select count(*) into row_count from public.assessment_responses response where response.attempt_id in (attempt_a, attempt_b);
  if row_count <> 0 then raise exception 'Counselor could read individual answers'; end if;

  perform set_config('request.jwt.claim.sub', unauthorized_counselor::text, true);
  select count(*) into row_count from public.assessment_attempts attempt where attempt.participant_assignment_id in (assignment_a, assignment_b);
  if row_count <> 0 then raise exception 'Unassigned Counselor read Assessment attempts'; end if;
  select count(*) into row_count from public.assessment_attempt_scores result where result.attempt_id in (attempt_a, attempt_b);
  if row_count <> 0 then raise exception 'Unassigned Counselor read Assessment results'; end if;
end;
$$;

reset role;
rollback;
