create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.app_role as enum (
  'super_admin',
  'admin',
  'coach',
  'counselor',
  'couple',
  'author'
);

create type public.profile_status as enum ('invited', 'active', 'deactivated');
create type public.group_type as enum ('couple', 'coach_team', 'counselor_team');
create type public.case_status as enum (
  'requested',
  'assessment',
  'interviewed',
  'matched',
  'active',
  'pending_final',
  'finished',
  'referred',
  'inactive'
);
create type public.case_assignment_type as enum ('coach', 'counselor');

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campuses_name_not_blank check (btrim(name) <> ''),
  constraint campuses_code_not_blank check (btrim(code) <> ''),
  constraint campuses_code_unique unique (code)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text,
  status public.profile_status not null default 'invited',
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_normalized check (email is null or email = lower(btrim(email))),
  constraint profiles_deactivation_matches_status check (
    (status = 'deactivated') = (deactivated_at is not null)
  )
);

create table public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete set null,
  group_type public.group_type not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_not_blank check (btrim(name) <> '')
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint group_members_dates_ordered check (ended_at is null or ended_at >= joined_at)
);

create unique index group_members_one_active_membership_idx
  on public.group_members (group_id, profile_id)
  where ended_at is null;
create index group_members_active_profile_idx
  on public.group_members (profile_id, group_id)
  where ended_at is null;

create table public.counseling_cases (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete set null,
  couple_group_id uuid not null unique references public.groups(id) on delete restrict,
  status public.case_status not null default 'requested',
  requested_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint counseling_cases_closed_status_check check (
    (status in ('finished', 'referred', 'inactive')) = (closed_at is not null)
  )
);

create index counseling_cases_status_requested_idx
  on public.counseling_cases (status, requested_at desc);
create index counseling_cases_campus_status_idx
  on public.counseling_cases (campus_id, status);

create table public.case_assignments (
  id uuid primary key default gen_random_uuid(),
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  assigned_group_id uuid not null references public.groups(id) on delete restrict,
  assignment_type public.case_assignment_type not null,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  constraint case_assignments_dates_ordered check (ended_at is null or ended_at >= started_at),
  constraint case_assignments_end_reason_check check (
    (ended_at is null and end_reason is null)
    or (ended_at is not null and btrim(coalesce(end_reason, '')) <> '')
  )
);

create unique index case_assignments_one_active_type_idx
  on public.case_assignments (counseling_case_id, assignment_type)
  where ended_at is null;
create index case_assignments_active_group_idx
  on public.case_assignments (assigned_group_id, counseling_case_id)
  where ended_at is null;
create index case_assignments_case_history_idx
  on public.case_assignments (counseling_case_id, started_at desc);

create table public.case_status_history (
  id bigint generated always as identity primary key,
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  from_status public.case_status,
  to_status public.case_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  reason text
);

create index case_status_history_case_changed_idx
  on public.case_status_history (counseling_case_id, changed_at desc);

create table public.supervision_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_group_id uuid not null references public.groups(id) on delete restrict,
  counselor_group_id uuid not null references public.groups(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint supervision_assignments_different_groups check (coach_group_id <> counselor_group_id),
  constraint supervision_assignments_dates_ordered check (ended_at is null or ended_at >= started_at)
);

create unique index supervision_assignments_one_active_pair_idx
  on public.supervision_assignments (coach_group_id, counselor_group_id)
  where ended_at is null;
create index supervision_assignments_active_counselor_idx
  on public.supervision_assignments (counselor_group_id, coach_group_id)
  where ended_at is null;

create table public.assessment_documents (
  id uuid primary key default gen_random_uuid(),
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  object_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint assessment_documents_path_not_blank check (btrim(object_path) <> ''),
  constraint assessment_documents_file_name_not_blank check (btrim(file_name) <> ''),
  constraint assessment_documents_content_type_not_blank check (btrim(content_type) <> ''),
  constraint assessment_documents_size_positive check (size_bytes > 0)
);

create index assessment_documents_case_created_idx
  on public.assessment_documents (counseling_case_id, created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_events_event_type_not_blank check (btrim(event_type) <> ''),
  constraint audit_events_entity_type_not_blank check (btrim(entity_type) <> '')
);

create index audit_events_entity_occurred_idx
  on public.audit_events (entity_type, entity_id, occurred_at desc);
create index audit_events_actor_occurred_idx
  on public.audit_events (actor_id, occurred_at desc);

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_campuses_updated_at before update on public.campuses
for each row execute function private.set_updated_at();
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger set_groups_updated_at before update on public.groups
for each row execute function private.set_updated_at();
create trigger set_counseling_cases_updated_at before update on public.counseling_cases
for each row execute function private.set_updated_at();

revoke execute on function private.set_updated_at() from public, anon, authenticated;
