create or replace function public.schedule_initial_case_meeting(
  target_case_id uuid, target_starts_at timestamptz, target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); meeting_id uuid;
begin
  if not (private.current_user_can_manage_counseling_case(target_case_id) or (private.current_user_has_role(array['super_admin']::public.app_role[]) and exists (select 1 from public.counseling_cases c where c.id = target_case_id))) then raise exception 'Not authorized'; end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;
  perform 1 from public.counseling_cases where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;
  if exists (select 1 from public.case_sessions where counseling_case_id = target_case_id) then
    raise exception 'The initial meeting is already complete';
  end if;
  select id into meeting_id from public.case_session_meetings
  where counseling_case_id = target_case_id and session_id is null for update;
  if meeting_id is null then
    insert into public.case_session_meetings(counseling_case_id, starts_at, ends_at, location, scheduled_by)
    values(target_case_id, target_starts_at, target_ends_at, 'In person', actor)
    returning id into meeting_id;
  else
    update public.case_session_meetings
    set starts_at = target_starts_at, ends_at = target_ends_at, scheduled_by = actor
    where id = meeting_id;
  end if;
  return meeting_id;
end;
$$;

create or replace function public.activate_first_case_session(
  target_case_id uuid, target_session_id uuid, target_starts_at timestamptz, target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  prior_status public.case_status;
  initial_meeting public.case_session_meetings%rowtype;
  session_row public.sessions%rowtype;
  selected_homework_id uuid;
  selected_version_id uuid;
  assignment_id uuid;
  revision_id uuid;
  existing_version_id uuid;
  created_case_session_id uuid;
  meeting_id uuid;
begin
  if not (private.current_user_can_manage_counseling_case(target_case_id) or (private.current_user_has_role(array['super_admin']::public.app_role[]) and exists (select 1 from public.counseling_cases c where c.id = target_case_id))) then raise exception 'Not authorized'; end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;

  select status into prior_status from public.counseling_cases
  where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;
  if exists (select 1 from public.case_sessions where counseling_case_id = target_case_id) then
    raise exception 'The first Session is already active';
  end if;
  select * into initial_meeting from public.case_session_meetings
  where counseling_case_id = target_case_id and session_id is null for update;
  if not found then raise exception 'Schedule the Initial Meeting first'; end if;
  if initial_meeting.completed_at is not null then raise exception 'The Initial Meeting is already complete'; end if;

  select * into session_row from public.sessions
  where id = target_session_id and status = 'published' for share;
  if not found then raise exception 'Select a published Session'; end if;
  if not exists (select 1 from public.session_material_blocks where session_id = target_session_id) then
    raise exception 'This Session needs published Material before it can be scheduled';
  end if;
  if exists (
    select 1 from public.session_material_blocks b
    left join public.resources r on r.id = b.resource_id
    where b.session_id = target_session_id and b.block_type = 'library_resource' and r.current_version_id is null
  ) then raise exception 'A Session Resource is unavailable'; end if;

  select h.id, v.id into selected_homework_id, selected_version_id
  from public.homeworks h
  join public.homework_versions v on v.homework_id = h.id and v.status = 'published'
  where h.session_id = target_session_id and h.withdrawn_at is null
  order by v.version_number desc limit 1;
  if selected_homework_id is null then raise exception 'This Session needs published Homework before it can be scheduled'; end if;

  insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
  values(selected_homework_id, target_case_id, actor)
  on conflict (homework_id, counseling_case_id) where unassigned_at is null
  do update set updated_at = now()
  returning id into assignment_id;
  select id, homework_version_id into revision_id, existing_version_id
  from public.homework_assignment_revisions
  where homework_assignment_id = assignment_id and ended_at is null for update;
  if revision_id is not null and existing_version_id <> selected_version_id then
    update public.homework_assignment_revisions
    set ended_at = transition_at, update_reason = 'Pinned when Couple Session activated', updated_by = actor
    where id = revision_id;
    revision_id := null;
  end if;
  if revision_id is null then
    insert into public.homework_assignment_revisions(homework_assignment_id, homework_version_id, started_at, updated_by)
    values(assignment_id, selected_version_id, transition_at, actor) returning id into revision_id;
    perform private.create_homework_progress(revision_id);
  end if;

  insert into public.case_sessions(
    counseling_case_id, session_id, actual_sequence, template_sequence_number, title,
    homework_assignment_revision_id, material_released_at, homework_released_at,
    activated_at, activated_by
  ) values (
    target_case_id, target_session_id, 1, session_row.sequence_number, session_row.title,
    revision_id, transition_at, transition_at, transition_at, actor
  ) returning id into created_case_session_id;

  insert into public.case_session_material_blocks(
    case_session_id, source_block_id, block_type, position, title, rich_text_content, url,
    description, resource_id, resource_version_id, resource_category
  )
  select created_case_session_id, b.id, b.block_type, b.position, b.title, b.rich_text_content, b.url,
    b.description, b.resource_id, r.current_version_id, b.resource_category
  from public.session_material_blocks b
  left join public.resources r on r.id = b.resource_id
  where b.session_id = target_session_id;

  update public.case_session_meetings
  set completed_at = transition_at, completed_by = actor
  where id = initial_meeting.id;
  insert into public.case_session_meetings(
    counseling_case_id, session_id, case_session_id, starts_at, ends_at, location, scheduled_by
  ) values (
    target_case_id, target_session_id, created_case_session_id, target_starts_at, target_ends_at, 'In person', actor
  ) returning id into meeting_id;

  update public.counseling_cases
  set status = case when status in ('requested', 'assessment', 'interviewed', 'matched') then 'active' else status end
  where id = target_case_id;
  if prior_status in ('requested', 'assessment', 'interviewed', 'matched') then
    insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason)
    values(target_case_id, prior_status, 'active', actor, 'First Couple Session activated');
  end if;
  return created_case_session_id;
