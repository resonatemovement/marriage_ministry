-- One authoritative, transactional save for the Session title and its ordered material.
create function public.save_session_builder_state(
  target_session_id uuid,
  target_title text,
  target_material jsonb,
  target_intent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  session_row public.sessions%rowtype;
  item jsonb;
  item_id uuid;
  item_client_id text;
  item_type text;
  item_title text;
  item_description text;
  item_url text;
  item_content jsonb;
  saved_id uuid;
  seen_ids uuid[] := '{}'::uuid[];
  seen_client_ids text[] := '{}'::text[];
  ordered_blocks jsonb := '[]'::jsonb;
  block_count integer;
  temporary_offset bigint;
  ordinal bigint;
  final_status public.session_status;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;

  target_title := btrim(coalesce(target_title, ''));
  if target_title = '' or char_length(target_title) > 180 then
    raise exception 'Enter a valid session title';
  end if;
  if target_intent not in ('save', 'publish') or target_intent is null then
    raise exception 'Invalid Session save intent';
  end if;
  if target_material is null or jsonb_typeof(target_material) <> 'array' then
    raise exception 'Session Material must be an array';
  end if;

  block_count := jsonb_array_length(target_material);
  if target_session_id is not null then
    select * into session_row from public.sessions where id = target_session_id for update;
    if not found or session_row.status = 'archived' then
      raise exception 'Session is unavailable';
    end if;
    if target_intent = 'publish' and session_row.status <> 'draft' then
      raise exception 'Only a Draft Session can be published';
    end if;
  end if;
  if (target_intent = 'publish' or session_row.status = 'published') and block_count = 0 then
    raise exception 'Add at least one Session Material block before publishing';
  end if;

  -- Validate the complete submitted state before changing either table.
  for item in select value from jsonb_array_elements(target_material) as elements(value) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Invalid Session Material block';
    end if;
    if exists (
      select 1 from jsonb_object_keys(item) as keys(key)
      where keys.key not in ('id', 'client_id', 'block_type', 'title', 'rich_text_content', 'url', 'description')
    ) then
      raise exception 'Unsupported Session Material field';
    end if;
    if (item ? 'title' and jsonb_typeof(item -> 'title') not in ('string', 'null'))
      or (item ? 'description' and jsonb_typeof(item -> 'description') not in ('string', 'null')) then
      raise exception 'Invalid Session Material text field';
    end if;

    item_type := item ->> 'block_type';
    item_title := nullif(btrim(item ->> 'title'), '');
    item_description := nullif(btrim(item ->> 'description'), '');
    item_url := nullif(btrim(item ->> 'url'), '');
    item_content := item -> 'rich_text_content';

    if item_type not in ('rich_text', 'video_link') or item_type is null then
      raise exception 'Unsupported Session Material type';
    end if;
    if item_title is not null and char_length(item_title) > 180 then
      raise exception 'Session Material title is too long';
    end if;
    if item_type = 'rich_text' then
      if jsonb_typeof(item_content) is distinct from 'object' or item_url is not null then
        raise exception 'Invalid Rich Text material';
      end if;
      if (target_intent = 'publish' or session_row.status = 'published')
        and not private.homework_json_has_meaningful_text(item_content) then
        raise exception 'Rich Text material cannot be empty';
      end if;
    else
      if (item_content is not null and jsonb_typeof(item_content) <> 'null')
        or jsonb_typeof(item -> 'url') is distinct from 'string'
        or not coalesce(item_url ~* '^https?://[[:alnum:]][[:alnum:].-]*(:[0-9]+)?([/?#]|$)', false) then
        raise exception 'Enter a valid http or https URL for the Video / Link block';
      end if;
    end if;

    if item ? 'id' and jsonb_typeof(item -> 'id') <> 'null' then
      if jsonb_typeof(item -> 'id') <> 'string' or target_session_id is null then
        raise exception 'Invalid persisted Session Material ID';
      end if;
      item_id := (item ->> 'id')::uuid;
      if item_id = any(seen_ids) then raise exception 'Duplicate Session Material ID'; end if;
      seen_ids := array_append(seen_ids, item_id);
      if not exists (
        select 1 from public.session_material_blocks
        where id = item_id and session_id = target_session_id
      ) then
        raise exception 'Session Material block does not belong to this Session';
      end if;
    else
      if jsonb_typeof(item -> 'client_id') <> 'string' then
        raise exception 'New Session Material requires a client ID';
      end if;
      item_client_id := btrim(item ->> 'client_id');
      if item_client_id = '' or char_length(item_client_id) > 100 or item_client_id = any(seen_client_ids) then
        raise exception 'Invalid or duplicate Session Material client ID';
      end if;
      seen_client_ids := array_append(seen_client_ids, item_client_id);
    end if;
  end loop;

  if target_session_id is null then
    insert into public.sessions (title, created_by, status)
    values (target_title, actor, 'draft') returning * into session_row;
    target_session_id := session_row.id;
  else
    -- The array is authoritative. Only this Session's omitted blocks are removed.
    delete from public.session_material_blocks
    where session_id = target_session_id and not (id = any(seen_ids));

    -- Move retained rows out of the final position range before assigning 0..N-1.
    select coalesce(max(position), -1)::bigint + count(*) + block_count + 1
    into temporary_offset from public.session_material_blocks
    where session_id = target_session_id;
    update public.session_material_blocks
    set position = position + temporary_offset
    where session_id = target_session_id;
  end if;

  for item, ordinal in
    select value, ordinality from jsonb_array_elements(target_material) with ordinality as elements(value, ordinality)
  loop
    item_type := item ->> 'block_type';
    item_title := nullif(btrim(item ->> 'title'), '');
    item_description := nullif(btrim(item ->> 'description'), '');
    item_url := case when item_type = 'video_link' then btrim(item ->> 'url') else null end;
    item_content := case when item_type = 'rich_text' then item -> 'rich_text_content' else null end;
    item_client_id := case when item ? 'id' and jsonb_typeof(item -> 'id') <> 'null'
      then null else item ->> 'client_id' end;

    if item_client_id is null then
      saved_id := (item ->> 'id')::uuid;
      update public.session_material_blocks
      set block_type = item_type, position = (ordinal - 1)::integer,
          title = item_title, rich_text_content = item_content,
          url = item_url, description = item_description
      where id = saved_id and session_id = target_session_id;
    else
      insert into public.session_material_blocks
        (session_id, block_type, position, title, rich_text_content, url, description)
      values
        (target_session_id, item_type, (ordinal - 1)::integer,
         item_title, item_content, item_url, item_description)
      returning id into saved_id;
    end if;

    ordered_blocks := ordered_blocks || jsonb_build_array(jsonb_build_object(
      'id', saved_id, 'client_id', item_client_id, 'block_type', item_type,
      'position', ordinal - 1, 'title', item_title,
      'rich_text_content', item_content, 'url', item_url,
      'description', item_description
    ));
  end loop;

  final_status := case when target_intent = 'publish' then 'published'::public.session_status
    else session_row.status end;
  update public.sessions
  set title = target_title, status = final_status
  where id = target_session_id;

  return jsonb_build_object(
    'session_id', target_session_id,
    'status', final_status,
    'title', target_title,
    'blocks', ordered_blocks
  );
end;
$$;

revoke all on function public.save_session_builder_state(uuid, text, jsonb, text) from public, anon;
grant execute on function public.save_session_builder_state(uuid, text, jsonb, text) to authenticated;
