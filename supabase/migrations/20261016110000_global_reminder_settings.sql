create table public.global_reminder_settings (
  id text primary key default 'global' check (id = 'global'),
  meeting_enabled boolean not null default true,
  meeting_hours_before integer not null default 24 check (meeting_hours_before between 1 and 720),
  homework_enabled boolean not null default true,
  homework_hours_before integer not null default 72 check (homework_hours_before between 1 and 720),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.global_reminder_settings enable row level security;

insert into public.global_reminder_settings (
  id,
  meeting_enabled,
  meeting_hours_before,
  homework_enabled,
  homework_hours_before,
  updated_at
) values ('global', true, 24, true, 72, '1970-01-01 00:00:00+00');

revoke all on public.global_reminder_settings from public, anon, authenticated;
grant select on public.global_reminder_settings to authenticated;
grant select on public.global_reminder_settings to service_role;

create policy global_reminder_settings_admin_read
on public.global_reminder_settings
for select
to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create or replace function public.update_global_reminder_settings(
  next_meeting_enabled boolean,
  next_meeting_hours_before integer,
  next_homework_enabled boolean,
  next_homework_hours_before integer
) returns public.global_reminder_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result public.global_reminder_settings;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;

  if next_meeting_hours_before is null or next_meeting_hours_before not between 1 and 720
    or next_homework_hours_before is null or next_homework_hours_before not between 1 and 720 then
    raise exception 'Reminder timing must be between 1 and 720 hours';
  end if;

  update public.global_reminder_settings
  set meeting_enabled = next_meeting_enabled,
      meeting_hours_before = next_meeting_hours_before,
      homework_enabled = next_homework_enabled,
      homework_hours_before = next_homework_hours_before,
      updated_at = clock_timestamp(),
      updated_by = actor
  where id = 'global'
  returning * into result;

  if not found then
    raise exception 'Global reminder settings are unavailable';
  end if;

  return result;
end;
$$;

revoke all on function public.update_global_reminder_settings(boolean, integer, boolean, integer) from public, anon;
grant execute on function public.update_global_reminder_settings(boolean, integer, boolean, integer) to authenticated;
