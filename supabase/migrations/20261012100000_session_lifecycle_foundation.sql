create type public.case_session_status as enum ('active', 'completed');

create table public.case_sessions (
  id uuid primary key default gen_random_uuid(),
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  session_id uuid not null references public.sessions(id) on delete restrict,
  actual_sequence integer not null check (actual_sequence > 0),
  template_sequence_number bigint not null check (template_sequence_number > 0),
  title text not null check (btrim(title) <> ''),
  status public.case_session_status not null default 'active',
  homework_assignment_revision_id uuid not null references public.homework_assignment_revisions(id) on delete restrict,
  material_released_at timestamptz not null,
  homework_released_at timestamptz not null,
  activated_at timestamptz not null,
  activated_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_sessions_actual_sequence_unique unique (counseling_case_id, actual_sequence),
  constraint case_sessions_release_together check (material_released_at = homework_released_at),
  constraint case_sessions_completion_shape check (
    (status = 'active' and completed_at is null and completed_by is null)
    or (status = 'completed' and completed_at is not null and completed_by is not null)
  )
);
create unique index case_sessions_one_active_idx on public.case_sessions(counseling_case_id) where status = 'active';
create index case_sessions_case_sequence_idx on public.case_sessions(counseling_case_id, actual_sequence);
create index case_sessions_template_idx on public.case_sessions(session_id);
create trigger set_case_sessions_updated_at before update on public.case_sessions
for each row execute function private.set_updated_at();

create table public.case_session_material_blocks (
  id uuid primary key default gen_random_uuid(),
  case_session_id uuid not null references public.case_sessions(id) on delete restrict,
  source_block_id uuid,
  block_type text not null check (block_type in ('rich_text', 'video_link', 'library_resource')),
  position integer not null check (position >= 0),
  title text,
  rich_text_content jsonb,
  url text,
  description text,
  resource_id uuid references public.resources(id) on delete restrict,
  resource_version_id uuid,
  resource_category text,
  created_at timestamptz not null default now(),
  constraint case_session_material_position_unique unique(case_session_id, position),
  constraint case_session_material_source_unique unique(case_session_id, source_block_id),
  constraint case_session_material_resource_version_fk foreign key(resource_id, resource_version_id)
    references public.resource_versions(resource_id, id) on delete restrict,
  constraint case_session_material_shape check (
    (block_type = 'rich_text' and rich_text_content is not null and url is null and resource_id is null and resource_version_id is null and resource_category is null)
    or (block_type = 'video_link' and rich_text_content is null and url is not null and btrim(url) <> '' and resource_id is null and resource_version_id is null and resource_category is null)
    or (block_type = 'library_resource' and rich_text_content is null and url is null and resource_id is not null and resource_version_id is not null and resource_category in ('image', 'document', 'audio', 'video'))
  )
);
create index case_session_material_case_idx on public.case_session_material_blocks(case_session_id, position);
create index case_session_material_resource_idx on public.case_session_material_blocks(resource_id) where resource_id is not null;

alter table public.case_session_meetings
  add column case_session_id uuid references public.case_sessions(id) on delete restrict,
  add column completed_at timestamptz,
  add column completed_by uuid references public.profiles(id) on delete restrict,
  add constraint case_session_meetings_completion_shape check ((completed_at is null) = (completed_by is null));

-- Preserve any authored meetings created before the Couple Session model existed.
with authored as (
  select distinct on (m.counseling_case_id, m.session_id)
    m.counseling_case_id,
    m.session_id,
    m.scheduled_by,
    m.created_at,
    s.sequence_number,
    s.title,
    row_number() over (partition by m.counseling_case_id order by m.starts_at, m.created_at, m.id)::integer as actual_sequence,
    row_number() over (partition by m.counseling_case_id order by m.starts_at desc, m.created_at desc, m.id desc) as reverse_sequence,
    r.id as revision_id
  from public.case_session_meetings m
  join public.sessions s on s.id = m.session_id
  join public.homeworks h on h.session_id = m.session_id and h.withdrawn_at is null
  join public.homework_assignments a on a.homework_id = h.id and a.counseling_case_id = m.counseling_case_id and a.unassigned_at is null
  join public.homework_assignment_revisions r on r.homework_assignment_id = a.id and r.ended_at is null
  where m.session_id is not null
  order by m.counseling_case_id, m.session_id, m.starts_at desc
)
insert into public.case_sessions(
  counseling_case_id, session_id, actual_sequence, template_sequence_number, title, status,
  homework_assignment_revision_id, material_released_at, homework_released_at, activated_at,
  activated_by, completed_at, completed_by, created_at
)
select counseling_case_id, session_id, actual_sequence, sequence_number, title,
  case when reverse_sequence = 1 then 'active'::public.case_session_status else 'completed'::public.case_session_status end,
  revision_id, created_at, created_at, created_at, scheduled_by,
  case when reverse_sequence = 1 then null else created_at end,
  case when reverse_sequence = 1 then null else scheduled_by end,
  created_at
