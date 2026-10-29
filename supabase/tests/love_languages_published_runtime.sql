-- DEV-only rollback test for the imported Love Languages v1 and the existing
-- Couple assignment/response/scoring contracts. It creates no durable answers or results.
-- Run with: supabase db query --linked --project-ref <DEV_REF> --file supabase/tests/love_languages_published_runtime.sql

begin;

do $$
declare
  target_schedule_id uuid;
  assignment_one_id uuid;
  participant_one_id uuid;
  assignment_two_id uuid;
  participant_two_id uuid;
begin
  select schedule.id into target_schedule_id
  from public.assessment_case_schedules schedule
  join public.case_sessions case_session on case_session.id = schedule.case_session_id and case_session.status = 'active'
  where schedule.assessment_version_id = (
      select version.id from public.assessment_versions version
      join public.assessment_definitions definition on definition.id = version.assessment_id
      where definition.slug = 'love_languages' and version.version_number = 1 and version.status = 'published'
    )
  order by schedule.id
  limit 1;

  select assignment.id, assignment.profile_id into assignment_one_id, participant_one_id
  from public.assessment_participant_assignments assignment
  where assignment.assessment_schedule_id = target_schedule_id
    and not exists (
      select 1 from public.assessment_attempts attempt where attempt.participant_assignment_id = assignment.id
    )
  order by assignment.id
  limit 1;

  select assignment.id, assignment.profile_id into assignment_two_id, participant_two_id
  from public.assessment_participant_assignments assignment
  where assignment.assessment_schedule_id = target_schedule_id
    and assignment.profile_id <> participant_one_id
    and not exists (
      select 1 from public.assessment_attempts attempt where attempt.participant_assignment_id = assignment.id
    )
  order by assignment.id
  limit 1;

  if target_schedule_id is null or assignment_one_id is null or participant_one_id is null
    or assignment_two_id is null or participant_two_id is null then
    raise exception 'No eligible rollback-only Couple pair for published Love Languages v1';
  end if;

  perform set_config('assessment_test.schedule_id', target_schedule_id::text, true);
  perform set_config('assessment_test.assignment_one_id', assignment_one_id::text, true);
  perform set_config('assessment_test.participant_one_id', participant_one_id::text, true);
  perform set_config('assessment_test.assignment_two_id', assignment_two_id::text, true);
  perform set_config('assessment_test.participant_two_id', participant_two_id::text, true);
  perform set_config('request.jwt.claim.sub', participant_one_id::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  schedule_id uuid := nullif(current_setting('assessment_test.schedule_id'), '')::uuid;
  assignment_one_id uuid := nullif(current_setting('assessment_test.assignment_one_id'), '')::uuid;
  participant_one_id uuid := nullif(current_setting('assessment_test.participant_one_id'), '')::uuid;
  assignment_two_id uuid := nullif(current_setting('assessment_test.assignment_two_id'), '')::uuid;
  participant_two_id uuid := nullif(current_setting('assessment_test.participant_two_id'), '')::uuid;
  attempt_one_id uuid;
  attempt_two_id uuid;
  response_row record;
  score_count integer;
  score_total integer;
  highest_score integer;
  primary_count integer;
begin
  attempt_one_id := public.start_assessment_attempt(assignment_one_id, false);

  for response_row in
    select question.id as question_id, choice.id as choice_id
    from public.assessment_participant_assignments assignment
    join public.assessment_case_schedules schedule on schedule.id = assignment.assessment_schedule_id
    join public.assessment_questions question on question.assessment_version_id = schedule.assessment_version_id
    join public.assessment_choices choice on choice.question_id = question.id and choice.position = 0
    where assignment.id = assignment_one_id
    order by question.position
  loop
    perform public.save_assessment_response(attempt_one_id, response_row.question_id, response_row.choice_id);
  end loop;

  perform public.submit_assessment_attempt(attempt_one_id);

  select count(*)::integer, coalesce(sum(score), 0)::integer, coalesce(max(score), 0)::integer,
    count(*) filter (where is_primary)::integer
  into score_count, score_total, highest_score, primary_count
  from public.assessment_attempt_scores
  where attempt_id = attempt_one_id;

  if score_count <> 5 or score_total <> 30 or highest_score > 12 or primary_count <> 1 then
    raise exception 'Published Love Languages v1 did not produce five valid scores totaling 30 with one Primary';
  end if;
  if not exists (
    select 1 from public.assessment_attempts
    where id = attempt_one_id and status = 'submitted' and submitted_at is not null
  ) then raise exception 'Published Love Languages v1 attempt was not submitted'; end if;

  perform set_config('request.jwt.claim.sub', participant_two_id::text, true);
  attempt_two_id := public.start_assessment_attempt(assignment_two_id, false);
  for response_row in
    select question.id as question_id, choice.id as choice_id
    from public.assessment_participant_assignments assignment
    join public.assessment_case_schedules schedule on schedule.id = assignment.assessment_schedule_id
    join public.assessment_questions question on question.assessment_version_id = schedule.assessment_version_id
    join public.assessment_choices choice
      on choice.question_id = question.id
      and choice.position = case when question.position = 29 then 1 else 0 end
    where assignment.id = assignment_two_id
    order by question.position
  loop
    perform public.save_assessment_response(attempt_two_id, response_row.question_id, response_row.choice_id);
  end loop;
  perform public.submit_assessment_attempt(attempt_two_id);

  select count(*)::integer, coalesce(sum(score), 0)::integer, coalesce(max(score), 0)::integer,
    count(*) filter (where is_primary)::integer
  into score_count, score_total, highest_score, primary_count
  from public.assessment_attempt_scores
  where attempt_id = attempt_two_id;

  if score_count <> 5 or score_total <> 30 or highest_score > 12 or primary_count <> 2 then
    raise exception 'Published Love Languages v1 did not preserve multiple tied Primary categories';
  end if;
  if not exists (
    select 1 from public.assessment_attempts
    where id = attempt_two_id and status = 'submitted' and submitted_at is not null
  ) then raise exception 'Second published Love Languages v1 attempt was not submitted'; end if;

  perform set_config('request.jwt.claim.sub', participant_one_id::text, true);
  if (select count(*) from public.get_partner_assessment_score_history(schedule_id)) <> 5 then
    raise exception 'Published Love Languages v1 partner scores were not shared after both initial submissions';
  end if;
end;
$$;

rollback;
