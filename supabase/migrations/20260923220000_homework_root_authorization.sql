create function public.get_or_create_homework_draft_for_session(target_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_homework_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;

  perform 1 from public.sessions where id = target_session_id;
  if not found then raise exception 'Session is unavailable'; end if;

  insert into public.homeworks (session_id)
  values (target_session_id)
  on conflict (session_id) do nothing
  returning id into target_homework_id;

  if target_homework_id is null then
    select id into target_homework_id from public.homeworks where session_id = target_session_id for update;
  end if;

  if exists (select 1 from public.homeworks where id = target_homework_id and withdrawn_at is not null) then
    raise exception 'Homework is withdrawn';
  end if;

  return public.get_or_create_homework_draft(target_homework_id);
end;
$$;

revoke insert, update, delete on public.homeworks from authenticated;
grant select on public.homeworks to authenticated;

revoke all on function public.get_or_create_homework_draft_for_session(uuid) from public, anon;
grant execute on function public.get_or_create_homework_draft_for_session(uuid) to authenticated;