from authored;

insert into public.case_session_material_blocks(
  case_session_id, source_block_id, block_type, position, title, rich_text_content, url,
  description, resource_id, resource_version_id, resource_category
)
select cs.id, b.id, b.block_type, b.position, b.title, b.rich_text_content, b.url,
  b.description, b.resource_id, r.current_version_id, b.resource_category
from public.case_sessions cs
join public.session_material_blocks b on b.session_id = cs.session_id
left join public.resources r on r.id = b.resource_id;

update public.case_session_meetings m
set case_session_id = cs.id
from public.case_sessions cs
where m.counseling_case_id = cs.counseling_case_id and m.session_id = cs.session_id;

update public.case_session_meetings initial
set completed_at = authored.first_authored_at,
    completed_by = authored.actor
from (
  select counseling_case_id, min(activated_at) as first_authored_at,
    (array_agg(activated_by order by activated_at))[1] as actor
  from public.case_sessions group by counseling_case_id
) authored
where initial.counseling_case_id = authored.counseling_case_id
  and initial.session_id is null
  and initial.completed_at is null;

drop index public.case_session_meetings_session_unique_idx;
create index case_session_meetings_case_session_starts_idx on public.case_session_meetings(case_session_id, starts_at desc)
  where case_session_id is not null;
alter table public.case_session_meetings add constraint case_session_meetings_lifecycle_shape check (
  (session_id is null and case_session_id is null)
  or (session_id is not null and case_session_id is not null)
);

alter table public.case_sessions enable row level security;
alter table public.case_session_material_blocks enable row level security;
revoke all on public.case_sessions, public.case_session_material_blocks from anon, authenticated;
grant select on public.case_sessions, public.case_session_material_blocks to authenticated;
grant all on public.case_sessions, public.case_session_material_blocks to service_role;
create policy case_sessions_read_authorized on public.case_sessions for select to authenticated
using ((select private.current_user_can_access_case(counseling_case_id)));
create policy case_session_material_read_authorized on public.case_session_material_blocks for select to authenticated
using (exists (
  select 1 from public.case_sessions cs
  where cs.id = case_session_id and private.current_user_can_access_case(cs.counseling_case_id)
));
create policy resources_released_case_session_read on public.resources for select to authenticated
using (exists (
  select 1 from public.case_session_material_blocks b
  join public.case_sessions cs on cs.id = b.case_session_id
  where b.resource_id = resources.id and private.current_user_can_access_case(cs.counseling_case_id)
));
create policy resource_versions_released_case_session_read on public.resource_versions for select to authenticated
using (exists (
  select 1 from public.case_session_material_blocks b
  join public.case_sessions cs on cs.id = b.case_session_id
  where b.resource_version_id = resource_versions.id and private.current_user_can_access_case(cs.counseling_case_id)
));

create or replace function public.schedule_initial_case_meeting(
  target_case_id uuid, target_starts_at timestamptz, target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); meeting_id uuid;
begin
  if not private.current_user_can_manage_counseling_case(target_case_id) then raise exception 'Not authorized'; end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;
  perform 1 from public.counseling_cases where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;
  if exists (select 1 from public.case_sessions where counseling_case_id = target_case_id) then
    raise exception 'The initial meeting is already complete';
  end if;
  select id into meeting_id from public.case_session_meetings
  where counseling_case_id = target_case_id and session_id is null for update;
  if meeting_id is null then
    insert into public.case_session_meetings(counseling_case_id, starts_at, ends_at, location, scheduled_by)
    values(target_case_id, target_starts_at, target_ends_at, 'In person', actor)
    returning id into meeting_id;
  else
    update public.case_session_meetings
    set starts_at = target_starts_at, ends_at = target_ends_at, scheduled_by = actor
    where id = meeting_id;
  end if;
  return meeting_id;
end;
$$;

