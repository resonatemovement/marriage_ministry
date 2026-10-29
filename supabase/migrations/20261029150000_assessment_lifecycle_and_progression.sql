-- Assessment lifecycle integration. Assignments are created only from a published
-- version; the absence of a published version leaves existing Case progression alone.

alter table public.assessment_case_schedules
  add column progression_case_session_id uuid references public.case_sessions(id) on delete restrict;

update public.assessment_case_schedules
set progression_case_session_id = case_session_id;

create index assessment_case_schedules_progression_session_idx
  on public.assessment_case_schedules(progression_case_session_id)
  where progression_case_session_id is not null;

comment on column public.assessment_case_schedules.case_session_id is
  'Most recently activated Case Session, retained so an assigned participant can continue after rescheduling.';
comment on column public.assessment_case_schedules.progression_case_session_id is
  'The currently configured Case Session whose completion is gated by the initial required Assessment.';

create or replace function private.activate_case_assessment_schedule(
  target_schedule_id uuid,
  target_case_session_id uuid,
  actor_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_row public.assessment_case_schedules%rowtype;
  couple_group_id uuid;
  active_member_count integer;
begin
  if actor_id is null then raise exception 'Not authorized'; end if;
  select * into schedule_row
  from public.assessment_case_schedules
  where id = target_schedule_id
  for update;
  if not found then raise exception 'Assessment schedule is unavailable'; end if;
  if not exists (
    select 1 from public.case_sessions case_session
    where case_session.id = target_case_session_id
      and case_session.counseling_case_id = schedule_row.counseling_case_id
      and case_session.session_id = schedule_row.session_id
      and case_session.status = 'active'
  ) then raise exception 'Assessment Session is not active for this Case'; end if;

  select counseling_case.couple_group_id into couple_group_id
  from public.counseling_cases counseling_case
  where counseling_case.id = schedule_row.counseling_case_id;
  select count(*)::integer into active_member_count
  from public.group_members member
  join public.groups couple_group on couple_group.id = member.group_id and couple_group.group_type = 'couple'
  where member.group_id = couple_group_id and member.ended_at is null;
  if active_member_count <> 2 then raise exception 'An Assessment requires exactly two active Couple members'; end if;

  update public.assessment_case_schedules
  set case_session_id = target_case_session_id,
      progression_case_session_id = target_case_session_id,
      updated_at = now()
  where id = target_schedule_id;
  insert into public.assessment_participant_assignments(assessment_schedule_id, counseling_case_id, profile_id)
  select target_schedule_id, schedule_row.counseling_case_id, member.profile_id
  from public.group_members member
  where member.group_id = couple_group_id and member.ended_at is null
  on conflict (assessment_schedule_id, profile_id) do nothing;
end;
$$;

revoke all on function private.activate_case_assessment_schedule(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.configure_case_assessment_schedule(
  target_case_id uuid,
  target_assessment_id uuid,
  target_version_id uuid,
  target_session_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  selected_session_id uuid;
  selected_source public.assessment_schedule_source;
  case_override_session_id uuid;
  schedule_id uuid;
  active_case_session_id uuid;
  existing_version_id uuid;
begin
  if actor is null or not private.assessment_can_manage_case(target_case_id) then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.assessment_versions
    where id = target_version_id and assessment_id = target_assessment_id and status = 'published'
  ) then raise exception 'Select a published Assessment version'; end if;

  if target_session_id is not null then
    if not exists (select 1 from public.sessions where id = target_session_id and status = 'published') then raise exception 'Select a published Session'; end if;
    selected_session_id := target_session_id;
    selected_source := 'case_override';
    insert into public.assessment_case_overrides(assessment_id, counseling_case_id, session_id, configured_by)
    values(target_assessment_id, target_case_id, target_session_id, actor)
    on conflict (assessment_id, counseling_case_id) do update
      set session_id = excluded.session_id, configured_by = excluded.configured_by, configured_at = now();
  else
    select session_id into case_override_session_id
    from public.assessment_case_overrides
    where assessment_id = target_assessment_id and counseling_case_id = target_case_id;
    if case_override_session_id is not null then
      selected_session_id := case_override_session_id;
      selected_source := 'case_override';
    elsif private.current_user_has_role(array['counselor']::public.app_role[]) then
      select preference.session_id into selected_session_id
      from public.assessment_counselor_preferences preference
      where preference.assessment_id = target_assessment_id and preference.counselor_profile_id = actor;
      if selected_session_id is not null then selected_source := 'counselor_preference'; end if;
    end if;
    if selected_session_id is null then
      select default_setting.session_id into selected_session_id
      from public.assessment_system_defaults default_setting
      where default_setting.assessment_id = target_assessment_id;
      selected_source := 'system_default';
    end if;
  end if;
  if selected_session_id is null or not exists (
    select 1 from public.sessions where id = selected_session_id and status = 'published'
  ) then raise exception 'Assessment Session default is unavailable'; end if;

  select id into active_case_session_id
  from public.case_sessions
  where counseling_case_id = target_case_id and session_id = selected_session_id and status = 'active';
  if exists (
    select 1 from public.case_sessions
    where counseling_case_id = target_case_id and session_id = selected_session_id and status = 'completed'
  ) and active_case_session_id is null then raise exception 'Assessment cannot be assigned to a completed Session'; end if;

  select id, assessment_version_id into schedule_id, existing_version_id
  from public.assessment_case_schedules
  where counseling_case_id = target_case_id and assessment_id = target_assessment_id
  for update;
  if schedule_id is not null and existing_version_id <> target_version_id and exists (
    select 1
    from public.assessment_participant_assignments participant_assignment
    join public.assessment_attempts attempt on attempt.participant_assignment_id = participant_assignment.id
    where participant_assignment.assessment_schedule_id = schedule_id
  ) then raise exception 'Assessment version cannot change after participant attempts begin'; end if;

  insert into public.assessment_case_schedules as existing_schedule(
    assessment_id, counseling_case_id, assessment_version_id, session_id,
    case_session_id, progression_case_session_id, schedule_source, configured_by
  ) values (
    target_assessment_id, target_case_id, target_version_id, selected_session_id,
    active_case_session_id, active_case_session_id, selected_source, actor
  )
  on conflict (counseling_case_id, assessment_id) do update set
    assessment_version_id = excluded.assessment_version_id,
    session_id = excluded.session_id,
    case_session_id = coalesce(existing_schedule.case_session_id, excluded.case_session_id),
    progression_case_session_id = excluded.progression_case_session_id,
    schedule_source = excluded.schedule_source,
    configured_by = excluded.configured_by,
    updated_at = now()
  returning id into schedule_id;

  if active_case_session_id is not null then
    perform private.activate_case_assessment_schedule(schedule_id, active_case_session_id, actor);
  end if;
  return schedule_id;
end;
$$;

revoke all on function public.configure_case_assessment_schedule(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.configure_case_assessment_schedule(uuid, uuid, uuid, uuid)
  to authenticated;

create or replace function private.assessment_schedule_default_for_case(
  target_case_id uuid,
  target_assessment_id uuid,
  target_version_id uuid,
  actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_session_id uuid;
  selected_source public.assessment_schedule_source;
  preference_session_id uuid;
  schedule_id uuid;
begin
  if actor_id is null or not exists (
    select 1 from public.counseling_cases counseling_case
    where counseling_case.id = target_case_id and counseling_case.closed_at is null
  ) then return null; end if;
  if not exists (
    select 1 from public.assessment_versions version
    where version.id = target_version_id
      and version.assessment_id = target_assessment_id
      and version.status = 'published'
  ) then return null; end if;
  if exists (
    select 1 from public.assessment_case_schedules schedule
    where schedule.counseling_case_id = target_case_id and schedule.assessment_id = target_assessment_id
  ) then
    select schedule.id into schedule_id from public.assessment_case_schedules schedule
    where schedule.counseling_case_id = target_case_id and schedule.assessment_id = target_assessment_id;
    return schedule_id;
  end if;

  select override.session_id into selected_session_id
  from public.assessment_case_overrides override
  where override.counseling_case_id = target_case_id and override.assessment_id = target_assessment_id;
  if selected_session_id is not null then
    selected_source := 'case_override';
  else
    -- A two-person Counselor team may have different personal preferences. Apply a
    -- preference only when its active members agree; otherwise use the system default.
    select (array_agg(distinct preference.session_id))[1] into preference_session_id
    from public.case_assignments assignment
    join public.groups counselor_team
      on counselor_team.id = assignment.assigned_group_id and counselor_team.group_type = 'counselor_team'
    join public.group_members member
      on member.group_id = counselor_team.id and member.ended_at is null
    join public.profile_roles role_map
      on role_map.profile_id = member.profile_id and role_map.role = 'counselor'
    join public.assessment_counselor_preferences preference
      on preference.counselor_profile_id = member.profile_id
     and preference.assessment_id = target_assessment_id
    where assignment.counseling_case_id = target_case_id
      and assignment.assignment_type = 'counselor'
      and assignment.ended_at is null
    having count(distinct preference.session_id) = 1;
    if preference_session_id is not null then
      selected_session_id := preference_session_id;
      selected_source := 'counselor_preference';
    else
      select default_setting.session_id into selected_session_id
      from public.assessment_system_defaults default_setting
      where default_setting.assessment_id = target_assessment_id;
      selected_source := 'system_default';
    end if;
  end if;

  if selected_session_id is null or not exists (
    select 1 from public.sessions session_row
    where session_row.id = selected_session_id and session_row.status = 'published'
  ) then return null; end if;
  if exists (
    select 1 from public.case_sessions case_session
    where case_session.counseling_case_id = target_case_id
      and case_session.session_id = selected_session_id
      and case_session.status = 'completed'
  ) then return null; end if;

  insert into public.assessment_case_schedules(
    assessment_id, counseling_case_id, assessment_version_id, session_id,
    case_session_id, progression_case_session_id, schedule_source, configured_by
  ) values (
    target_assessment_id, target_case_id, target_version_id, selected_session_id,
    null, null, selected_source, actor_id
  )
  on conflict (counseling_case_id, assessment_id) do nothing
  returning id into schedule_id;
  if schedule_id is null then
    select schedule.id into schedule_id from public.assessment_case_schedules schedule
    where schedule.counseling_case_id = target_case_id and schedule.assessment_id = target_assessment_id;
  end if;
  return schedule_id;
end;
$$;

revoke all on function private.assessment_schedule_default_for_case(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.assessment_auto_schedule_case(
  target_case_id uuid,
  actor_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  definition_row record;
  schedule_row public.assessment_case_schedules%rowtype;
  active_case_session_id uuid;
begin
  if actor_id is null then return; end if;
  select case_session.id into active_case_session_id
  from public.case_sessions case_session
  where case_session.counseling_case_id = target_case_id and case_session.status = 'active';

  for definition_row in
    select distinct on (version.assessment_id)
      version.assessment_id, version.id as version_id
    from public.assessment_versions version
    where version.status = 'published'
    order by version.assessment_id, version.version_number desc
  loop
    perform private.assessment_schedule_default_for_case(
      target_case_id, definition_row.assessment_id, definition_row.version_id, actor_id
    );
  end loop;

  if active_case_session_id is null then return; end if;
  for schedule_row in
    select schedule.*
    from public.assessment_case_schedules schedule
    where schedule.counseling_case_id = target_case_id
      and schedule.session_id = (
        select case_session.session_id from public.case_sessions case_session where case_session.id = active_case_session_id
      )
  loop
    perform private.activate_case_assessment_schedule(schedule_row.id, active_case_session_id, actor_id);
  end loop;
end;
$$;

revoke all on function private.assessment_auto_schedule_case(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.assessment_case_session_activated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.assessment_auto_schedule_case(new.counseling_case_id, new.activated_by);
  end if;
  return new;
end;
$$;

revoke all on function private.assessment_case_session_activated()
  from public, anon, authenticated;
create trigger assessment_case_session_auto_assignment
after insert or update on public.case_sessions
for each row execute function private.assessment_case_session_activated();

create or replace function private.assessment_version_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := coalesce(auth.uid(), new.created_by);
  case_id uuid;
begin
  if old.status is distinct from 'published'::public.assessment_version_status
     and new.status = 'published'::public.assessment_version_status then
    for case_id in
      select counseling_case.id
      from public.counseling_cases counseling_case
      where counseling_case.closed_at is null
      order by counseling_case.id
    loop
      perform private.assessment_auto_schedule_case(case_id, actor_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.assessment_version_published()
  from public, anon, authenticated;
create trigger assessment_version_auto_assignment
after update of status on public.assessment_versions
for each row execute function private.assessment_version_published();

create or replace function private.assessment_initial_requirements_complete(target_case_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.assessment_case_schedules schedule
    where schedule.progression_case_session_id = target_case_session_id
      and schedule.required_for_progression
      and (
        (select count(*) from public.assessment_participant_assignments assignment
         where assignment.assessment_schedule_id = schedule.id) <> 2
        or exists (
          select 1
          from public.assessment_participant_assignments assignment
          where assignment.assessment_schedule_id = schedule.id
            and not exists (
              select 1 from public.assessment_attempts attempt
              where attempt.participant_assignment_id = assignment.id
                and attempt.attempt_number = 1
                and attempt.status = 'submitted'
                and attempt.submitted_at is not null
            )
        )
      )
  );
$$;

revoke all on function private.assessment_initial_requirements_complete(uuid)
  from public, anon, authenticated;

alter function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)
  set schema private;
alter function private.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)
  rename to complete_case_session_schedule_next_before_assessment_gate;
revoke all on function private.complete_case_session_schedule_next_before_assessment_gate(uuid, uuid, uuid[], timestamptz, timestamptz, text)
  from public, anon, authenticated;

create function public.complete_case_session_schedule_next(
  target_case_session_id uuid,
  target_session_id uuid,
  target_selected_material_block_ids uuid[],
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  override_confirmation text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_case_session_id uuid;
begin
  next_case_session_id := private.complete_case_session_schedule_next_before_assessment_gate(
    target_case_session_id,
    target_session_id,
    target_selected_material_block_ids,
    target_starts_at,
    target_ends_at,
    override_confirmation
  );
  if not private.assessment_initial_requirements_complete(target_case_session_id) then
    raise exception 'Both partners must submit the required initial Assessment before advancing';
  end if;
  return next_case_session_id;
end;
$$;
revoke all on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)
  to authenticated;

alter function public.complete_counseling_program(uuid, text) set schema private;
alter function private.complete_counseling_program(uuid, text)
  rename to complete_counseling_program_before_assessment_gate;
revoke all on function private.complete_counseling_program_before_assessment_gate(uuid, text)
  from public, anon, authenticated;

create function public.complete_counseling_program(
  target_case_session_id uuid,
  override_confirmation text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.complete_counseling_program_before_assessment_gate(
    target_case_session_id, override_confirmation
  );
  if not private.assessment_initial_requirements_complete(target_case_session_id) then
    raise exception 'Both partners must submit the required initial Assessment before completing the program';
  end if;
end;
$$;
revoke all on function public.complete_counseling_program(uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_counseling_program(uuid, text)
  to authenticated;

comment on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text) is
  'Completes an active Session only after existing Homework rules and all required initial Assessments are complete; Homework OVERRIDE does not bypass Assessment requirements.';
comment on function public.complete_counseling_program(uuid, text) is
  'Completes the counseling program only after existing Homework rules and all required initial Assessments are complete.';
