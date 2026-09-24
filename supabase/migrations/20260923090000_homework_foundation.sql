create type public.homework_version_status as enum ('draft', 'published');
create type public.homework_progress_status as enum ('not_started', 'in_progress', 'submitted', 'reviewed');

create table public.homeworks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete restrict,
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homeworks_withdrawal_actor_check check ((withdrawn_at is null) = (withdrawn_by is null))
);

create table public.homework_versions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homeworks(id) on delete restrict,
  status public.homework_version_status not null default 'draft',
  version_number integer,
  based_on_version_id uuid references public.homework_versions(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homework_versions_status_number_check check (
    (status = 'draft' and version_number is null and published_at is null)
    or (status = 'published' and version_number > 0 and published_at is not null)
  ),
  constraint homework_versions_homework_number_unique unique (homework_id, version_number)
);
create unique index homework_versions_one_draft_idx on public.homework_versions (homework_id) where status = 'draft';
create index homework_versions_homework_published_idx on public.homework_versions (homework_id, version_number desc) where status = 'published';

create table public.homework_blocks (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homeworks(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.homework_version_blocks (
  id uuid primary key default gen_random_uuid(),
  homework_version_id uuid not null references public.homework_versions(id) on delete restrict,
  homework_block_id uuid not null references public.homework_blocks(id) on delete restrict,
  block_type text not null,
  position integer not null,
  title text,
  rich_text_content jsonb,
  url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homework_version_blocks_type_check check (block_type in ('rich_text', 'video_link', 'long_answer')),
  constraint homework_version_blocks_position_check check (position >= 0),
  constraint homework_version_blocks_title_check check (title is null or btrim(title) <> ''),
  constraint homework_version_blocks_description_check check (description is null or btrim(description) <> ''),
  constraint homework_version_blocks_shape_check check (
    (block_type in ('rich_text', 'long_answer') and rich_text_content is not null and url is null)
    or (block_type = 'video_link' and rich_text_content is null and url is not null and btrim(url) <> '')
  ),
  constraint homework_version_blocks_position_unique unique (homework_version_id, position),
  constraint homework_version_blocks_logical_unique unique (homework_version_id, homework_block_id)
);
create index homework_version_blocks_logical_idx on public.homework_version_blocks (homework_block_id);

create table public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homeworks(id) on delete restrict,
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  unassigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homework_assignments_unassignment_actor_check check ((unassigned_at is null) = (unassigned_by is null))
);
create unique index homework_assignments_active_unique_idx on public.homework_assignments (homework_id, counseling_case_id) where unassigned_at is null;
create index homework_assignments_case_active_idx on public.homework_assignments (counseling_case_id, assigned_at desc);

create table public.homework_assignment_revisions (
  id uuid primary key default gen_random_uuid(),
  homework_assignment_id uuid not null references public.homework_assignments(id) on delete restrict,
  homework_version_id uuid not null references public.homework_versions(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  update_reason text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint homework_assignment_revisions_dates_check check (ended_at is null or ended_at >= started_at),
  constraint homework_assignment_revisions_reason_check check (update_reason is null or btrim(update_reason) <> '')
);
create unique index homework_assignment_revisions_one_active_idx on public.homework_assignment_revisions (homework_assignment_id) where ended_at is null;

create table public.homework_participant_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_revision_id uuid not null references public.homework_assignment_revisions(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  status public.homework_progress_status not null default 'not_started',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homework_progress_submitted_check check ((status in ('submitted', 'reviewed')) = (submitted_at is not null)),
  constraint homework_progress_reviewed_check check ((status = 'reviewed') = (reviewed_at is not null)),
  constraint homework_progress_revision_profile_unique unique (assignment_revision_id, profile_id)
);
create index homework_progress_profile_idx on public.homework_participant_progress (profile_id, updated_at desc);

create table public.homework_answers (
  id uuid primary key default gen_random_uuid(),
  participant_progress_id uuid not null references public.homework_participant_progress(id) on delete restrict,
  homework_version_block_id uuid not null references public.homework_version_blocks(id) on delete restrict,
  answer_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homework_answers_progress_block_unique unique (participant_progress_id, homework_version_block_id)
);

create function private.homework_json_has_meaningful_text(value jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare child jsonb;
begin
  if value is null then return false; end if;
  if jsonb_typeof(value) = 'string' then return btrim(value #>> '{}') <> ''; end if;
  if jsonb_typeof(value) = 'array' then for child in select value from jsonb_array_elements(value) loop if private.homework_json_has_meaningful_text(child) then return true; end if; end loop; end if;
  if jsonb_typeof(value) = 'object' then for child in select value from jsonb_each(value) loop if private.homework_json_has_meaningful_text(child) then return true; end if; end loop; end if;
  return false;
end;
$$;

create function private.validate_homework_version_block() returns trigger language plpgsql security invoker set search_path = '' as $$
declare version_homework uuid; block_homework uuid;
begin
  select homework_id into version_homework from public.homework_versions where id = new.homework_version_id;
  select homework_id into block_homework from public.homework_blocks where id = new.homework_block_id;
  if version_homework is null or version_homework <> block_homework then raise exception 'Homework block belongs to another Homework'; end if;
  if new.block_type in ('rich_text', 'long_answer') and not private.homework_json_has_meaningful_text(new.rich_text_content) then raise exception 'Rich text content must be meaningful'; end if;
  if new.block_type = 'video_link' and new.url !~* '^https?://[^[:space:]]+$' then raise exception 'Video link must use http or https'; end if;
  return new;
end;
$$;
create trigger validate_homework_version_blocks before insert or update on public.homework_version_blocks for each row execute function private.validate_homework_version_block();

create function private.prevent_assigned_homework_mutation() returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_version uuid;
begin
  if tg_table_name = 'homework_versions' then
    target_version := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_version := case when tg_op = 'DELETE' then old.homework_version_id else new.homework_version_id end;
  end if;
  if exists (select 1 from public.homework_assignment_revisions where homework_version_id = target_version) then raise exception 'Assigned published Homework versions are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger prevent_assigned_homework_version_mutation before update or delete on public.homework_versions for each row execute function private.prevent_assigned_homework_mutation();
create trigger prevent_assigned_homework_block_mutation before insert or update or delete on public.homework_version_blocks for each row execute function private.prevent_assigned_homework_mutation();

create function private.validate_homework_answer() returns trigger language plpgsql security invoker set search_path = '' as $$
declare progress_row public.homework_participant_progress; version_id uuid; block_type_value text;
begin
  select * into progress_row from public.homework_participant_progress where id = new.participant_progress_id;
  select homework_version_id into version_id from public.homework_assignment_revisions where id = progress_row.assignment_revision_id;
  select block_type into block_type_value from public.homework_version_blocks where id = new.homework_version_block_id and homework_version_id = version_id;
  if block_type_value <> 'long_answer' then raise exception 'Answers may only target Long Answer blocks in the assigned version'; end if;
  if progress_row.status in ('submitted', 'reviewed') then raise exception 'Submitted answers are read-only'; end if;
  return new;
end;
$$;
create trigger validate_homework_answers before insert or update on public.homework_answers for each row execute function private.validate_homework_answer();

create function private.create_homework_progress(revision_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare case_id uuid;
begin
  select a.counseling_case_id into case_id from public.homework_assignment_revisions r join public.homework_assignments a on a.id = r.homework_assignment_id where r.id = revision_id;
  insert into public.homework_participant_progress (assignment_revision_id, profile_id)
  select revision_id, gm.profile_id from public.counseling_cases c join public.groups g on g.id = c.couple_group_id and g.group_type = 'couple' join public.group_members gm on gm.group_id = g.id and gm.ended_at is null where c.id = case_id
  on conflict (assignment_revision_id, profile_id) do nothing;
  if (select count(*) from public.homework_participant_progress where assignment_revision_id = revision_id) <> 2 then raise exception 'A Homework assignment requires exactly two active Couple members'; end if;
end;
$$;

create function public.get_or_create_homework_draft(target_homework_id uuid, source_version_id uuid default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); draft_id uuid; source public.homework_versions;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then raise exception 'Not authorized'; end if;
  perform 1 from public.homeworks where id = target_homework_id and withdrawn_at is null for update; if not found then raise exception 'Homework is unavailable'; end if;
  select id into draft_id from public.homework_versions where homework_id = target_homework_id and status = 'draft'; if found then return draft_id; end if;
  if source_version_id is not null then
    select * into source from public.homework_versions where id = source_version_id and homework_id = target_homework_id and status = 'published' for update; if not found then raise exception 'Source version is unavailable'; end if;
  end if;
  insert into public.homework_versions(homework_id, status, based_on_version_id, created_by) values (target_homework_id, 'draft', source_version_id, actor) returning id into draft_id;
  if source_version_id is not null then insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, rich_text_content, url, description) select draft_id, homework_block_id, block_type, position, title, rich_text_content, url, description from public.homework_version_blocks where homework_version_id = source_version_id order by position; end if;
  return draft_id;
end;
$$;

create function public.publish_homework_version(target_version_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare version_row public.homework_versions; next_number integer;
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select v.* into version_row from public.homework_versions v join public.homeworks h on h.id = v.homework_id where v.id = target_version_id and h.withdrawn_at is null for update; if not found or version_row.status <> 'draft' then raise exception 'Only an active Draft may be published'; end if;
  perform 1 from public.homeworks where id = version_row.homework_id for update;
  if not exists (select 1 from public.homework_version_blocks where homework_version_id = target_version_id) then raise exception 'Homework must contain at least one block'; end if;
  select coalesce(max(version_number), 0) + 1 into next_number from public.homework_versions where homework_id = version_row.homework_id and status = 'published';
  update public.homework_versions set status = 'published', version_number = next_number, published_at = now() where id = target_version_id;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,details) values (auth.uid(),'homework.published','homework',version_row.homework_id,jsonb_build_object('version_id',target_version_id,'version_number',next_number));
end;
$$;

create function public.assign_homework(target_homework_id uuid, target_case_id uuid, target_version_id uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); assignment_id uuid; revision_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  perform 1 from public.homework_versions v join public.homeworks h on h.id=v.homework_id where v.id=target_version_id and v.homework_id=target_homework_id and v.status='published' and h.withdrawn_at is null; if not found then raise exception 'A published active Homework version is required'; end if;
  insert into public.homework_assignments(homework_id,counseling_case_id,assigned_by) values(target_homework_id,target_case_id,actor) on conflict (homework_id,counseling_case_id) where unassigned_at is null do update set updated_at=now() returning id into assignment_id;
  select id into revision_id from public.homework_assignment_revisions where homework_assignment_id=assignment_id and ended_at is null;
  if not found then insert into public.homework_assignment_revisions(homework_assignment_id,homework_version_id,updated_by) values(assignment_id,target_version_id,actor) returning id into revision_id; perform private.create_homework_progress(revision_id); end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,details) values(actor,'homework.assignment_created','homework_assignment',assignment_id,jsonb_build_object('version_id',target_version_id,'counseling_case_id',target_case_id)); return assignment_id;
end;
$$;

create function public.save_homework_answer(target_progress_id uuid, target_block_id uuid, target_answer text) returns void language plpgsql security definer set search_path = '' as $$
declare progress_row public.homework_participant_progress;
begin
  select * into progress_row from public.homework_participant_progress where id=target_progress_id for update; if not found or progress_row.profile_id <> auth.uid() then raise exception 'Not authorized'; end if;
  insert into public.homework_answers(participant_progress_id,homework_version_block_id,answer_text) values(target_progress_id,target_block_id,coalesce(target_answer,'')) on conflict (participant_progress_id,homework_version_block_id) do update set answer_text=excluded.answer_text;
  if progress_row.status='not_started' and btrim(coalesce(target_answer,'')) <> '' then update public.homework_participant_progress set status='in_progress' where id=target_progress_id; end if;
end;
$$;

create function public.submit_homework(target_progress_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare progress_row public.homework_participant_progress; version_id uuid;
begin
  select * into progress_row from public.homework_participant_progress where id=target_progress_id for update; if not found or progress_row.profile_id <> auth.uid() then raise exception 'Not authorized'; end if;
  select homework_version_id into version_id from public.homework_assignment_revisions where id=progress_row.assignment_revision_id;
  if exists (select 1 from public.homework_version_blocks b where b.homework_version_id=version_id and b.block_type='long_answer' and not exists (select 1 from public.homework_answers a where a.participant_progress_id=target_progress_id and a.homework_version_block_id=b.id and btrim(a.answer_text) <> '')) then raise exception 'Every Long Answer requires a meaningful answer'; end if;
  update public.homework_participant_progress set status='submitted', submitted_at=now(), reviewed_at=null where id=target_progress_id and status not in ('submitted','reviewed');
end;
$$;

create function public.unassign_homework(target_assignment_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  update public.homework_assignment_revisions set ended_at=now(), updated_by=auth.uid() where homework_assignment_id=target_assignment_id and ended_at is null;
  update public.homework_assignments set unassigned_at=now(), unassigned_by=auth.uid() where id=target_assignment_id and unassigned_at is null; if not found then raise exception 'Active assignment not found'; end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id) values(auth.uid(),'homework.assignment_unassigned','homework_assignment',target_assignment_id);
end;
$$;

create function public.withdraw_homework(target_homework_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  update public.homeworks set withdrawn_at=now(), withdrawn_by=auth.uid() where id=target_homework_id and withdrawn_at is null; if not found then raise exception 'Homework is unavailable'; end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id) values(auth.uid(),'homework.withdrawn','homework',target_homework_id);
end;
$$;

create function public.force_update_homework_assignment(target_assignment_id uuid, target_version_id uuid, reason text default null) returns void language plpgsql security definer set search_path = '' as $$
declare old_revision public.homework_assignment_revisions; assignment_row public.homework_assignments; new_revision uuid; old_progress record; changed_required boolean;
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select a.* into assignment_row from public.homework_assignments a where a.id=target_assignment_id and a.unassigned_at is null for update; if not found then raise exception 'Active assignment not found'; end if;
  select * into old_revision from public.homework_assignment_revisions where homework_assignment_id=target_assignment_id and ended_at is null for update; if not found then raise exception 'Active revision not found'; end if;
  if not exists(select 1 from public.homework_versions where id=target_version_id and homework_id=assignment_row.homework_id and status='published') then raise exception 'Target must be a published version of the same Homework'; end if;
  update public.homework_assignment_revisions set ended_at=now(), update_reason=coalesce(reason,'force_version_update'), updated_by=auth.uid() where id=old_revision.id;
  insert into public.homework_assignment_revisions(homework_assignment_id,homework_version_id,update_reason,updated_by) values(target_assignment_id,target_version_id,coalesce(reason,'force_version_update'),auth.uid()) returning id into new_revision;
  perform private.create_homework_progress(new_revision);
  for old_progress in select * from public.homework_participant_progress where assignment_revision_id=old_revision.id loop
    insert into public.homework_answers(participant_progress_id,homework_version_block_id,answer_text)
    select np.id, nb.id, oa.answer_text from public.homework_answers oa join public.homework_version_blocks ob on ob.id=oa.homework_version_block_id join public.homework_version_blocks nb on nb.homework_version_id=target_version_id and nb.homework_block_id=ob.homework_block_id and nb.block_type='long_answer' and nb.rich_text_content=ob.rich_text_content and nb.title is not distinct from ob.title join public.homework_participant_progress np on np.assignment_revision_id=new_revision and np.profile_id=old_progress.profile_id where oa.participant_progress_id=old_progress.id;
    select exists(select 1 from public.homework_version_blocks nb where nb.homework_version_id=target_version_id and nb.block_type='long_answer' and not exists(select 1 from public.homework_version_blocks ob join public.homework_answers oa on oa.homework_version_block_id=ob.id and oa.participant_progress_id=old_progress.id where ob.homework_version_id=old_revision.homework_version_id and ob.homework_block_id=nb.homework_block_id and ob.block_type='long_answer' and ob.rich_text_content=nb.rich_text_content and ob.title is not distinct from nb.title and btrim(oa.answer_text) <> '')) into changed_required;
    update public.homework_participant_progress set status=case when old_progress.status='submitted' and not changed_required then 'submitted' else case when old_progress.status in ('submitted','reviewed') then 'in_progress' else old_progress.status end end, submitted_at=case when old_progress.status='submitted' and not changed_required then old_progress.submitted_at else null end where assignment_revision_id=new_revision and profile_id=old_progress.profile_id;
  end loop;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,details) values(auth.uid(),'homework.assignment_force_updated','homework_assignment',target_assignment_id,jsonb_build_object('from_version_id',old_revision.homework_version_id,'to_version_id',target_version_id));
end;
$$;

create trigger set_homeworks_updated_at before update on public.homeworks for each row execute function private.set_updated_at();
create trigger set_homework_versions_updated_at before update on public.homework_versions for each row execute function private.set_updated_at();
create trigger set_homework_version_blocks_updated_at before update on public.homework_version_blocks for each row execute function private.set_updated_at();
create trigger set_homework_assignments_updated_at before update on public.homework_assignments for each row execute function private.set_updated_at();
create trigger set_homework_progress_updated_at before update on public.homework_participant_progress for each row execute function private.set_updated_at();
create trigger set_homework_answers_updated_at before update on public.homework_answers for each row execute function private.set_updated_at();

alter table public.homeworks enable row level security;
alter table public.homework_versions enable row level security;
alter table public.homework_blocks enable row level security;
alter table public.homework_version_blocks enable row level security;
alter table public.homework_assignments enable row level security;
alter table public.homework_assignment_revisions enable row level security;
alter table public.homework_participant_progress enable row level security;
alter table public.homework_answers enable row level security;
revoke all on public.homeworks, public.homework_versions, public.homework_blocks, public.homework_version_blocks, public.homework_assignments, public.homework_assignment_revisions, public.homework_participant_progress, public.homework_answers from anon, authenticated;
grant select, insert, update on public.homeworks, public.homework_versions, public.homework_blocks, public.homework_version_blocks to authenticated;
grant select on public.homework_assignments, public.homework_assignment_revisions, public.homework_participant_progress, public.homework_answers to authenticated;
grant all on public.homeworks, public.homework_versions, public.homework_blocks, public.homework_version_blocks, public.homework_assignments, public.homework_assignment_revisions, public.homework_participant_progress, public.homework_answers to service_role;
create policy homeworks_authoring on public.homeworks for all to authenticated using ((select private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]))) with check ((select private.current_user_has_role(array['super_admin','admin','author']::public.app_role[])));
create policy homework_versions_authoring on public.homework_versions for all to authenticated using ((select private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]))) with check ((select private.current_user_has_role(array['super_admin','admin','author']::public.app_role[])));
create policy homework_blocks_authoring on public.homework_blocks for all to authenticated using ((select private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]))) with check ((select private.current_user_has_role(array['super_admin','admin','author']::public.app_role[])));
create policy homework_version_blocks_authoring on public.homework_version_blocks for all to authenticated using ((select private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]))) with check ((select private.current_user_has_role(array['super_admin','admin','author']::public.app_role[])));
create policy homework_assignment_admin_read on public.homework_assignments for select to authenticated using ((select private.current_user_has_role(array['super_admin','admin']::public.app_role[])) or exists (select 1 from public.homework_assignment_revisions r join public.homework_participant_progress p on p.assignment_revision_id=r.id where r.homework_assignment_id=homework_assignments.id and p.profile_id=auth.uid()));
create policy homework_revision_admin_read on public.homework_assignment_revisions for select to authenticated using ((select private.current_user_has_role(array['super_admin','admin']::public.app_role[])) or exists (select 1 from public.homework_participant_progress p where p.assignment_revision_id=homework_assignment_revisions.id and p.profile_id=auth.uid()));
create policy homework_progress_own_read on public.homework_participant_progress for select to authenticated using (profile_id=auth.uid() or (select private.current_user_has_role(array['super_admin','admin']::public.app_role[])));
create policy homework_answers_own_read on public.homework_answers for select to authenticated using (exists(select 1 from public.homework_participant_progress p where p.id=participant_progress_id and p.profile_id=auth.uid()) or (select private.current_user_has_role(array['super_admin']::public.app_role[])));
grant execute on function public.get_or_create_homework_draft(uuid,uuid), public.publish_homework_version(uuid), public.assign_homework(uuid,uuid,uuid), public.save_homework_answer(uuid,uuid,text), public.submit_homework(uuid), public.unassign_homework(uuid), public.withdraw_homework(uuid), public.force_update_homework_assignment(uuid,uuid,text) to authenticated;
