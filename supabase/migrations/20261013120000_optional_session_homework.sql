-- Homework is optional for published Sessions. Material remains required and is always released.
alter table public.case_sessions alter column homework_assignment_revision_id drop not null;
alter table public.case_sessions alter column homework_released_at drop not null;
alter table public.case_sessions drop constraint case_sessions_release_together;
alter table public.case_sessions add constraint case_sessions_release_shape check (
  (homework_assignment_revision_id is null and homework_released_at is null)
  or (homework_assignment_revision_id is not null and homework_released_at = material_released_at)
);

create or replace function public.save_session_homework_authoring_state(
  target_session_id uuid,
  target_title text,
  target_material jsonb,
  save_session boolean,
  target_homework_version_id uuid,
  target_homework_blocks jsonb,
  save_homework boolean,
  publish_homework boolean,
  target_session_intent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  session_row public.sessions%rowtype;
  target_homework_root_id uuid;
  version_row public.homework_versions%rowtype;
  version_id uuid;
  source_version_id uuid;
  submitted_snapshot_id uuid;
  snapshot_exists boolean;
  logical_id uuid;
  snapshot_id uuid;
  item jsonb;
  item_type text;
  item_title text;
  item_description text;
  item_url text;
  item_content jsonb;
  item_position integer;
  offset_value bigint;
  seen_snapshots uuid[] := '{}'::uuid[];
  seen_logical_ids uuid[] := '{}'::uuid[];
  seen_client_ids text[] := '{}'::text[];
  saved_blocks jsonb := '[]'::jsonb;
  session_result jsonb;
  published_version_number integer;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if target_session_intent not in ('save','publish','publish_changes') then
    raise exception 'Invalid authoring intent';
  end if;
  if publish_homework is distinct from (target_session_intent in ('publish','publish_changes')) then
    raise exception 'Homework publishing must match the Session action';
  end if;
  if target_session_intent = 'publish_changes' and not exists (
    select 1 from public.sessions s where s.id = target_session_id and s.status = 'published'
  ) then raise exception 'Publish Changes requires a Published Session'; end if;
  if save_homework and (target_homework_blocks is null or jsonb_typeof(target_homework_blocks) <> 'array') then
    raise exception 'Homework blocks must be an array';
  end if;

  if save_session or target_session_intent = 'publish' then
    session_result := public.save_session_builder_state(
      target_session_id, target_title, target_material,
      case when target_session_intent = 'publish' then 'publish' else 'save' end
    );
    target_session_id := (session_result ->> 'session_id')::uuid;
  else
    select * into session_row from public.sessions where id = target_session_id for update;
    if not found or session_row.status = 'archived' then raise exception 'Session is unavailable'; end if;
    if target_session_intent = 'publish_changes' then
      session_result := jsonb_build_object('session_id', session_row.id, 'status', session_row.status,
        'title', session_row.title, 'blocks', '[]'::jsonb);
    else
      session_result := jsonb_build_object('session_id', session_row.id, 'status', session_row.status,
        'title', session_row.title, 'blocks', '[]'::jsonb);
    end if;
  end if;

  select h.id into target_homework_root_id from public.homeworks h
  where h.session_id = target_session_id and h.withdrawn_at is null for update;

  if target_homework_root_id is null and save_homework then
    version_id := public.get_or_create_homework_draft_for_session(target_session_id);
    select h.id into target_homework_root_id from public.homeworks h
    where h.session_id = target_session_id and h.withdrawn_at is null for update;
    select v.* into version_row from public.homework_versions v where v.id = version_id for update;
  end if;

  if save_homework or publish_homework then
    if target_homework_root_id is null then
      if save_homework and jsonb_array_length(target_homework_blocks) > 0 then
        raise exception 'Homework draft is unavailable';
      end if;
    else
      if version_id is null and target_homework_version_id is not null then
        select v.* into version_row from public.homework_versions v
        where v.id = target_homework_version_id and v.homework_id = target_homework_root_id for update;
        if not found then raise exception 'Select a valid Homework draft or remove the unavailable Homework selection'; end if;
        version_id := version_row.id;
      end if;

      if save_homework then
        if version_id is null then raise exception 'Homework draft is unavailable'; end if;

        if version_row.status = 'published' and exists (
          select 1 from public.homework_assignment_revisions r where r.homework_version_id = version_id
        ) then
          source_version_id := version_id;
          version_id := public.get_or_create_homework_draft(target_homework_root_id, version_id);
          select * into version_row from public.homework_versions where id = version_id for update;
        end if;

        if version_row.status = 'draft' and exists (
          select 1 from public.homework_versions other
          where other.homework_id = target_homework_root_id and other.status = 'draft' and other.id <> version_id
        ) then
          raise exception 'Homework Draft changed. Reload and try again.';
        end if;

        for item in select value from jsonb_array_elements(target_homework_blocks) as blocks(value) loop
          if jsonb_typeof(item) <> 'object' or exists (
            select 1 from jsonb_object_keys(item) keys(key)
            where keys.key not in ('id','homework_block_id','client_id','block_type','title','rich_text_content','url','description')
          ) then raise exception 'Invalid Homework block'; end if;
          item_type := item ->> 'block_type';
          if item_type not in ('rich_text','video_link','long_answer') then raise exception 'Unsupported Homework block type'; end if;
          item_title := nullif(btrim(item ->> 'title'), '');
          item_description := nullif(btrim(item ->> 'description'), '');
          item_url := nullif(btrim(item ->> 'url'), '');
          item_content := item -> 'rich_text_content';
          if item_title is not null and char_length(item_title) > 180 then raise exception 'Homework title is too long'; end if;
          if item_type in ('rich_text','long_answer') then
            if jsonb_typeof(item_content) is distinct from 'object' or item_url is not null then raise exception 'Invalid Homework text block'; end if;
          elsif jsonb_typeof(item -> 'url') is distinct from 'string'
            or not coalesce(item_url ~* '^https?://(\[[0-9a-f:.]+\]|[[:alnum:]]+(-[[:alnum:]]+)*(\.[[:alnum:]]+(-[[:alnum:]]+)*)*\.?)(:[0-9]{1,5})?([/?#][^[:space:]]*)?$', false)
            or item_content is not null and jsonb_typeof(item_content) <> 'null' then
            raise exception 'Enter a valid http or https Homework URL';
          end if;

          snapshot_id := null;
          logical_id := null;
          if item ? 'id' and jsonb_typeof(item -> 'id') = 'string' then
            submitted_snapshot_id := (item ->> 'id')::uuid;
            if submitted_snapshot_id = any(seen_snapshots) then raise exception 'Duplicate Homework block ID'; end if;
            seen_snapshots := array_append(seen_snapshots, submitted_snapshot_id);
            select vb.homework_block_id into logical_id from public.homework_version_blocks vb
            where vb.id = submitted_snapshot_id and vb.homework_version_id = version_id;
            if not found and source_version_id is not null then
              select vb.homework_block_id into logical_id from public.homework_version_blocks vb
              where vb.id = submitted_snapshot_id and vb.homework_version_id = source_version_id;
            end if;
            if not found or not exists (select 1 from public.homework_blocks b where b.id = logical_id and b.homework_id = target_homework_root_id) then
              raise exception 'Homework block does not belong to the editable version';
            end if;
            if item ? 'homework_block_id' and (item ->> 'homework_block_id')::uuid is distinct from logical_id then
              raise exception 'Homework block identity does not match its version snapshot';
            end if;
          else
            if item ? 'homework_block_id' and jsonb_typeof(item -> 'homework_block_id') = 'string' then
              logical_id := (item ->> 'homework_block_id')::uuid;
              if not exists (select 1 from public.homework_blocks b where b.id = logical_id and b.homework_id = target_homework_root_id) then
                raise exception 'Homework block belongs to another Homework';
              end if;
            else
              if jsonb_typeof(item -> 'client_id') <> 'string' then raise exception 'New Homework block requires a client ID'; end if;
              if btrim(item ->> 'client_id') = '' or char_length(item ->> 'client_id') > 100
                or (item ->> 'client_id') = any(seen_client_ids) then raise exception 'Invalid or duplicate Homework client ID'; end if;
              seen_client_ids := array_append(seen_client_ids, item ->> 'client_id');
              logical_id := null;
            end if;
          end if;
          if logical_id is not null then
            if logical_id = any(seen_logical_ids) then raise exception 'Duplicate Homework logical block ID'; end if;
            seen_logical_ids := array_append(seen_logical_ids, logical_id);
          end if;
        end loop;

        delete from public.homework_version_blocks vb
        where vb.homework_version_id = version_id and not (vb.id = any(seen_snapshots))
          and not (vb.homework_block_id = any(seen_logical_ids));
        select coalesce(max(position), -1)::bigint + count(*) + jsonb_array_length(target_homework_blocks) + 1
        into offset_value from public.homework_version_blocks where homework_version_id = version_id;
        update public.homework_version_blocks set position = position + offset_value
        where homework_version_id = version_id;

        item_position := 0;
        for item in select value from jsonb_array_elements(target_homework_blocks) as blocks(value) loop
          item_type := item ->> 'block_type';
          item_title := nullif(btrim(item ->> 'title'), '');
          item_description := nullif(btrim(item ->> 'description'), '');
          item_url := case when item_type = 'video_link' then btrim(item ->> 'url') else null end;
          item_content := case when item_type in ('rich_text','long_answer') then item -> 'rich_text_content' else null end;
          logical_id := case when item ? 'homework_block_id' and jsonb_typeof(item -> 'homework_block_id') = 'string'
            then (item ->> 'homework_block_id')::uuid else null end;
          snapshot_exists := false;
          if item ? 'id' and jsonb_typeof(item -> 'id') = 'string' then
            submitted_snapshot_id := (item ->> 'id')::uuid;
            select vb.id, vb.homework_block_id into snapshot_id, logical_id from public.homework_version_blocks vb
            where vb.id = submitted_snapshot_id and vb.homework_version_id = version_id;
            snapshot_exists := found;
            if not snapshot_exists and source_version_id is not null then
              select vb.homework_block_id into logical_id from public.homework_version_blocks vb
              where vb.id = submitted_snapshot_id and vb.homework_version_id = source_version_id;
              if found then
                select vb.id into snapshot_id from public.homework_version_blocks vb
                where vb.homework_version_id = version_id and vb.homework_block_id = logical_id;
                snapshot_exists := found;
              end if;
            end if;
          end if;
          if snapshot_exists then
            update public.homework_version_blocks set block_type = item_type, position = item_position,
              title = item_title, rich_text_content = item_content, url = item_url, description = item_description
            where id = snapshot_id and homework_version_id = version_id;
          else
            if logical_id is null and item ? 'homework_block_id' and jsonb_typeof(item -> 'homework_block_id') = 'string' then
              logical_id := (item ->> 'homework_block_id')::uuid;
            end if;
            if logical_id is null then
              insert into public.homework_blocks(homework_id) values(target_homework_root_id) returning id into logical_id;
            end if;
            insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, rich_text_content, url, description)
            values(version_id, logical_id, item_type, item_position, item_title, item_content, item_url, item_description)
            returning id into snapshot_id;
          end if;
          saved_blocks := saved_blocks || jsonb_build_array(jsonb_build_object(
            'id', snapshot_id, 'homework_block_id', logical_id, 'block_type', item_type,
            'position', item_position, 'title', item_title, 'rich_text_content', item_content,
            'url', item_url, 'description', item_description,
            'client_id', case when jsonb_typeof(item -> 'client_id') = 'string' then item ->> 'client_id' else null end
          ));
          item_position := item_position + 1;
        end loop;
      end if;

      if publish_homework and version_id is not null then
        if (select count(*) from public.homework_version_blocks where homework_version_id = version_id) > 0 then
          perform public.publish_homework_version(version_id);
          select version_number into published_version_number from public.homework_versions where id = version_id;
        end if;
      elsif publish_homework and target_homework_version_id is not null then
        raise exception 'Select a valid Homework draft or remove the unavailable Homework selection';
      end if;
    end if;
  end if;

  if target_homework_version_id is not null and not save_homework and target_homework_root_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id',vb.id,'homework_block_id',vb.homework_block_id,
      'block_type',vb.block_type,'position',vb.position,'title',vb.title,'rich_text_content',vb.rich_text_content,
      'url',vb.url,'description',vb.description) order by vb.position),'[]'::jsonb)
    into saved_blocks from public.homework_version_blocks vb where vb.homework_version_id = target_homework_version_id;
  end if;

  return jsonb_build_object('session', session_result, 'homework', jsonb_build_object(
    'version_id', coalesce(version_id, target_homework_version_id),
    'status', case when publish_homework and published_version_number is not null then 'published'
      when version_id is not null then (select status::text from public.homework_versions where id = version_id)
      else null end,
    'version_number', published_version_number,
    'blocks', saved_blocks
  ));
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
    and exists (select 1 from public.homework_version_blocks b where b.homework_version_id = v.id)
  order by v.version_number desc limit 1;

  if selected_homework_id is not null then
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
  end if;

  insert into public.case_sessions(
    counseling_case_id, session_id, actual_sequence, template_sequence_number, title,
    homework_assignment_revision_id, material_released_at, homework_released_at,
    activated_at, activated_by
  ) values (
    target_case_id, target_session_id, 1, session_row.sequence_number, session_row.title,
    revision_id, transition_at, case when revision_id is null then null else transition_at end, transition_at, actor
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

create or replace function public.complete_case_session_schedule_next(
  target_case_session_id uuid,
  target_session_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  override_confirmation text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  target_case_id uuid;
  prior_status public.case_status;
  current_session public.case_sessions%rowtype;
  next_session public.sessions%rowtype;
  current_revision_id uuid;
  current_assignment_id uuid;
  homework_id uuid;
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
  from public.case_sessions where id = target_case_session_id;
  is_admin := private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]);
  if target_case_id is null or not (private.current_user_can_manage_counseling_case(target_case_id) or (is_admin and exists (select 1 from public.counseling_cases c where c.id = target_case_id))) then
    raise exception 'Not authorized';
  end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;

  select status into prior_status from public.counseling_cases
  where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select * into current_session from public.case_sessions
  where id = target_case_session_id and counseling_case_id = target_case_id and status = 'active'
  for update;
  if not found then raise exception 'The Couple Session is no longer active'; end if;

  select count(*)::integer, (array_agg(id order by starts_at desc))[1] into active_meeting_count, current_meeting_id
  from public.case_session_meetings
  where case_session_id = target_case_session_id and completed_at is null;
  if active_meeting_count <> 1 then raise exception 'The active Session must have exactly one scheduled Meeting'; end if;

  current_revision_id := current_session.homework_assignment_revision_id;
  if current_revision_id is not null then
    select r.homework_assignment_id into current_assignment_id
    from public.homework_assignment_revisions r
    where r.id = current_revision_id and r.ended_at is null;
    if current_assignment_id is null then raise exception 'Current Session Homework is unavailable'; end if;

    select count(*)::integer, count(*) filter (where p.status in ('submitted', 'reviewed'))::integer
    into total_partner_count, submitted_partner_count
    from public.homework_participant_progress p
    where p.assignment_revision_id = current_revision_id;

    if total_partner_count <> 2 then raise exception 'Required Homework progress for both partners is unavailable'; end if;
    if submitted_partner_count <> 2 then
      if not is_admin or override_confirmation is distinct from 'OVERRIDE' then
        raise exception 'Both partners must submit Homework. Admin or Super Admin may type OVERRIDE to continue.';
      end if;
    elsif override_confirmation is not null and (not is_admin or override_confirmation is distinct from 'OVERRIDE') then
      raise exception 'OVERRIDE is only accepted when required Homework is incomplete';
    elsif submitted_partner_count = 2 then
      override_confirmation := null;
    end if;
  elsif override_confirmation is not null then
    raise exception 'OVERRIDE is only accepted when required Homework is incomplete';
  end if;

  select * into next_session from public.sessions
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

  select h.id, v.id into homework_id, selected_version_id
  from public.homeworks h
  join public.homework_versions v on v.homework_id = h.id and v.status = 'published'
  where h.session_id = target_session_id and h.withdrawn_at is null
    and exists (select 1 from public.homework_version_blocks b where b.homework_version_id = v.id)
  order by v.version_number desc limit 1;

  if homework_id is not null then
    insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
    values(homework_id, target_case_id, actor)
    on conflict (homework_id, counseling_case_id) where unassigned_at is null
    do update set updated_at = now()
    returning id into assignment_id;
    select r.id, r.homework_version_id into revision_id, existing_version_id
    from public.homework_assignment_revisions r
    where r.homework_assignment_id = assignment_id and r.ended_at is null for update;
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
  end if;

  update public.case_sessions
  set status = 'completed', completed_at = transition_at, completed_by = actor
  where id = target_case_session_id;

  update public.case_session_meetings
  set completed_at = transition_at, completed_by = actor
  where id = current_meeting_id;

  if current_revision_id is not null and submitted_partner_count <> 2 then
    insert into public.audit_events(actor_id, event_type, entity_type, entity_id, details)
    values(actor, 'case_session.homework_override', 'case_session', target_case_session_id,
      jsonb_build_object('homework_assignment_revision_id', current_revision_id, 'incomplete_partner_count', total_partner_count - submitted_partner_count));
  end if;

  insert into public.case_sessions(
    counseling_case_id, session_id, actual_sequence, template_sequence_number, title,
    homework_assignment_revision_id, material_released_at, homework_released_at,
    activated_at, activated_by
  ) values (
    target_case_id, target_session_id, current_session.actual_sequence + 1,
    next_session.sequence_number, next_session.title, revision_id,
    transition_at, case when revision_id is null then null else transition_at end, transition_at, actor
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

create or replace function public.complete_counseling_program(
  target_case_session_id uuid,
  override_confirmation text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  target_case_id uuid;
  prior_status public.case_status;
  current_session public.case_sessions%rowtype;
  current_meeting_id uuid;
  total_partner_count integer;
  submitted_partner_count integer;
  is_admin boolean;
begin
  select counseling_case_id into target_case_id
  from public.case_sessions where id = target_case_session_id;
  is_admin := private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]);
  if target_case_id is null or not (
    private.current_user_can_manage_counseling_case(target_case_id)
    or (is_admin and exists (select 1 from public.counseling_cases c where c.id = target_case_id))
  ) then raise exception 'Not authorized'; end if;

  select status into prior_status from public.counseling_cases
  where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select * into current_session from public.case_sessions
  where id = target_case_session_id and counseling_case_id = target_case_id and status = 'active'
  for update;
  if not found then raise exception 'The Couple Session is no longer active'; end if;
  if not current_session.is_final then
    raise exception 'Only an explicitly designated Final Session can complete the counseling program';
  end if;

  select count(*)::integer, (array_agg(id order by starts_at desc))[1]
  into total_partner_count, current_meeting_id
  from public.case_session_meetings
  where case_session_id = target_case_session_id and completed_at is null;
  if total_partner_count <> 1 then raise exception 'The active Session must have exactly one scheduled Meeting'; end if;

  if current_session.homework_assignment_revision_id is not null then
    select count(*)::integer, count(*) filter (where p.status in ('submitted', 'reviewed'))::integer
    into total_partner_count, submitted_partner_count
    from public.homework_participant_progress p
    where p.assignment_revision_id = current_session.homework_assignment_revision_id;
    if total_partner_count <> 2 then raise exception 'Required Homework progress for both partners is unavailable'; end if;
    if submitted_partner_count <> 2 then
      if not is_admin or override_confirmation is distinct from 'OVERRIDE' then
        raise exception 'Both partners must submit Homework. Admin or Super Admin may type OVERRIDE to continue.';
      end if;
    elsif override_confirmation is not null then
      raise exception 'OVERRIDE is only accepted when required Homework is incomplete';
    end if;
  elsif override_confirmation is not null then
    raise exception 'OVERRIDE is only accepted when required Homework is incomplete';
  end if;

  update public.case_sessions
  set status = 'completed', completed_at = transition_at, completed_by = actor
  where id = target_case_session_id;
  update public.case_session_meetings
  set completed_at = transition_at, completed_by = actor
  where id = current_meeting_id;
  update public.counseling_cases
  set status = 'finished', closed_at = transition_at
  where id = target_case_id;
  insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason)
  values (target_case_id, prior_status, 'finished', actor, 'Counseling program completed');

  if current_session.homework_assignment_revision_id is not null and submitted_partner_count <> 2 then
    insert into public.audit_events(actor_id, event_type, entity_type, entity_id, details)
    values(actor, 'case_session.homework_override', 'case_session', target_case_session_id,
      jsonb_build_object('homework_assignment_revision_id', current_session.homework_assignment_revision_id,
        'incomplete_partner_count', total_partner_count - submitted_partner_count,
        'operation', 'complete_program'));
  end if;
end;
$$;
