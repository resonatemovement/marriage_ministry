create or replace function public.submit_assessment_attempt(target_attempt_id uuid)
returns table(category_key text, category_label text, score integer, rank integer, is_primary boolean)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  attempt_row public.assessment_attempts%rowtype;
  version_id uuid;
  expected_question_count integer;
  response_count integer;
  max_score integer;
begin
  if actor is null then raise exception 'Not authorized'; end if;
  select * into attempt_row from public.assessment_attempts attempt
  where attempt.id = target_attempt_id and attempt.profile_id = actor for update;
  if not found then raise exception 'Not authorized'; end if;
  if attempt_row.status = 'submitted' then
    return query select category.category_key, category.label, result.score, result.rank, result.is_primary
      from public.assessment_attempt_scores result
      join public.assessment_categories category on category.id = result.category_id
      where result.attempt_id = target_attempt_id order by result.rank, category.position;
    return;
  end if;

  select schedule.assessment_version_id into version_id
  from public.assessment_participant_assignments participant_assignment
  join public.assessment_case_schedules schedule on schedule.id = participant_assignment.assessment_schedule_id
  where participant_assignment.id = attempt_row.participant_assignment_id and schedule.case_session_id is not null;
  if version_id is null then raise exception 'Assessment is not active yet'; end if;

  select count(*)::integer into expected_question_count
  from public.assessment_questions question where question.assessment_version_id = version_id;
  select count(*)::integer into response_count
  from public.assessment_responses response
  join public.assessment_questions question on question.id = response.question_id and question.assessment_version_id = version_id
  where response.attempt_id = target_attempt_id and response.profile_id = actor;
  if expected_question_count = 0 or response_count <> expected_question_count then raise exception 'Answer every question before submitting'; end if;
  if exists (
    select 1 from public.assessment_questions question
    where question.assessment_version_id = version_id
      and not exists (
        select 1 from public.assessment_responses response
        where response.attempt_id = target_attempt_id and response.question_id = question.id and response.profile_id = actor
      )
  ) then raise exception 'Answer every question before submitting'; end if;

  insert into public.assessment_attempt_scores(attempt_id, assessment_version_id, category_id, score, rank, is_primary)
  with category_scores as (
    select category.id as category_id, category.category_key, category.position,
      count(response.choice_id) filter (where choice_score.choice_id is not null)::integer as score
    from public.assessment_categories category
    left join public.assessment_choice_scores choice_score on choice_score.category_id = category.id
    left join public.assessment_responses response on response.attempt_id = target_attempt_id and response.choice_id = choice_score.choice_id and response.profile_id = actor
    where category.assessment_version_id = version_id
    group by category.id, category.category_key, category.position
  ), ranked as (
    select category_scores.category_id, category_scores.score,
      dense_rank() over (order by category_scores.score desc, category_scores.position) as category_rank,
      max(category_scores.score) over () as maximum_score
    from category_scores
  )
  select target_attempt_id, version_id, ranked.category_id, ranked.score, ranked.category_rank,
    ranked.score = ranked.maximum_score
  from ranked;

  select coalesce(sum(result.score), 0)::integer, coalesce(max(result.score), 0)::integer
    into response_count, max_score
  from public.assessment_attempt_scores result where result.attempt_id = target_attempt_id;
  if response_count <> expected_question_count then raise exception 'Assessment scoring did not produce the expected total'; end if;
  if (select count(*) from public.assessment_attempt_scores result where result.attempt_id = target_attempt_id) <> 5
    or (select count(*) from public.assessment_attempt_scores result where result.attempt_id = target_attempt_id and result.score > 12) > 0
    then raise exception 'Assessment scoring results are invalid'; end if;

  update public.assessment_attempts set status = 'submitted', submitted_at = now()
  where id = target_attempt_id;
  return query select category.category_key, category.label, result.score, result.rank, result.is_primary
    from public.assessment_attempt_scores result
    join public.assessment_categories category on category.id = result.category_id
    where result.attempt_id = target_attempt_id order by result.rank, category.position;
end;
$$;
