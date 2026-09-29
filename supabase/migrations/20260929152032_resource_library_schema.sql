-- Standalone managed files. No Session/Homework consumer relationships yet.
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> '' and char_length(title) <= 180),
  description text check (char_length(description) <= 4000),
  category text not null check (category in ('image', 'document', 'audio', 'video')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  current_version_id uuid,
  last_version_number integer not null default 0 check (last_version_number >= 0),
  check ((archived_at is null) = (archived_by is null))
);

create table public.resource_versions (
  id uuid primary key,
  resource_id uuid not null references public.resources(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (resource_id, version_number),
  unique (resource_id, id),
  check (storage_path like resource_id::text || '/' || id::text || '/%')
);
alter table public.resources add constraint resources_current_version_fk
  foreign key (id, current_version_id) references public.resource_versions(resource_id, id) on delete restrict;
create index resources_browse_idx on public.resources (archived_at, created_at desc);
create index resources_owner_idx on public.resources (created_by);
create index resource_versions_uploader_idx on public.resource_versions (uploaded_by);
create index resources_updated_by_idx on public.resources (updated_by);
create index resources_archived_by_idx on public.resources (archived_by);

-- Pending upload identity is separate from finalized immutable history. No tokens stored.
create table public.resource_uploads (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 hours',
  check (storage_path like resource_id::text || '/' || id::text || '/%')
);
create index resource_uploads_resource_idx on public.resource_uploads(resource_id);
create index resource_uploads_actor_idx on public.resource_uploads(uploaded_by);
create index resource_uploads_expiry_idx on public.resource_uploads(expires_at);

-- Transactional outbox: DB deletion must succeed before any Storage removal.
-- No FK back to removed metadata; failures remain retryable and observable.
create table public.resource_storage_cleanup (
  storage_path text primary key,
  resource_id uuid not null,
  not_before timestamptz not null default now(),
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text
);

create function private.resource_can_browse(is_archived boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_user_has_role(array['super_admin','admin']::public.app_role[])
    or (not is_archived and private.current_user_has_role(array['author']::public.app_role[]));
$$;
create function private.resource_can_manage(owner_id uuid, is_archived boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_user_has_role(array['super_admin','admin']::public.app_role[])
    or (not is_archived and owner_id = auth.uid() and private.current_user_has_role(array['author']::public.app_role[]));
$$;

-- Database defense-in-depth snapshot of policy.ts, checked by focused contract tests.
-- Limits live here once, never in individual RPCs. Application policy remains centralized.
create function private.resource_file_valid(category text, mime text, bytes bigint)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bytes > 0 and case category
    when 'image' then bytes <= 15728640 and mime = any(array['image/jpeg','image/png','image/webp','image/avif'])
    when 'document' then bytes <= 26214400 and mime = any(array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    when 'audio' then bytes <= 78643200 and mime = any(array['audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav','audio/x-m4a'])
    when 'video' then bytes <= 262144000 and mime = any(array['video/mp4','video/webm'])
    else false end, false);
$$;

create function private.resource_version_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Finalized Resource Versions are immutable'; end;
$$;
create trigger resource_version_immutable before update on public.resource_versions
for each row execute function private.resource_version_immutable();
create trigger resources_updated_at before update on public.resources
for each row execute function private.set_updated_at();

alter table public.resources enable row level security;
alter table public.resource_versions enable row level security;
alter table public.resource_uploads enable row level security;
alter table public.resource_storage_cleanup enable row level security;
revoke all on public.resources, public.resource_versions, public.resource_uploads, public.resource_storage_cleanup from anon, authenticated;
grant select on public.resources, public.resource_versions, public.resource_uploads to authenticated;
grant select, update, delete on public.resource_storage_cleanup to service_role;
-- Service uses narrow RPCs for domain mutations, not broad table grants.
revoke all on public.resources, public.resource_versions, public.resource_uploads from service_role;
create policy resources_read on public.resources for select to authenticated
using (current_version_id is not null and private.resource_can_browse(archived_at is not null));
create policy resource_versions_read on public.resource_versions for select to authenticated
using (exists (select 1 from public.resources where id = resource_id));
create policy resource_uploads_read on public.resource_uploads for select to authenticated
using (uploaded_by = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('resource-library','resource-library',false,262144000,
  array['image/jpeg','image/png','image/webp','image/avif','application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','audio/mpeg','audio/mp4',
  'audio/aac','audio/wav','audio/x-wav','audio/x-m4a','video/mp4','video/webm']);
create policy resource_library_private_read on storage.objects for select to authenticated
using (bucket_id = 'resource-library' and exists (
  select 1 from public.resource_versions where storage_path = name
));
-- Deliberately no authenticated INSERT/UPDATE/DELETE Storage policy.
-- Only the server issues exact-path, non-upsert signed uploads after authorized reservation.

revoke all on function private.resource_can_browse(boolean), private.resource_can_manage(uuid,boolean),
  private.resource_file_valid(text,text,bigint), private.resource_version_immutable() from public, anon;
grant execute on function private.resource_can_browse(boolean), private.resource_can_manage(uuid,boolean) to authenticated;