end;
$$;

create or replace function public.schedule_followup_case_session_meeting(
  target_case_session_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  target_case_id uuid;
  current_session public.case_sessions%rowtype;
  current_meeting public.case_session_meetings%rowtype;
  new_meeting_id uuid;
begin
  select counseling_case_id into target_case_id
  from public.case_sessions where id = target_case_session_id;
  if target_case_id is null or not (private.current_user_can_manage_counseling_case(target_case_id) or (private.current_user_has_role(array['super_admin']::public.app_role[]) and exists (select 1 from public.counseling_cases c where c.id = target_case_id))) then
    raise exception 'Not authorized';
  end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;

  perform 1 from public.counseling_cases
  where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select * into current_session from public.case_sessions
  where id = target_case_session_id and counseling_case_id = target_case_id and status = 'active'
  for update;
  if not found then raise exception 'The Couple Session is no longer active'; end if;

  select * into current_meeting from public.case_session_meetings
  where case_session_id = target_case_session_id and session_id = current_session.session_id
  order by created_at desc, id desc limit 1 for update;
  if not found then raise exception 'The active Session has no Meeting to follow up'; end if;

  if current_meeting.completed_at is null then
    update public.case_session_meetings
    set completed_at = transition_at, completed_by = actor
    where id = current_meeting.id;
  end if;

  insert into public.case_session_meetings(
    counseling_case_id, session_id, case_session_id, starts_at, ends_at, location, scheduled_by
  ) values (
    target_case_id, current_session.session_id, target_case_session_id,
    target_starts_at, target_ends_at, 'In person', actor
  ) returning id into new_meeting_id;

  return new_meeting_id;
end;
$$;

create or replace function public.reschedule_case_session_meeting(
  target_meeting_id uuid, target_starts_at timestamptz, target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_case_id uuid;
begin
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;
  select meeting.counseling_case_id into target_case_id
  from public.case_session_meetings meeting
  join public.case_sessions couple_session on couple_session.id = meeting.case_session_id
  where meeting.id = target_meeting_id
    and couple_session.status = 'active'
    and meeting.completed_at is null
    and meeting.id = (
      select upcoming.id from public.case_session_meetings upcoming
      where upcoming.case_session_id = couple_session.id and upcoming.completed_at is null
      order by upcoming.created_at desc, upcoming.id desc limit 1
    )
  for update of meeting, couple_session;
  if not found or not (private.current_user_can_manage_counseling_case(target_case_id) or (private.current_user_has_role(array['super_admin']::public.app_role[]) and exists (select 1 from public.counseling_cases c where c.id = target_case_id))) then raise exception 'Not authorized'; end if;
  update public.case_session_meetings
  set starts_at = target_starts_at, ends_at = target_ends_at, scheduled_by = actor
  where id = target_meeting_id;
  return target_meeting_id;
end;
$$;
