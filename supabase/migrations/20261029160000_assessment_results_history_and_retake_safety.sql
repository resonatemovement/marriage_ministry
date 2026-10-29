-- Keep voluntary retake initiation idempotent while an earlier retake is open.
create or replace function public.start_assessment_attempt(target_participant_assignment_id uuid, voluntary_retake boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  assignment_row public.assessment_participant_assignments%rowtype;
  next_attempt_number integer;
  attempt_id uuid;
begin
  if actor is null then raise exception 'Not authorized'; end if;
  select * into assignment_row
  from public.assessment_participant_assignments
  where id = target_participant_assignment_id and profile_id = actor
  for update;
  if not found then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.assessment_case_schedules schedule
    where schedule.id = assignment_row.assessment_schedule_id and schedule.case_session_id is not null
  ) then raise exception 'Assessment is not active yet'; end if;
  if voluntary_retake then
    if not exists (
      select 1 from public.assessment_attempts
      where participant_assignment_id = assignment_row.id and attempt_number = 1 and status = 'submitted'
    ) then raise exception 'Complete the initial Assessment before starting a retake'; end if;
    -- The assignment row lock serializes repeated/concurrent requests. Resume
    -- the current open retake rather than creating duplicate active attempts.
    select id into attempt_id
    from public.assessment_attempts
    where participant_assignment_id = assignment_row.id and attempt_number > 1 and status = 'in_progress'
    order by attempt_number desc
    limit 1;
    if attempt_id is not null then return attempt_id; end if;
    select coalesce(max(attempt_number), 1) + 1 into next_attempt_number
    from public.assessment_attempts where participant_assignment_id = assignment_row.id;
  else
    next_attempt_number := 1;
  end if;
  insert into public.assessment_attempts(participant_assignment_id, profile_id, attempt_number)
  values(assignment_row.id, actor, next_attempt_number)
  on conflict (participant_assignment_id, attempt_number) do nothing
  returning id into attempt_id;
  if attempt_id is null and not voluntary_retake then
    select id into attempt_id from public.assessment_attempts
    where participant_assignment_id = assignment_row.id and attempt_number = 1;
  end if;
  return attempt_id;
end;
$$;

-- The previous RPC exposed the latest five partner attempts. Keep its
-- authenticated, schedule-scoped contract but return only the latest completed
-- result and partner display name, after both initial submissions.
drop function public.get_partner_assessment_score_history(uuid);
create function public.get_partner_assessment_score_history(target_schedule_id uuid)
returns table(partner_name text, submitted_at timestamptz, category_key text, category_label text, score integer, rank integer, is_primary boolean)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); own_assignment_id uuid; partner_assignment_id uuid; partner_profile_id uuid; partner_display_name text;
begin
  if actor is null or not private.current_user_has_role(array['couple']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select own_assignment.id into own_assignment_id
  from public.assessment_case_schedules schedule
  join public.assessment_participant_assignments own_assignment
    on own_assignment.assessment_schedule_id = schedule.id and own_assignment.profile_id = actor
  where schedule.id = target_schedule_id and schedule.case_session_id is not null;
  if own_assignment_id is null then raise exception 'Not authorized'; end if;
  select other_assignment.id, other_assignment.profile_id
  into partner_assignment_id, partner_profile_id
  from public.assessment_participant_assignments other_assignment
  where other_assignment.assessment_schedule_id = target_schedule_id and other_assignment.profile_id <> actor;
  if partner_assignment_id is null then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.assessment_attempts own_initial
    where own_initial.participant_assignment_id = own_assignment_id and own_initial.attempt_number = 1 and own_initial.status = 'submitted'
  ) or not exists (
    select 1 from public.assessment_attempts partner_initial
    where partner_initial.participant_assignment_id = partner_assignment_id and partner_initial.attempt_number = 1 and partner_initial.status = 'submitted'
  ) then return; end if;
  select nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), '')
  into partner_display_name from public.profiles profile where profile.id = partner_profile_id;
  return query
    with latest as (
      select attempt.id, attempt.submitted_at
      from public.assessment_attempts attempt
      where attempt.participant_assignment_id = partner_assignment_id and attempt.status = 'submitted'
      order by attempt.attempt_number desc
      limit 1
    )
    select partner_display_name, latest.submitted_at, category.category_key, category.label,
      result.score, result.rank, result.is_primary
    from latest
    join public.assessment_attempt_scores result on result.attempt_id = latest.id
    join public.assessment_categories category on category.id = result.category_id
    order by result.rank, category.position;
end;
$$;

revoke all on function public.get_partner_assessment_score_history(uuid) from public, anon;
grant execute on function public.get_partner_assessment_score_history(uuid) to authenticated;
