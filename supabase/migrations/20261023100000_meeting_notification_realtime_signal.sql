create table public.meeting_notification_update_signals (
  meeting_id uuid primary key references public.case_session_meetings(id) on delete cascade,
  counseling_case_id uuid not null references public.counseling_cases(id) on delete cascade,
  revision bigint not null default 1,
  constraint meeting_notification_update_signals_revision_positive check (revision > 0)
);

alter table public.meeting_notification_update_signals enable row level security;
revoke all on public.meeting_notification_update_signals from public, anon, authenticated;
grant select on public.meeting_notification_update_signals to authenticated;
grant all on public.meeting_notification_update_signals to service_role;

create policy meeting_notification_update_signals_admin_read
on public.meeting_notification_update_signals
for select
to authenticated
using ((select private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])));

create policy meeting_notification_update_signals_case_staff_read
on public.meeting_notification_update_signals
for select
to authenticated
using ((select private.current_user_can_manage_counseling_case(counseling_case_id)));

create or replace function private.advance_meeting_notification_update_signal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.meeting_id is null or new.counseling_case_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if row(new.status, new.error_category, new.error_message)
      is not distinct from row(old.status, old.error_category, old.error_message) then
      return new;
    end if;
  end if;

  if not exists (
    select 1
    from public.case_session_meetings meeting
    where meeting.id = new.meeting_id
      and meeting.counseling_case_id = new.counseling_case_id
  ) then
    return new;
  end if;

  insert into public.meeting_notification_update_signals (
    meeting_id,
    counseling_case_id,
    revision
  ) values (
    new.meeting_id,
    new.counseling_case_id,
    1
  )
  on conflict (meeting_id) do update
  set counseling_case_id = excluded.counseling_case_id,
      revision = public.meeting_notification_update_signals.revision + 1;

  return new;
end;
$$;

revoke all on function private.advance_meeting_notification_update_signal() from public, anon, authenticated;

create trigger advance_meeting_notification_update_signal
after insert or update of status, error_category, error_message
on public.notification_deliveries
for each row
execute function private.advance_meeting_notification_update_signal();

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_notification_update_signals'
  ) then
    alter publication supabase_realtime
      add table public.meeting_notification_update_signals;
  end if;
end
$$;
