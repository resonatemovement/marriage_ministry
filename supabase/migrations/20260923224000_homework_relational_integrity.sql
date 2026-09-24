-- Keep independent foreign keys tied to the same Homework root.
create function private.validate_homework_revision_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.homework_assignment_id is distinct from old.homework_assignment_id
       or new.homework_version_id is distinct from old.homework_version_id
       or new.started_at is distinct from old.started_at
       or (old.ended_at is not null and new.ended_at is distinct from old.ended_at) then
      raise exception 'Homework revision identity and ended history are immutable';
    end if;
  end if;

  if not exists (
    select 1
    from public.homework_assignments a
    join public.homework_versions v on v.homework_id = a.homework_id
    where a.id = new.homework_assignment_id
      and v.id = new.homework_version_id
      and v.status = 'published'
  ) then
    raise exception 'Homework revision version must be published and belong to its assignment Homework';
  end if;
  return new;
end;
$$;

create trigger validate_homework_revision_ownership
before insert or update on public.homework_assignment_revisions
for each row execute function private.validate_homework_revision_ownership();

revoke all on function private.validate_homework_revision_ownership() from public, anon, authenticated;

create function private.validate_homework_audit_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Homework audit events are append-only'; end if;
  if tg_op = 'UPDATE' then raise exception 'Homework audit events are append-only'; end if;

  if (new.homework_assignment_id is not null and not exists (
        select 1 from public.homework_assignments a
        where a.id = new.homework_assignment_id and a.homework_id = new.homework_id
      ))
     or (new.from_version_id is not null and not exists (
        select 1 from public.homework_versions v
        where v.id = new.from_version_id and v.homework_id = new.homework_id
      ))
     or (new.to_version_id is not null and not exists (
        select 1 from public.homework_versions v
        where v.id = new.to_version_id and v.homework_id = new.homework_id
      )) then
    raise exception 'Homework audit references must belong to the event Homework';
  end if;
  return new;
end;
$$;

create trigger validate_homework_audit_ownership
before insert or update or delete on public.homework_audit_events
for each row execute function private.validate_homework_audit_ownership();

revoke all on function private.validate_homework_audit_ownership() from public, anon, authenticated;

