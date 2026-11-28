-- Move authored Session Builder content without touching published snapshots,
-- assignments, Homework answers, or history. All source removal and destination
-- insertion occurs in the same transaction under ordered Session locks.
create or replace function public.move_session_builder_content_between_sessions(
  source_session_id uuid,
  destination_session_id uuid,
  move_kind text,
  source_item_id uuid,
  source_homework_version_id uuid,
  source_session_updated_at timestamptz,
  source_homework_updated_at timestamptz,
  destination_homework_version_id uuid,
  destination_session_updated_at timestamptz,
  destination_homework_updated_at timestamptz,
  destination_page_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  source_session public.sessions%rowtype;
  destination_session public.sessions%rowtype;
  source_homework_id uuid;
  destination_homework_id uuid;
  source_version public.homework_versions%rowtype;
  destination_version public.homework_versions%rowtype;
  source_draft_id uuid;
  destination_draft_id uuid;
  source_base_version_id uuid;
  source_manifest jsonb;
  destination_manifest jsonb;
  source_page jsonb;
  source_block_description text;
  moved_page_id uuid;
  moved_page_title text;
  destination_position integer;
  source_position_offset bigint;
  row_item record;
  selected_logical_id uuid;
  side_by_side_group_id text;
  selected_page_block_count integer;
  source_item_type text;
  source_revision_checked boolean := false;
  destination_revision_checked boolean := false;
  moved_count integer := 0;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if source_session_id is null or destination_session_id is null or source_session_id = destination_session_id
    or source_item_id is null or move_kind is null
    or move_kind not in ('session_material_page','session_material_resource','homework_page','homework_block') then
    raise exception 'Invalid Session content move';
  end if;

  -- A stable parent lock order serializes moves with one another and with the
  -- existing save RPCs, which lock their Session before authored child rows.
  perform 1 from public.sessions s
    where s.id in (source_session_id, destination_session_id)
    order by s.id for update;
  select * into source_session from public.sessions where id = source_session_id;
  select * into destination_session from public.sessions where id = destination_session_id;
  if source_session.id is null or destination_session.id is null
    or source_session.status = 'archived' or destination_session.status = 'archived' then
    raise exception 'A source or destination Session is unavailable';
  end if;
  if source_session.updated_at is distinct from source_session_updated_at
    or destination_session.updated_at is distinct from destination_session_updated_at then
    raise exception 'Session content changed. Reload both Sessions and try again.';
  end if;

  if move_kind in ('session_material_page','session_material_resource') then
    -- Session Material has no independent versioned draft table. The Session
    -- itself is therefore the edit boundary; never change a published template
    -- whose released Couple copies are immutable snapshots.
    if source_session.status <> 'draft' or destination_session.status <> 'draft' then
      raise exception 'Session Material moves require Draft Sessions';
    end if;
    select b.block_type into source_item_type from public.session_material_blocks b
      where b.id = source_item_id and b.session_id = source_session_id for update;
    if not found
      or (move_kind = 'session_material_page' and source_item_type <> 'rich_text')
      or (move_kind = 'session_material_resource' and source_item_type = 'rich_text') then
      raise exception 'The selected Session Material is no longer available to move';
    end if;
    select coalesce(max(position), -1) + 1 into destination_position
      from public.session_material_blocks where session_id = destination_session_id;
    update public.session_material_blocks set session_id = destination_session_id, position = destination_position
      where id = source_item_id and session_id = source_session_id;

    select coalesce(max(position), -1)::bigint + count(*) + 1 into source_position_offset
      from public.session_material_blocks where session_id = source_session_id;
    update public.session_material_blocks set position = position + source_position_offset
      where session_id = source_session_id;
    with ordered as (
      select id, row_number() over (order by position) - 1 as next_position
      from public.session_material_blocks where session_id = source_session_id
    )
    update public.session_material_blocks b set position = ordered.next_position::integer
      from ordered where b.id = ordered.id;

    update public.sessions set updated_at = now() where id in (source_session_id, destination_session_id);
    return jsonb_build_object('kind', move_kind, 'source_session_id', source_session_id,
      'destination_session_id', destination_session_id, 'moved_item_id', source_item_id);
  end if;

  -- Homework uses immutable version snapshots, and logical block identities are
  -- scoped to one Homework root. A move therefore creates destination-owned
  -- identities while deleting only rows in the editable source Draft.
  select h.id into source_homework_id from public.homeworks h
    where h.session_id = source_session_id and h.withdrawn_at is null for update;
  if source_homework_id is null then raise exception 'Source Homework is unavailable'; end if;
  select v.* into source_version from public.homework_versions v
    where v.homework_id = source_homework_id and v.status = 'draft' for update;
  if found then
    source_draft_id := source_version.id;
    if source_homework_version_id is distinct from source_draft_id then
      raise exception 'Homework Draft changed. Reload and try again.';
    end if;
  else
    select v.* into source_version from public.homework_versions v
      where v.homework_id = source_homework_id and v.status = 'published'
      order by v.version_number desc limit 1 for update;
    if not found or source_version.id is distinct from source_homework_version_id
      or source_version.updated_at is distinct from source_homework_updated_at then
      raise exception 'Homework version changed. Reload and try again.';
    end if;
    source_revision_checked := true;
    source_base_version_id := source_version.id;
    source_draft_id := public.get_or_create_homework_draft(source_homework_id, source_base_version_id);
    select v.* into source_version from public.homework_versions v where v.id = source_draft_id for update;
  end if;
  if source_version.status <> 'draft'
    or (not source_revision_checked and source_version.updated_at is distinct from source_homework_updated_at)
    or exists (select 1 from public.homework_assignment_revisions r where r.homework_version_id = source_draft_id) then
    raise exception 'Source Homework Draft changed or is not editable';
  end if;

  select h.id into destination_homework_id from public.homeworks h
    where h.session_id = destination_session_id and h.withdrawn_at is null for update;
  if destination_homework_id is null then
    if move_kind <> 'homework_page' then raise exception 'Destination Homework page is unavailable'; end if;
    destination_draft_id := public.get_or_create_homework_draft_for_session(destination_session_id);
    select h.id into destination_homework_id from public.homeworks h
      where h.session_id = destination_session_id and h.withdrawn_at is null for update;
    select v.* into destination_version from public.homework_versions v where v.id = destination_draft_id for update;
  else
    select v.* into destination_version from public.homework_versions v
      where v.homework_id = destination_homework_id and v.status = 'draft' for update;
    if found then
      destination_draft_id := destination_version.id;
      if destination_homework_version_id is distinct from destination_draft_id then
        raise exception 'Destination Homework Draft changed. Reload and try again.';
      end if;
    else
      select v.* into destination_version from public.homework_versions v
        where v.homework_id = destination_homework_id and v.status = 'published'
        order by v.version_number desc limit 1 for update;
      if found then
        if destination_version.id is distinct from destination_homework_version_id then
          raise exception 'Destination Homework changed. Reload and try again.';
        end if;
        if destination_version.updated_at is distinct from destination_homework_updated_at then
          raise exception 'Destination Homework changed. Reload and try again.';
        end if;
        destination_revision_checked := true;
        destination_draft_id := public.get_or_create_homework_draft(destination_homework_id, destination_version.id);
        select v.* into destination_version from public.homework_versions v where v.id = destination_draft_id for update;
      elsif move_kind = 'homework_page' and destination_homework_version_id is null then
        destination_draft_id := public.get_or_create_homework_draft(destination_homework_id, null);
        select v.* into destination_version from public.homework_versions v where v.id = destination_draft_id for update;
      else
        raise exception 'Destination Homework page is unavailable';
      end if;
    end if;
  end if;
  if destination_version.status <> 'draft'
    or exists (select 1 from public.homework_assignment_revisions r where r.homework_version_id = destination_draft_id) then
    raise exception 'Destination Homework Draft is not editable';
  end if;
  if destination_homework_version_id is not null and not destination_revision_checked
    and destination_version.updated_at is distinct from destination_homework_updated_at then
    raise exception 'Destination Homework changed. Reload and try again.';
  elsif destination_homework_version_id is null and destination_homework_updated_at is not null then
    raise exception 'Destination Homework changed. Reload and try again.';
  end if;

  source_manifest := source_version.page_manifest;
  if source_manifest is null then
    source_manifest := jsonb_build_array(jsonb_build_object(
      'id','00000000-0000-4000-8000-000000000001','title','Page 1','position',0));
    update public.homework_version_blocks set page_id = '00000000-0000-4000-8000-000000000001'::uuid
      where homework_version_id = source_draft_id and page_id is null;
    update public.homework_versions set page_manifest = source_manifest where id = source_draft_id;
  end if;
  destination_manifest := destination_version.page_manifest;
  if destination_manifest is null then
    destination_manifest := case when exists (select 1 from public.homework_version_blocks where homework_version_id = destination_draft_id)
      then jsonb_build_array(jsonb_build_object(
        'id','00000000-0000-4000-8000-000000000001','title','Page 1','position',0)) else '[]'::jsonb end;
    update public.homework_version_blocks set page_id = '00000000-0000-4000-8000-000000000001'::uuid
      where homework_version_id = destination_draft_id and page_id is null;
    update public.homework_versions set page_manifest = destination_manifest where id = destination_draft_id;
  end if;

  if move_kind = 'homework_page' then
    select p.value into source_page from jsonb_array_elements(source_manifest) p(value)
      where p.value ->> 'id' = source_item_id::text;
    if source_page is null then raise exception 'The selected Homework page is no longer available to move'; end if;
    if jsonb_array_length(source_manifest) <= 1 then raise exception 'Add another Homework page before moving the only page'; end if;
    moved_page_title := source_page ->> 'title';
    moved_page_id := gen_random_uuid();
    destination_position := jsonb_array_length(destination_manifest);
    destination_manifest := destination_manifest || jsonb_build_array(jsonb_build_object(
      'id',moved_page_id,'title',moved_page_title,'position',destination_position));
    source_manifest := (select coalesce(jsonb_agg(
      jsonb_set(p.value, '{position}', to_jsonb((p.ordinality - 1)::integer), true)
      order by p.ordinality), '[]'::jsonb)
      from jsonb_array_elements(source_manifest) with ordinality p(value, ordinality)
      where p.value ->> 'id' <> source_item_id::text);
    for row_item in select b.* from public.homework_version_blocks b
      where b.homework_version_id = source_draft_id and b.page_id = source_item_id order by b.position for update
    loop
      insert into public.homework_blocks(homework_id) values(destination_homework_id) returning id into selected_logical_id;
      insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title,
        rich_text_content, url, description, question_choices, is_required, page_id)
      values(destination_draft_id, selected_logical_id, row_item.block_type,
        coalesce((select max(position) + 1 from public.homework_version_blocks where homework_version_id = destination_draft_id), 0),
        row_item.title, row_item.rich_text_content, row_item.url, row_item.description,
        row_item.question_choices, row_item.is_required, moved_page_id);
      delete from public.homework_version_blocks where id = row_item.id;
      moved_count := moved_count + 1;
    end loop;
    update public.homework_versions set page_manifest = source_manifest where id = source_draft_id;
    update public.homework_versions set page_manifest = destination_manifest where id = destination_draft_id;
  else
    if not exists (select 1 from jsonb_array_elements(destination_manifest) p(value)
      where p.value ->> 'id' = destination_page_id::text) then
      raise exception 'Destination Homework page is unavailable';
    end if;
    select b.homework_block_id, b.description into selected_logical_id, source_block_description
      from public.homework_version_blocks b where b.id = source_item_id and b.homework_version_id = source_version.id;
    -- Published IDs are translated to their editable source-Draft snapshots.
    if not found and source_base_version_id is not null then
      select b.homework_block_id, b.description into selected_logical_id, source_block_description
        from public.homework_version_blocks b where b.id = source_item_id and b.homework_version_id = source_base_version_id;
    end if;
    if selected_logical_id is null then raise exception 'The selected Homework item is no longer available to move'; end if;
    if source_base_version_id is not null then
      select b.description into source_block_description from public.homework_version_blocks b
        where b.homework_version_id = source_draft_id and b.homework_block_id = selected_logical_id;
    end if;
    side_by_side_group_id := private.homework_side_by_side_metadata(source_block_description) ->> 'groupId';
    if side_by_side_group_id is not null then
      select count(*) into selected_page_block_count from public.homework_version_blocks b
        where b.homework_version_id = source_draft_id
          and private.homework_side_by_side_metadata(b.description) ->> 'groupId' = side_by_side_group_id;
      if selected_page_block_count <> 2 then raise exception 'The selected Side-by-Side item is incomplete'; end if;
    end if;
    for row_item in select b.* from public.homework_version_blocks b
      where b.homework_version_id = source_draft_id and (
        (side_by_side_group_id is null and b.homework_block_id = selected_logical_id)
        or (side_by_side_group_id is not null and private.homework_side_by_side_metadata(b.description) ->> 'groupId' = side_by_side_group_id)
      ) order by b.position for update
    loop
      insert into public.homework_blocks(homework_id) values(destination_homework_id) returning id into selected_logical_id;
      insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title,
        rich_text_content, url, description, question_choices, is_required, page_id)
      values(destination_draft_id, selected_logical_id, row_item.block_type,
        coalesce((select max(position) + 1 from public.homework_version_blocks where homework_version_id = destination_draft_id), 0),
        row_item.title, row_item.rich_text_content, row_item.url, row_item.description,
        row_item.question_choices, row_item.is_required, destination_page_id);
      delete from public.homework_version_blocks where id = row_item.id;
      moved_count := moved_count + 1;
    end loop;
  end if;
  if moved_count = 0 and move_kind <> 'homework_page' then raise exception 'No editable Homework content was moved'; end if;

  -- The source can be empty while being drafted, but every page remains in its
  -- manifest; publishing continues to enforce the existing nonempty-page rule.
  select coalesce(max(position), -1)::bigint + count(*) + 1 into source_position_offset
    from public.homework_version_blocks where homework_version_id = source_draft_id;
  update public.homework_version_blocks set position = position + source_position_offset
    where homework_version_id = source_draft_id;
  with ordered as (
    select id, row_number() over (order by position) - 1 as next_position
    from public.homework_version_blocks where homework_version_id = source_draft_id
  )
  update public.homework_version_blocks b set position = ordered.next_position::integer
    from ordered where b.id = ordered.id;
  update public.homework_versions set updated_at = now() where id in (source_draft_id, destination_draft_id);
  update public.sessions set updated_at = now() where id in (source_session_id, destination_session_id);

  return jsonb_build_object('kind', move_kind, 'source_session_id', source_session_id,
    'destination_session_id', destination_session_id, 'source_homework_version_id', source_draft_id,
    'destination_homework_version_id', destination_draft_id, 'moved_count', moved_count,
    'destination_page_id', case when move_kind = 'homework_page' then moved_page_id else destination_page_id end,
    'destination_page_title', case when move_kind = 'homework_page' then moved_page_title else null end);
end;
$$;

revoke all on function public.move_session_builder_content_between_sessions(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,timestamptz,uuid) from public, anon;
grant execute on function public.move_session_builder_content_between_sessions(uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,timestamptz,timestamptz,uuid) to authenticated;
