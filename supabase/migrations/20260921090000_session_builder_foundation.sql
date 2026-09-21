create type public.session_status as enum ('draft', 'published', 'archived');

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  sequence_number bigint generated always as identity (sequence name public.sessions_sequence_number_seq),
  title text not null,
  status public.session_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_title_not_blank check (btrim(title) <> ''),
  constraint sessions_sequence_number_unique unique (sequence_number)
);

create table public.session_material_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  block_type text not null,
  position integer not null,
  title text,
  rich_text_content jsonb,
  url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_material_blocks_type_supported check (block_type in ('rich_text', 'video_link')),
  constraint session_material_blocks_position_nonnegative check (position >= 0),
  constraint session_material_blocks_title_not_blank check (title is null or btrim(title) <> ''),
  constraint session_material_blocks_description_not_blank check (description is null or btrim(description) <> ''),
  constraint session_material_blocks_content_matches_type check (
    (block_type = 'rich_text' and rich_text_content is not null and url is null)
    or (block_type = 'video_link' and rich_text_content is null and url is not null and btrim(url) <> '')
  ),
  constraint session_material_blocks_session_position_unique unique (session_id, position)
);

create function private.set_session_published_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger set_sessions_updated_at before update on public.sessions
for each row execute function private.set_updated_at();

create trigger set_sessions_published_at before insert or update on public.sessions
for each row execute function private.set_session_published_at();

create trigger set_session_material_blocks_updated_at before update on public.session_material_blocks
for each row execute function private.set_updated_at();

revoke execute on function private.set_session_published_at() from public, anon, authenticated;

alter table public.sessions enable row level security;
alter table public.session_material_blocks enable row level security;

revoke all on public.sessions from anon, authenticated;
revoke all on public.session_material_blocks from anon, authenticated;
grant select, insert, update on public.sessions to authenticated;
grant select, insert, update on public.session_material_blocks to authenticated;
grant usage, select on sequence public.sessions_sequence_number_seq to authenticated;
grant all on public.sessions, public.session_material_blocks to service_role;
grant all on sequence public.sessions_sequence_number_seq to service_role;

create policy sessions_authoring_access on public.sessions for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[])));

create policy session_material_blocks_authoring_access on public.session_material_blocks for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin', 'author']::public.app_role[])));
