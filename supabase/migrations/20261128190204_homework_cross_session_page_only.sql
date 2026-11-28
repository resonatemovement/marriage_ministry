-- Keep the already-reviewed atomic implementation as a private helper. The
-- public RPC becomes a narrow compatibility boundary that rejects individual
-- Homework block moves before any Session locks or mutations occur.
alter function public.move_session_builder_content_between_sessions(
  uuid, uuid, text, uuid, uuid, timestamptz, timestamptz, uuid, timestamptz, timestamptz, uuid
) rename to move_session_builder_content_between_sessions_impl;

alter function public.move_session_builder_content_between_sessions_impl(
  uuid, uuid, text, uuid, uuid, timestamptz, timestamptz, uuid, timestamptz, timestamptz, uuid
) set schema private;

revoke all on function private.move_session_builder_content_between_sessions_impl(
  uuid, uuid, text, uuid, uuid, timestamptz, timestamptz, uuid, timestamptz, timestamptz, uuid
) from public, anon, authenticated;

create function public.move_session_builder_content_between_sessions(
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
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;

  if move_kind = 'homework_block' then
    raise exception 'Homework items can only be moved as a complete page';
  end if;
  if move_kind not in ('session_material_page','session_material_resource','homework_page') then
    raise exception 'Invalid Session content move';
  end if;

  return private.move_session_builder_content_between_sessions_impl(
    source_session_id, destination_session_id, move_kind, source_item_id,
    source_homework_version_id, source_session_updated_at, source_homework_updated_at,
    destination_homework_version_id, destination_session_updated_at,
    destination_homework_updated_at, destination_page_id
  );
end;
$$;

revoke all on function public.move_session_builder_content_between_sessions(
  uuid, uuid, text, uuid, uuid, timestamptz, timestamptz, uuid, timestamptz, timestamptz, uuid
) from public, anon;
grant execute on function public.move_session_builder_content_between_sessions(
  uuid, uuid, text, uuid, uuid, timestamptz, timestamptz, uuid, timestamptz, timestamptz, uuid
) to authenticated;