-- Reusing an active assignment is idempotent; a different version needs the
-- explicit, audited super-admin force-update path.
create or replace function public.assign_homework(target_homework_id uuid, target_case_id uuid, target_version_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  assignment_id uuid;
  revision_id uuid;
  active_version_id uuid;
  created boolean := false;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;

  -- Serialize new assignment with withdrawal of its Homework root.
  perform 1 from public.homeworks
  where id = target_homework_id and withdrawn_at is null for update;
  if not found then raise exception 'Homework is unavailable'; end if;

  perform 1 from public.homework_versions
  where id = target_version_id and homework_id = target_homework_id and status = 'published';
  if not found then raise exception 'A published active Homework version is required'; end if;

  insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
  values (target_homework_id, target_case_id, actor)
  on conflict (homework_id, counseling_case_id) where unassigned_at is null do nothing
  returning id into assignment_id;
  created := found;

  if not created then
    select id into assignment_id from public.homework_assignments
    where homework_id = target_homework_id and counseling_case_id = target_case_id
      and unassigned_at is null for update;
    if not found then raise exception 'Active Homework assignment changed during reuse'; end if;
  end if;

  select id, homework_version_id into revision_id, active_version_id
  from public.homework_assignment_revisions
  where homework_assignment_id = assignment_id and ended_at is null for update;

  if found then
    if active_version_id <> target_version_id then
      raise exception 'Active assignment already uses another Homework version; use force update';
    end if;
  else
    insert into public.homework_assignment_revisions(homework_assignment_id, homework_version_id, updated_by)
    values (assignment_id, target_version_id, actor) returning id into revision_id;
    perform private.create_homework_progress(revision_id);
  end if;

  if created then
    insert into public.homework_audit_events
      (actor_profile_id, event_type, homework_id, homework_assignment_id, to_version_id, metadata)
    values (actor, 'homework_assignment_created', target_homework_id, assignment_id,
            target_version_id, jsonb_build_object('counseling_case_id', target_case_id));
  end if;
  return assignment_id;
end;
$$;

create or replace function public.force_update_homework_assignment(target_assignment_id uuid, target_version_id uuid, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_revision public.homework_assignment_revisions;
  assignment_row public.homework_assignments;
  new_revision uuid;
  old_progress record;
  changed_required boolean;
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select a.* into assignment_row from public.homework_assignments a
  where a.id = target_assignment_id and a.unassigned_at is null for update;
  if not found then raise exception 'Active assignment not found'; end if;
  select * into old_revision from public.homework_assignment_revisions
  where homework_assignment_id = target_assignment_id and ended_at is null for update;
  if not found then raise exception 'Active revision not found'; end if;
  if not exists (select 1 from public.homework_versions
                 where id = target_version_id and homework_id = assignment_row.homework_id and status = 'published') then
    raise exception 'Target must be a published version of the same Homework';
  end if;
  if target_version_id = old_revision.homework_version_id then
    raise exception 'Force update requires a different Homework version';
  end if;

  update public.homework_assignment_revisions
  set ended_at = now(), update_reason = coalesce(reason, 'force_version_update'), updated_by = auth.uid()
  where id = old_revision.id;
  insert into public.homework_assignment_revisions(homework_assignment_id, homework_version_id, update_reason, updated_by)
  values (target_assignment_id, target_version_id, coalesce(reason, 'force_version_update'), auth.uid())
  returning id into new_revision;
  perform private.create_homework_progress(new_revision);

  for old_progress in
    select * from public.homework_participant_progress where assignment_revision_id = old_revision.id
  loop
    insert into public.homework_answers(participant_progress_id, homework_version_block_id, answer_text)
    select np.id, nb.id, oa.answer_text
    from public.homework_answers oa
    join public.homework_version_blocks ob
      on ob.id = oa.homework_version_block_id
     and ob.homework_version_id = old_revision.homework_version_id
     and ob.block_type = 'long_answer'
    join public.homework_version_blocks nb
      on nb.homework_version_id = target_version_id
     and nb.homework_block_id = ob.homework_block_id
     and nb.block_type = 'long_answer'
     and nb.rich_text_content = ob.rich_text_content
     and nb.title is not distinct from ob.title
    join public.homework_participant_progress np
      on np.assignment_revision_id = new_revision and np.profile_id = old_progress.profile_id
    where oa.participant_progress_id = old_progress.id;

    select exists (
      select 1 from public.homework_version_blocks nb
      where nb.homework_version_id = target_version_id and nb.block_type = 'long_answer'
        and not exists (
          select 1 from public.homework_version_blocks ob
          join public.homework_answers oa
            on oa.homework_version_block_id = ob.id and oa.participant_progress_id = old_progress.id
          where ob.homework_version_id = old_revision.homework_version_id
            and ob.homework_block_id = nb.homework_block_id
            and ob.block_type = 'long_answer'
            and ob.rich_text_content = nb.rich_text_content
            and ob.title is not distinct from nb.title
            and btrim(oa.answer_text) <> ''
        )
    ) into changed_required;

    update public.homework_participant_progress
    set status = case when old_progress.status = 'submitted' and not changed_required then 'submitted'
                      when old_progress.status in ('submitted', 'reviewed') then 'in_progress'
                      else old_progress.status end,
        submitted_at = case when old_progress.status = 'submitted' and not changed_required
                            then old_progress.submitted_at else null end
    where assignment_revision_id = new_revision and profile_id = old_progress.profile_id;
  end loop;

  insert into public.homework_audit_events
    (actor_profile_id, event_type, homework_id, homework_assignment_id, from_version_id, to_version_id)
  values (auth.uid(), 'homework_assignment_force_updated', assignment_row.homework_id,
          target_assignment_id, old_revision.homework_version_id, target_version_id);
end;
$$;

-- Explicitly limit client-callable Homework operations to signed-in users.
revoke all on function public.get_or_create_homework_draft(uuid, uuid), public.publish_homework_version(uuid),
  public.assign_homework(uuid, uuid, uuid), public.save_homework_answer(uuid, uuid, text),
  public.submit_homework(uuid), public.unassign_homework(uuid), public.withdraw_homework(uuid),
  public.force_update_homework_assignment(uuid, uuid, text) from public, anon;
