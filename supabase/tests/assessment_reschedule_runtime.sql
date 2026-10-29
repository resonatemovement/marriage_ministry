-- DEV-only transaction test for pinned-version-preserving rescheduling.
-- Uses existing active identities and synthetic schedule/version/attempt rows only.
begin;

do $$
declare
  selected_case_id uuid;
  selected_case_session_id uuid;
  selected_current_session_id uuid;
  selected_future_session_id uuid;
  admin_id uuid;
  counselor_id uuid;
  counselor_partner_id uuid;
  unauthorized_counselor_id uuid;
  couple_id uuid;
  selected_assessment_id uuid;
  version_id uuid;
  next_version_number integer;
begin
  select definition.id into selected_assessment_id from public.assessment_definitions definition where definition.slug = 'love_languages';
  select profile.id into admin_id from public.profiles profile join public.profile_roles role_map on role_map.profile_id = profile.id and role_map.role = 'admin' where profile.status = 'active' order by profile.id limit 1;
  select counseling_case.id, case_session.id, case_session.session_id into selected_case_id, selected_case_session_id, selected_current_session_id
  from public.counseling_cases counseling_case
  join public.case_sessions case_session on case_session.counseling_case_id = counseling_case.id and case_session.status = 'active'
  join public.sessions current_session on current_session.id = case_session.session_id
  where counseling_case.closed_at is null
    and current_session.sequence_number < (select max(sequence_number) from public.sessions where status = 'published')
    and exists (select 1 from public.case_assignments assignment where assignment.counseling_case_id = counseling_case.id and assignment.assignment_type = 'counselor' and assignment.ended_at is null)
    and (select count(*) from public.group_members member where member.group_id = counseling_case.couple_group_id and member.ended_at is null) = 2
    and not exists (select 1 from public.assessment_case_schedules schedule where schedule.counseling_case_id = counseling_case.id and schedule.assessment_id = selected_assessment_id)
  order by counseling_case.id limit 1;
  select session.id into selected_future_session_id
  from public.sessions session
  where session.status = 'published'
    and session.sequence_number > (select sequence_number from public.sessions where id = selected_current_session_id)
    and not exists (select 1 from public.case_sessions completed where completed.counseling_case_id = selected_case_id and completed.session_id = session.id)
  order by session.sequence_number limit 1;
  select member.profile_id into counselor_id
  from public.case_assignments assignment join public.group_members member on member.group_id = assignment.assigned_group_id and member.ended_at is null
  where assignment.counseling_case_id = selected_case_id and assignment.assignment_type = 'counselor' and assignment.ended_at is null order by member.profile_id limit 1;
  select member.profile_id into counselor_partner_id
  from public.case_assignments assignment join public.group_members member on member.group_id = assignment.assigned_group_id and member.ended_at is null
  where assignment.counseling_case_id = selected_case_id and assignment.assignment_type = 'counselor' and assignment.ended_at is null and member.profile_id <> counselor_id order by member.profile_id limit 1;
  select profile.id into unauthorized_counselor_id
  from public.profiles profile join public.profile_roles role_map on role_map.profile_id = profile.id and role_map.role = 'counselor'
  where profile.status = 'active' and profile.id <> counselor_id
    and not exists (select 1 from public.case_assignments assignment join public.group_members member on member.group_id = assignment.assigned_group_id and member.profile_id = profile.id and member.ended_at is null where assignment.counseling_case_id = selected_case_id and assignment.assignment_type = 'counselor' and assignment.ended_at is null)
  order by profile.id limit 1;
  select member.profile_id into couple_id from public.counseling_cases counseling_case
  join public.group_members member on member.group_id = counseling_case.couple_group_id and member.ended_at is null
  where counseling_case.id = selected_case_id order by member.profile_id limit 1;
  if selected_case_id is null or selected_future_session_id is null or admin_id is null or counselor_id is null or counselor_partner_id is null or unauthorized_counselor_id is null or couple_id is null or selected_assessment_id is null then
    raise exception 'Suitable existing DEV identities and Case Sessions are unavailable';
  end if;
  select coalesce(max(version.version_number), 0) + 1 into next_version_number from public.assessment_versions version where version.assessment_id = selected_assessment_id;
  insert into public.assessment_versions(assessment_id, version_number, status, created_by, published_at)
  values(selected_assessment_id, next_version_number, 'published', admin_id, now()) returning id into version_id;

  perform set_config('assessment_m5.case_id', selected_case_id::text, true);
  perform set_config('assessment_m5.active_case_session_id', selected_case_session_id::text, true);
  perform set_config('assessment_m5.active_session_id', selected_current_session_id::text, true);
  perform set_config('assessment_m5.future_session_id', selected_future_session_id::text, true);
  perform set_config('assessment_m5.admin_id', admin_id::text, true);
  perform set_config('assessment_m5.counselor_id', counselor_id::text, true);
  perform set_config('assessment_m5.counselor_partner_id', counselor_partner_id::text, true);
  perform set_config('assessment_m5.unauthorized_counselor_id', unauthorized_counselor_id::text, true);
  perform set_config('assessment_m5.couple_id', couple_id::text, true);
  perform set_config('assessment_m5.assessment_id', selected_assessment_id::text, true);
  perform set_config('assessment_m5.version_id', version_id::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  case_id uuid := current_setting('assessment_m5.case_id')::uuid;
  active_case_session_id uuid := current_setting('assessment_m5.active_case_session_id')::uuid;
  active_session_id uuid := current_setting('assessment_m5.active_session_id')::uuid;
  future_session_id uuid := current_setting('assessment_m5.future_session_id')::uuid;
  admin_id uuid := current_setting('assessment_m5.admin_id')::uuid;
  counselor_id uuid := current_setting('assessment_m5.counselor_id')::uuid;
  counselor_partner_id uuid := current_setting('assessment_m5.counselor_partner_id')::uuid;
  unauthorized_counselor_id uuid := current_setting('assessment_m5.unauthorized_counselor_id')::uuid;
  couple_id uuid := current_setting('assessment_m5.couple_id')::uuid;
  target_assessment_id uuid := current_setting('assessment_m5.assessment_id')::uuid;
  version_id uuid := current_setting('assessment_m5.version_id')::uuid;
  schedule_id uuid;
begin
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  schedule_id := public.configure_case_assessment_schedule(case_id, target_assessment_id, version_id, active_session_id);
  perform set_config('assessment_m5.schedule_id', schedule_id::text, true);
end;
$$;

reset role;
do $$
declare
  schedule_id uuid := current_setting('assessment_m5.schedule_id')::uuid;
  couple_id uuid := current_setting('assessment_m5.couple_id')::uuid;
  participant_assignment_id uuid;
begin
  select id into participant_assignment_id from public.assessment_participant_assignments where assessment_schedule_id = schedule_id and profile_id = couple_id;
  if participant_assignment_id is null then raise exception 'Active Session assignment was not created'; end if;
  perform set_config('assessment_m5.assignment_id', participant_assignment_id::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  case_id uuid := current_setting('assessment_m5.case_id')::uuid;
  active_case_session_id uuid := current_setting('assessment_m5.active_case_session_id')::uuid;
  active_session_id uuid := current_setting('assessment_m5.active_session_id')::uuid;
  future_session_id uuid := current_setting('assessment_m5.future_session_id')::uuid;
  counselor_id uuid := current_setting('assessment_m5.counselor_id')::uuid;
  counselor_partner_id uuid := current_setting('assessment_m5.counselor_partner_id')::uuid;
  unauthorized_counselor_id uuid := current_setting('assessment_m5.unauthorized_counselor_id')::uuid;
  couple_id uuid := current_setting('assessment_m5.couple_id')::uuid;
  target_assessment_id uuid := current_setting('assessment_m5.assessment_id')::uuid;
  schedule_id uuid := current_setting('assessment_m5.schedule_id')::uuid;
  participant_assignment_id uuid := current_setting('assessment_m5.assignment_id')::uuid;
  version_id uuid := current_setting('assessment_m5.version_id')::uuid;
  attempt_id uuid;
  actual_version_id uuid;
  actual_session_id uuid;
  actual_case_session_id uuid;
  actual_progression_session_id uuid;
  assignment_count integer;
  rejected boolean;
begin

  perform set_config('request.jwt.claim.sub', counselor_id::text, true);
  perform public.set_assessment_counselor_preference(target_assessment_id, future_session_id);
  perform set_config('request.jwt.claim.sub', counselor_partner_id::text, true);
  perform public.set_assessment_counselor_preference(target_assessment_id, active_session_id);
  perform set_config('request.jwt.claim.sub', counselor_id::text, true);
  if not exists (select 1 from public.assessment_counselor_preferences preference where preference.assessment_id = target_assessment_id and preference.counselor_profile_id = counselor_id and preference.session_id = future_session_id)
    or (select count(*) from public.assessment_counselor_preferences preference where preference.counselor_profile_id = counselor_partner_id) <> 0 then
    raise exception 'Counselor preference persistence or own-row isolation failed';
  end if;
  if not exists (select 1 from public.assessment_case_schedules where id = schedule_id and session_id = active_session_id) then
    raise exception 'Changing Counselor preferences retroactively changed an existing Case schedule';
  end if;

  perform set_config('request.jwt.claim.sub', couple_id::text, true);
  attempt_id := public.start_assessment_attempt(participant_assignment_id, false);
  if attempt_id is null then raise exception 'Initial attempt was not created'; end if;

  perform set_config('request.jwt.claim.sub', unauthorized_counselor_id::text, true);
  rejected := false;
  begin
    perform public.reschedule_case_assessment_schedule(case_id, target_assessment_id, future_session_id);
  exception when others then rejected := sqlerrm = 'Not authorized'; end;
  if not rejected then raise exception 'Unassigned Counselor reschedule was not rejected'; end if;

  perform set_config('request.jwt.claim.sub', couple_id::text, true);
  rejected := false;
  begin
    perform public.reschedule_case_assessment_schedule(case_id, target_assessment_id, future_session_id);
  exception when others then rejected := sqlerrm = 'Not authorized'; end;
  if not rejected then raise exception 'Couple reschedule was not rejected'; end if;

  perform set_config('request.jwt.claim.sub', counselor_id::text, true);
  if public.reschedule_case_assessment_schedule(case_id, target_assessment_id, future_session_id) <> schedule_id then
    raise exception 'Reschedule changed the schedule identity';
  end if;
  select schedule.assessment_version_id, schedule.session_id, schedule.case_session_id, schedule.progression_case_session_id
  into actual_version_id, actual_session_id, actual_case_session_id, actual_progression_session_id
  from public.assessment_case_schedules schedule where schedule.id = schedule_id;
  select count(*)::integer into assignment_count from public.assessment_participant_assignments where assessment_schedule_id = schedule_id;
  if actual_version_id <> version_id or actual_session_id <> future_session_id or actual_case_session_id <> active_case_session_id or actual_progression_session_id is not null or assignment_count <> 2
    or not exists (select 1 from public.assessment_attempts where id = attempt_id and status = 'in_progress') then
    raise exception 'Future reschedule changed the pinned version, retained access anchor, assignment set, attempt, or progression pointer incorrectly';
  end if;
  perform set_config('assessment_m5.attempt_id', attempt_id::text, true);
end;
$$;

reset role;
update public.assessment_versions set status = 'retired' where id = current_setting('assessment_m5.version_id')::uuid;
set local role authenticated;

do $$
declare
  case_id uuid := current_setting('assessment_m5.case_id')::uuid;
  active_session_id uuid := current_setting('assessment_m5.active_session_id')::uuid;
  active_case_session_id uuid := current_setting('assessment_m5.active_case_session_id')::uuid;
  counselor_id uuid := current_setting('assessment_m5.counselor_id')::uuid;
  version_id uuid := current_setting('assessment_m5.version_id')::uuid;
  schedule_id uuid := current_setting('assessment_m5.schedule_id')::uuid;
  attempt_id uuid := current_setting('assessment_m5.attempt_id')::uuid;
  actual_version_id uuid;
  actual_session_id uuid;
  actual_progression_session_id uuid;
  assignment_count integer;
begin
  perform set_config('request.jwt.claim.sub', counselor_id::text, true);
  if public.reschedule_case_assessment_schedule(case_id, current_setting('assessment_m5.assessment_id')::uuid, active_session_id) <> schedule_id then
    raise exception 'Retired pinned version could not be rescheduled';
  end if;
  select schedule.assessment_version_id, schedule.session_id, schedule.progression_case_session_id
  into actual_version_id, actual_session_id, actual_progression_session_id
  from public.assessment_case_schedules schedule where schedule.id = schedule_id;
  select count(*)::integer into assignment_count from public.assessment_participant_assignments where assessment_schedule_id = schedule_id;
  if actual_version_id <> version_id or actual_session_id <> active_session_id or actual_progression_session_id <> active_case_session_id or assignment_count <> 2
    or not exists (select 1 from public.assessment_attempts where id = attempt_id and status = 'in_progress') then
    raise exception 'Reactivation did not preserve the retired pinned version and participant progress';
  end if;
end;
$$;

rollback;
