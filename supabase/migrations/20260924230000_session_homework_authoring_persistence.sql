create function public.save_session_homework_authoring_state(
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
        if not found then raise exception 'Homework version is unavailable'; end if;
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

      if publish_homework then
        if version_id is null then raise exception 'Homework version is unavailable'; end if;
        if (select count(*) from public.homework_version_blocks where homework_version_id = version_id) > 0 then
          perform public.publish_homework_version(version_id);
          select version_number into published_version_number from public.homework_versions where id = version_id;
        end if;
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

revoke all on function public.save_session_homework_authoring_state(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text) from public, anon;
grant execute on function public.save_session_homework_authoring_state(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text) to authenticated;
