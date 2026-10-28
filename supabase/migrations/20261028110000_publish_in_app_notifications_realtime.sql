create or replace function public.mark_in_app_notification_read(target_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.in_app_notifications
    where id = target_notification_id
      and recipient_profile_id = auth.uid()
  ) then return false; end if;
  update public.in_app_notifications
  set read_at = coalesce(read_at, now())
  where id = target_notification_id
    and recipient_profile_id = auth.uid();
  return true;
end;
$$;
revoke all on function public.mark_in_app_notification_read(uuid) from public, anon;
grant execute on function public.mark_in_app_notification_read(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'in_app_notifications'
  ) then
    alter publication supabase_realtime add table public.in_app_notifications;
  end if;
end;
$$;
