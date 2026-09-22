create or replace function public.reorder_session_material_blocks(target_session_id uuid, target_block_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare expected_count integer; offset_value integer;
begin
  if not (select private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[])) then raise exception 'Not authorized'; end if;
  perform 1 from public.sessions where id = target_session_id and status <> 'archived' for update;
  if not found then raise exception 'Session is unavailable'; end if;
  select count(*) into expected_count from public.session_material_blocks where session_id = target_session_id;
  if expected_count <> coalesce(array_length(target_block_ids, 1), 0) or expected_count <> (select count(distinct value) from unnest(target_block_ids) as value) or exists (select 1 from public.session_material_blocks where session_id = target_session_id and id <> all(target_block_ids)) then raise exception 'Invalid material order'; end if;
  select coalesce(max(position), -1) + expected_count + 1 into offset_value from public.session_material_blocks where session_id = target_session_id;
  update public.session_material_blocks set position = position + offset_value where session_id = target_session_id;
  update public.session_material_blocks block set position = ordered.ordinality - 1 from unnest(target_block_ids) with ordinality as ordered(id, ordinality) where block.session_id = target_session_id and block.id = ordered.id;
end;
$$;

create or replace function public.duplicate_session_material_block(target_block_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source_block public.session_material_blocks; copied_id uuid; ordered_ids uuid[];
begin
  if not (select private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[])) then raise exception 'Not authorized'; end if;
  select * into source_block from public.session_material_blocks where id = target_block_id for update;
  if not found or exists (select 1 from public.sessions where id = source_block.session_id and status = 'archived') then raise exception 'Material block is unavailable'; end if;
  insert into public.session_material_blocks(session_id, block_type, position, title, rich_text_content, url, description) values (source_block.session_id, source_block.block_type, (select coalesce(max(position), -1) + 1 from public.session_material_blocks where session_id = source_block.session_id), source_block.title, source_block.rich_text_content, source_block.url, source_block.description) returning id into copied_id;
  select array_agg(id order by case when id = copied_id then source_block.position + 0.5 else position end) into ordered_ids from public.session_material_blocks where session_id = source_block.session_id;
  perform public.reorder_session_material_blocks(source_block.session_id, ordered_ids);
  return copied_id;
end;
$$;

create or replace function public.delete_session_material_block(target_block_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare session_value uuid; ordered_ids uuid[];
begin
  if not (select private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[])) then raise exception 'Not authorized'; end if;
  select session_id into session_value from public.session_material_blocks where id = target_block_id for update;
  if not found or exists (select 1 from public.sessions where id = session_value and status = 'archived') then raise exception 'Material block is unavailable'; end if;
  delete from public.session_material_blocks where id = target_block_id;
  select array_agg(id order by position) into ordered_ids from public.session_material_blocks where session_id = session_value;
  perform public.reorder_session_material_blocks(session_value, coalesce(ordered_ids, '{}'::uuid[]));
end;
$$;

grant execute on function public.reorder_session_material_blocks(uuid, uuid[]) to authenticated;
grant execute on function public.duplicate_session_material_block(uuid) to authenticated;
grant execute on function public.delete_session_material_block(uuid) to authenticated;