create or replace function public.activate_first_case_session(
  target_case_id uuid, target_session_id uuid, target_starts_at timestamptz, target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  prior_status public.case_status;
  initial_meeting public.case_session_meetings%rowtype;
  session_row public.sessions%rowtype;
  homework_id uuid;
  version_id uuid;
  assignment_id uuid;
  revision_id uuid;
  existing_version_id uuid;
  case_session_id uuid;
  meeting_id uuid;
begin
  if not private.current_user_can_manage_counseling_case(target_case_id) then raise exception 'Not authorized'; end if;
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;

  select status into prior_status from public.counseling_cases
  where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;
  if exists (select 1 from public.case_sessions where counseling_case_id = target_case_id) then
    raise exception 'The first Session is already active';
  end if;
  select * into initial_meeting from public.case_session_meetings
  where counseling_case_id = target_case_id and session_id is null for update;
  if not found then raise exception 'Schedule the Initial Meeting first'; end if;
  if initial_meeting.completed_at is not null then raise exception 'The Initial Meeting is already complete'; end if;

  select * into session_row from public.sessions
  where id = target_session_id and status = 'published' for share;
  if not found then raise exception 'Select a published Session'; end if;
  if not exists (select 1 from public.session_material_blocks where session_id = target_session_id) then
    raise exception 'This Session needs published Material before it can be scheduled';
  end if;
  if exists (
    select 1 from public.session_material_blocks b
    left join public.resources r on r.id = b.resource_id
    where b.session_id = target_session_id and b.block_type = 'library_resource' and r.current_version_id is null
  ) then raise exception 'A Session Resource is unavailable'; end if;

  select h.id, v.id into homework_id, version_id
  from public.homeworks h
  join public.homework_versions v on v.homework_id = h.id and v.status = 'published'
  where h.session_id = target_session_id and h.withdrawn_at is null
  order by v.version_number desc limit 1;
  if homework_id is null then raise exception 'This Session needs published Homework before it can be scheduled'; end if;

  insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
  values(homework_id, target_case_id, actor)
  on conflict (homework_id, counseling_case_id) where unassigned_at is null
  do update set updated_at = now()
  returning id into assignment_id;
  select id, homework_version_id into revision_id, existing_version_id
  from public.homework_assignment_revisions
  where homework_assignment_id = assignment_id and ended_at is null for update;
  if revision_id is not null and existing_version_id <> version_id then
    update public.homework_assignment_revisions
    set ended_at = transition_at, update_reason = 'Pinned when Couple Session activated', updated_by = actor
    where id = revision_id;
    revision_id := null;
  end if;
  if revision_id is null then
    insert into public.homework_assignment_revisions(homework_assignment_id, homework_version_id, started_at, updated_by)
    values(assignment_id, version_id, transition_at, actor) returning id into revision_id;
    perform private.create_homework_progress(revision_id);
  end if;

  insert into public.case_sessions(
    counseling_case_id, session_id, actual_sequence, template_sequence_number, title,
    homework_assignment_revision_id, material_released_at, homework_released_at,
    activated_at, activated_by
  ) values (
    target_case_id, target_session_id, 1, session_row.sequence_number, session_row.title,
    revision_id, transition_at, transition_at, transition_at, actor
  ) returning id into case_session_id;

  insert into public.case_session_material_blocks(
    case_session_id, source_block_id, block_type, position, title, rich_text_content, url,
    description, resource_id, resource_version_id, resource_category
  )
  select case_session_id, b.id, b.block_type, b.position, b.title, b.rich_text_content, b.url,
    b.description, b.resource_id, r.current_version_id, b.resource_category
  from public.session_material_blocks b
  left join public.resources r on r.id = b.resource_id
  where b.session_id = target_session_id;

  update public.case_session_meetings
  set completed_at = transition_at, completed_by = actor
  where id = initial_meeting.id;
  insert into public.case_session_meetings(
    counseling_case_id, session_id, case_session_id, starts_at, ends_at, location, scheduled_by
  ) values (
    target_case_id, target_session_id, case_session_id, target_starts_at, target_ends_at, 'In person', actor
  ) returning id into meeting_id;

  update public.counseling_cases
  set status = case when status in ('requested', 'assessment', 'interviewed', 'matched') then 'active' else status end
  where id = target_case_id;
  if prior_status in ('requested', 'assessment', 'interviewed', 'matched') then
    insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason)
    values(target_case_id, prior_status, 'active', actor, 'First Couple Session activated');
  end if;
  return case_session_id;
end;
$$;

create or replace function public.reschedule_case_session_meeting(
  target_meeting_id uuid, target_starts_at timestamptz, target_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_case_id uuid;
begin
  if target_ends_at <= target_starts_at then raise exception 'Enter a valid meeting time'; end if;
  select counseling_case_id into target_case_id from public.case_session_meetings
  where id = target_meeting_id and case_session_id is not null for update;
  if not found or not private.current_user_can_manage_counseling_case(target_case_id) then raise exception 'Not authorized'; end if;
  update public.case_session_meetings
  set starts_at = target_starts_at, ends_at = target_ends_at, scheduled_by = actor
  where id = target_meeting_id;
  return target_meeting_id;
end;
$$;

-- The prior progression RPC collapses template Sessions and Meetings, so authored use is retired.
revoke execute on function public.schedule_case_session_meeting(uuid, uuid, timestamptz, timestamptz, text) from authenticated;
grant execute on function public.schedule_initial_case_meeting(uuid, timestamptz, timestamptz),
  public.activate_first_case_session(uuid, uuid, timestamptz, timestamptz),
  public.reschedule_case_session_meeting(uuid, timestamptz, timestamptz) to authenticated;
