-- Let care staff choose a non-empty subset of published Session content while preserving immutable snapshots.

create or replace function public.get_published_session_material_options()
returns table (
  session_id uuid,
  block_id uuid,
  block_type text,
  block_position integer,
  label text,
  resource_category text,
  is_recommended boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.current_user_has_role(
    array['super_admin', 'admin', 'campus_lead', 'coach', 'counselor']::public.app_role[]
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    block.session_id,
    block.id,
    block.block_type,
    block.position,
    coalesce(
      nullif(btrim(block.title), ''),
      nullif(btrim(resource.title), ''),
      case block.block_type
        when 'rich_text' then 'Untitled Page'
        when 'video_link' then 'Video / Link'
        else 'Resource'
      end
    ),
    block.resource_category,
    block.is_recommended
  from public.sessions session_template
  join public.session_material_blocks block on block.session_id = session_template.id
  left join public.resources resource on resource.id = block.resource_id
  where session_template.status = 'published'
  order by session_template.sequence_number, block.position, block.id;
end;
$$;

revoke all on function public.get_published_session_material_options() from public, anon, authenticated;
grant execute on function public.get_published_session_material_options() to authenticated;

create or replace function private.snapshot_selected_session_material(
  target_session_id uuid,
  target_case_session_id uuid,
  target_selected_material_block_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_count integer;
begin
  if target_selected_material_block_ids is null
    or cardinality(target_selected_material_block_ids) = 0 then
    raise exception 'Select at least one Session content item';
  end if;

  if cardinality(target_selected_material_block_ids) <>
    (select count(distinct selected_id) from unnest(target_selected_material_block_ids) as selected(selected_id)) then
    raise exception 'Duplicate Session content selection';
  end if;

  perform 1
  from public.session_material_blocks block
  where block.session_id = target_session_id
    and block.id = any(target_selected_material_block_ids)
  order by block.position, block.id
  for share;

  select count(*)::integer into selected_count
  from public.session_material_blocks block
  where block.session_id = target_session_id
    and block.id = any(target_selected_material_block_ids);

  if selected_count <> cardinality(target_selected_material_block_ids) then
    raise exception 'Selected Session content is unavailable';
  end if;

  perform 1
  from public.resources resource
  join public.session_material_blocks block on block.resource_id = resource.id
  where block.session_id = target_session_id
    and block.id = any(target_selected_material_block_ids)
  order by resource.id
  for share of resource;

  if exists (
    select 1
    from public.session_material_blocks block
    left join public.resources resource on resource.id = block.resource_id
    where block.session_id = target_session_id
      and block.id = any(target_selected_material_block_ids)
      and block.block_type = 'library_resource'
      and resource.current_version_id is null
  ) then
    raise exception 'A selected Session Resource is unavailable';
  end if;

  insert into public.case_session_material_blocks(
    case_session_id, source_block_id, block_type, position, title, rich_text_content, url,
    description, resource_id, resource_version_id, resource_category
  )
  select
    target_case_session_id, block.id, block.block_type, block.position, block.title,
    block.rich_text_content, block.url, block.description, block.resource_id,
    resource.current_version_id, block.resource_category
  from public.session_material_blocks block
  left join public.resources resource on resource.id = block.resource_id
  where block.session_id = target_session_id
    and block.id = any(target_selected_material_block_ids)
  order by block.position, block.id;
end;
$$;

revoke all on function private.snapshot_selected_session_material(uuid, uuid, uuid[])
  from public, anon, authenticated;

revoke execute on function public.activate_first_case_session(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
drop function public.activate_first_case_session(uuid, uuid, timestamptz, timestamptz);

create function public.activate_first_case_session(
  target_case_id uuid,
  target_session_id uuid,
  target_selected_material_block_ids uuid[],
  target_starts_at timestamptz,
  target_ends_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  prior_status public.case_status;
  initial_meeting public.case_session_meetings%rowtype;
  session_row public.sessions%rowtype;
  authored_session_number bigint;
  selected_homework_id uuid;
  selected_version_id uuid;
  assignment_id uuid;
  revision_id uuid;
  existing_version_id uuid;
  created_case_session_id uuid;
  meeting_id uuid;
begin
  if not (
    private.current_user_can_manage_counseling_case(target_case_id)
    or (
      private.current_user_has_role(array['super_admin']::public.app_role[])
      and exists (select 1 from public.counseling_cases case_row where case_row.id = target_case_id)
    )
  ) then
    raise exception 'Not authorized';
  end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;

  select status into prior_status
  from public.counseling_cases
  where id = target_case_id and closed_at is null
  for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;
  if exists (select 1 from public.case_sessions where counseling_case_id = target_case_id) then
    raise exception 'The first Session is already active';
  end if;

  select * into initial_meeting
  from public.case_session_meetings
  where counseling_case_id = target_case_id and session_id is null
  for update;
  if not found then raise exception 'Schedule the Initial Meeting first'; end if;
  if initial_meeting.completed_at is not null then raise exception 'The Initial Meeting is already complete'; end if;

  with ranked_sessions as (
    select session_template.id, session_template.status,
      row_number() over (order by session_template.sequence_number)::bigint as authored_session_number
    from public.sessions session_template
  )
  select ranked.authored_session_number into authored_session_number
  from ranked_sessions ranked
  where ranked.id = target_session_id and ranked.status = 'published';
  if not found then raise exception 'Select a published Session'; end if;

  select * into session_row
  from public.sessions
  where id = target_session_id and status = 'published'
  for share;
  if not found then raise exception 'Select a published Session'; end if;

  select homework.id, version.id into selected_homework_id, selected_version_id
  from public.homeworks homework
  join public.homework_versions version
    on version.homework_id = homework.id and version.status = 'published'
  where homework.session_id = target_session_id
    and homework.withdrawn_at is null
    and exists (
      select 1 from public.homework_version_blocks block
      where block.homework_version_id = version.id
    )
  order by version.version_number desc
  limit 1;

  if selected_homework_id is not null then
    insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
    values(selected_homework_id, target_case_id, actor)
    on conflict (homework_id, counseling_case_id) where unassigned_at is null
    do update set updated_at = now()
    returning id into assignment_id;

    select id, homework_version_id into revision_id, existing_version_id
    from public.homework_assignment_revisions
    where homework_assignment_id = assignment_id and ended_at is null
    for update;

    if revision_id is not null and existing_version_id <> selected_version_id then
      update public.homework_assignment_revisions
      set ended_at = transition_at,
        update_reason = 'Pinned when Couple Session activated',
        updated_by = actor
      where id = revision_id;
      revision_id := null;
    end if;

    if revision_id is null then
      insert into public.homework_assignment_revisions(
        homework_assignment_id, homework_version_id, started_at, updated_by
      ) values (
        assignment_id, selected_version_id, transition_at, actor
      ) returning id into revision_id;
      perform private.create_homework_progress(revision_id);
    end if;
  end if;

  insert into public.case_sessions(
    counseling_case_id, session_id, actual_sequence, template_sequence_number, title,
    homework_assignment_revision_id, material_released_at, homework_released_at,
    activated_at, activated_by
  ) values (
    target_case_id, target_session_id, 1, authored_session_number, session_row.title,
    revision_id, transition_at, case when revision_id is null then null else transition_at end,
    transition_at, actor
  ) returning id into created_case_session_id;

  perform private.snapshot_selected_session_material(
    target_session_id,
    created_case_session_id,
    target_selected_material_block_ids
  );

  update public.case_session_meetings
  set completed_at = transition_at, completed_by = actor
  where id = initial_meeting.id;

  insert into public.case_session_meetings(
    counseling_case_id, session_id, case_session_id, starts_at, ends_at, location, scheduled_by
  ) values (
    target_case_id, target_session_id, created_case_session_id,
    target_starts_at, target_ends_at, 'In person', actor
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

revoke all on function public.activate_first_case_session(uuid, uuid, uuid[], timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.activate_first_case_session(uuid, uuid, uuid[], timestamptz, timestamptz)
  to authenticated;

revoke execute on function public.complete_case_session_schedule_next(uuid, uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
drop function public.complete_case_session_schedule_next(uuid, uuid, timestamptz, timestamptz, text);

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
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  target_case_id uuid;
  prior_status public.case_status;
  current_session public.case_sessions%rowtype;
  next_session public.sessions%rowtype;
  authored_session_number bigint;
  current_revision_id uuid;
  current_assignment_id uuid;
  selected_homework_id uuid;
  selected_version_id uuid;
  assignment_id uuid;
  revision_id uuid;
  existing_version_id uuid;
  created_case_session_id uuid;
  active_meeting_count integer;
  current_meeting_id uuid;
  total_partner_count integer;
  submitted_partner_count integer;
  is_admin boolean;
begin
  select counseling_case_id into target_case_id
  from public.case_sessions
  where id = target_case_session_id;

  is_admin := private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]);
  if target_case_id is null or not (
    private.current_user_can_manage_counseling_case(target_case_id)
    or (
      is_admin
      and exists (select 1 from public.counseling_cases case_row where case_row.id = target_case_id)
    )
  ) then
    raise exception 'Not authorized';
  end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;

  select status into prior_status
  from public.counseling_cases
  where id = target_case_id and closed_at is null
  for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select * into current_session
  from public.case_sessions
  where id = target_case_session_id
    and counseling_case_id = target_case_id
    and status = 'active'
  for update;
  if not found then raise exception 'The Couple Session is no longer active'; end if;

  select count(*)::integer, (array_agg(id order by starts_at desc))[1]
  into active_meeting_count, current_meeting_id
  from public.case_session_meetings
  where case_session_id = target_case_session_id and completed_at is null;
  if active_meeting_count <> 1 then
    raise exception 'The active Session must have exactly one scheduled Meeting';
  end if;

  current_revision_id := current_session.homework_assignment_revision_id;
  if current_revision_id is not null then
    select revision.homework_assignment_id into current_assignment_id
    from public.homework_assignment_revisions revision
    where revision.id = current_revision_id and revision.ended_at is null;
    if current_assignment_id is null then raise exception 'Current Session Homework is unavailable'; end if;

    select
      count(*)::integer,
      count(*) filter (where progress.status in ('submitted', 'reviewed'))::integer
    into total_partner_count, submitted_partner_count
    from public.homework_participant_progress progress
    where progress.assignment_revision_id = current_revision_id;

    if total_partner_count <> 2 then
      raise exception 'Required Homework progress for both partners is unavailable';
    end if;
    if submitted_partner_count <> 2 then
      if not is_admin or override_confirmation is distinct from 'OVERRIDE' then
        raise exception 'Both partners must submit Homework. Admin or Super Admin may type OVERRIDE to continue.';
      end if;
    elsif override_confirmation is not null
      and (not is_admin or override_confirmation is distinct from 'OVERRIDE') then
      raise exception 'OVERRIDE is only accepted when required Homework is incomplete';
    elsif submitted_partner_count = 2 then
      override_confirmation := null;
    end if;
  elsif override_confirmation is not null then
    raise exception 'OVERRIDE is only accepted when required Homework is incomplete';
  end if;

  with ranked_sessions as (
    select session_template.id, session_template.status,
      row_number() over (order by session_template.sequence_number)::bigint as authored_session_number
    from public.sessions session_template
  )
  select ranked.authored_session_number into authored_session_number
  from ranked_sessions ranked
  where ranked.id = target_session_id and ranked.status = 'published';
  if not found then raise exception 'Select a published Session'; end if;

  select * into next_session
  from public.sessions
  where id = target_session_id and status = 'published'
  for share;
  if not found then raise exception 'Select a published Session'; end if;

  select homework.id, version.id into selected_homework_id, selected_version_id
  from public.homeworks homework
  join public.homework_versions version
    on version.homework_id = homework.id and version.status = 'published'
  where homework.session_id = target_session_id
    and homework.withdrawn_at is null
    and exists (
      select 1 from public.homework_version_blocks block
      where block.homework_version_id = version.id
    )
  order by version.version_number desc
  limit 1;

  if selected_homework_id is not null then
    insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
    values(selected_homework_id, target_case_id, actor)
    on conflict (homework_id, counseling_case_id) where unassigned_at is null
    do update set updated_at = now()
    returning id into assignment_id;

    select revision.id, revision.homework_version_id into revision_id, existing_version_id
    from public.homework_assignment_revisions revision
    where revision.homework_assignment_id = assignment_id and revision.ended_at is null
    for update;

    if revision_id is not null and existing_version_id <> selected_version_id then
      update public.homework_assignment_revisions
      set ended_at = transition_at,
        update_reason = 'Pinned when Couple Session activated',
        updated_by = actor
      where id = revision_id;
      revision_id := null;
    end if;

    if revision_id is null then
      insert into public.homework_assignment_revisions(
        homework_assignment_id, homework_version_id, started_at, updated_by
      ) values (
        assignment_id, selected_version_id, transition_at, actor
      ) returning id into revision_id;
      perform private.create_homework_progress(revision_id);
    end if;
  end if;

  update public.case_sessions
  set status = 'completed', completed_at = transition_at, completed_by = actor
  where id = target_case_session_id;

  update public.case_session_meetings
  set completed_at = transition_at, completed_by = actor
  where id = current_meeting_id;

  if current_revision_id is not null and submitted_partner_count <> 2 then
    insert into public.audit_events(actor_id, event_type, entity_type, entity_id, details)
    values(
      actor,
      'case_session.homework_override',
      'case_session',
      target_case_session_id,
      jsonb_build_object(
        'homework_assignment_revision_id', current_revision_id,
        'incomplete_partner_count', total_partner_count - submitted_partner_count
      )
    );
  end if;

  insert into public.case_sessions(
    counseling_case_id, session_id, actual_sequence, template_sequence_number, title,
    homework_assignment_revision_id, material_released_at, homework_released_at,
    activated_at, activated_by
  ) values (
    target_case_id, target_session_id, current_session.actual_sequence + 1,
    authored_session_number, next_session.title, revision_id,
    transition_at, case when revision_id is null then null else transition_at end,
    transition_at, actor
  ) returning id into created_case_session_id;

  perform private.snapshot_selected_session_material(
    target_session_id,
    created_case_session_id,
    target_selected_material_block_ids
  );

  insert into public.case_session_meetings(
    counseling_case_id, session_id, case_session_id, starts_at, ends_at, location, scheduled_by
  ) values (
    target_case_id, target_session_id, created_case_session_id,
    target_starts_at, target_ends_at, 'In person', actor
  );

  if prior_status in ('requested', 'assessment', 'interviewed', 'matched') then
    update public.counseling_cases set status = 'active' where id = target_case_id;
    insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason)
    values(target_case_id, prior_status, 'active', actor, 'Next Couple Session activated');
  end if;

  return created_case_session_id;
end;
$$;

revoke all on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)
  to authenticated;

comment on function public.get_published_session_material_options() is
  'Returns ordered published Session content labels and recommendation flags for authorized scheduling roles.';
comment on function public.activate_first_case_session(uuid, uuid, uuid[], timestamptz, timestamptz) is
  'Activates the first Couple Session and snapshots only the selected published Session content.';
comment on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text) is
  'Completes the active Couple Session, snapshots only selected published Session content, and schedules its first Meeting.';
