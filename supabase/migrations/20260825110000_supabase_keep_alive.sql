create table if not exists public.system_heartbeat (
  name text primary key,
  last_seen_at timestamptz not null default now()
);

alter table public.system_heartbeat enable row level security;

revoke all on public.system_heartbeat from anon, authenticated;
grant select, insert, update on public.system_heartbeat to service_role;
