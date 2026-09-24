create table public.homework_audit_events (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homeworks(id) on delete restrict,
  homework_assignment_id uuid references public.homework_assignments(id) on delete restrict,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  from_version_id uuid references public.homework_versions(id) on delete restrict,
  to_version_id uuid references public.homework_versions(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint homework_audit_events_event_type_not_blank check (btrim(event_type) <> '')
);
create index homework_audit_events_homework_created_idx on public.homework_audit_events (homework_id, created_at desc);
create index homework_audit_events_assignment_created_idx on public.homework_audit_events (homework_assignment_id, created_at desc) where homework_assignment_id is not null;

alter table public.homework_audit_events enable row level security;
revoke all on public.homework_audit_events from anon, authenticated;
grant select on public.homework_audit_events to authenticated;
grant all on public.homework_audit_events to service_role;
create policy homework_audit_events_admin_read on public.homework_audit_events for select to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create or replace function public.publish_homework_version(target_version_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare version_row public.homework_versions; next_number integer;
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select v.* into version_row from public.homework_versions v join public.homeworks h on h.id = v.homework_id where v.id = target_version_id and h.withdrawn_at is null for update; if not found or version_row.status <> 'draft' then raise exception 'Only an active Draft may be published'; end if;
  perform 1 from public.homeworks where id = version_row.homework_id for update;
  if not exists (select 1 from public.homework_version_blocks where homework_version_id = target_version_id) then raise exception 'Homework must contain at least one block'; end if;
  select coalesce(max(version_number), 0) + 1 into next_number from public.homework_versions where homework_id = version_row.homework_id and status = 'published';
  update public.homework_versions set status = 'published', version_number = next_number, published_at = now() where id = target_version_id;
  insert into public.homework_audit_events(actor_profile_id,event_type,homework_id,to_version_id,metadata) values (auth.uid(),'homework_published',version_row.homework_id,target_version_id,jsonb_build_object('version_number',next_number));
end;
$$;

create or replace function public.assign_homework(target_homework_id uuid, target_case_id uuid, target_version_id uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); assignment_id uuid; revision_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  perform 1 from public.homework_versions v join public.homeworks h on h.id=v.homework_id where v.id=target_version_id and v.homework_id=target_homework_id and v.status='published' and h.withdrawn_at is null; if not found then raise exception 'A published active Homework version is required'; end if;
  insert into public.homework_assignments(homework_id,counseling_case_id,assigned_by) values(target_homework_id,target_case_id,actor) on conflict (homework_id,counseling_case_id) where unassigned_at is null do update set updated_at=now() returning id into assignment_id;
  select id into revision_id from public.homework_assignment_revisions where homework_assignment_id=assignment_id and ended_at is null;
  if not found then insert into public.homework_assignment_revisions(homework_assignment_id,homework_version_id,updated_by) values(assignment_id,target_version_id,actor) returning id into revision_id; perform private.create_homework_progress(revision_id); end if;
  insert into public.homework_audit_events(actor_profile_id,event_type,homework_id,homework_assignment_id,to_version_id,metadata) values(actor,'homework_assignment_created',target_homework_id,assignment_id,target_version_id,jsonb_build_object('counseling_case_id',target_case_id)); return assignment_id;
end;
$$;

create or replace function public.unassign_homework(target_assignment_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare target_homework_id uuid;
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select homework_id into target_homework_id from public.homework_assignments where id=target_assignment_id for update;
  update public.homework_assignment_revisions set ended_at=now(), updated_by=auth.uid() where homework_assignment_id=target_assignment_id and ended_at is null;
  update public.homework_assignments set unassigned_at=now(), unassigned_by=auth.uid() where id=target_assignment_id and unassigned_at is null; if not found then raise exception 'Active assignment not found'; end if;
  insert into public.homework_audit_events(actor_profile_id,event_type,homework_id,homework_assignment_id) values(auth.uid(),'homework_assignment_unassigned',target_homework_id,target_assignment_id);
end;
$$;

create or replace function public.withdraw_homework(target_homework_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  update public.homeworks set withdrawn_at=now(), withdrawn_by=auth.uid() where id=target_homework_id and withdrawn_at is null; if not found then raise exception 'Homework is unavailable'; end if;
  insert into public.homework_audit_events(actor_profile_id,event_type,homework_id) values(auth.uid(),'homework_withdrawn',target_homework_id);
end;
$$;

create or replace function public.force_update_homework_assignment(target_assignment_id uuid, target_version_id uuid, reason text default null) returns void language plpgsql security definer set search_path = '' as $$
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
  insert into public.homework_audit_events(actor_profile_id,event_type,homework_id,homework_assignment_id,from_version_id,to_version_id) values(auth.uid(),'homework_assignment_force_updated',assignment_row.homework_id,target_assignment_id,old_revision.homework_version_id,target_version_id);
end;
$$;
