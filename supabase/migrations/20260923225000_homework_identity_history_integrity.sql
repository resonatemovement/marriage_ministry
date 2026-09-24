-- The source of a Draft and the Draft itself must have the same Homework root.
create function private.validate_homework_version_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.homework_id is distinct from old.homework_id then
    raise exception 'Homework versions cannot change Homework roots';
  end if;
  if new.based_on_version_id is not null and not exists (
    select 1 from public.homework_versions source
    where source.id = new.based_on_version_id
      and source.homework_id = new.homework_id
      and source.status = 'published'
  ) then
    raise exception 'Draft source version must be published and belong to the same Homework';
  end if;
  return new;
end;
$$;

create trigger validate_homework_version_ownership
before insert or update on public.homework_versions
for each row execute function private.validate_homework_version_ownership();
revoke all on function private.validate_homework_version_ownership() from public, anon, authenticated;

create function private.prevent_homework_assignment_reparenting()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.homework_id is distinct from old.homework_id
     or new.counseling_case_id is distinct from old.counseling_case_id
     or new.assigned_by is distinct from old.assigned_by
     or new.assigned_at is distinct from old.assigned_at
     or (old.unassigned_at is not null and new.unassigned_at is distinct from old.unassigned_at) then
    raise exception 'Homework assignment identity and unassignment history are immutable';
  end if;
  return new;
end;
$$;

create trigger prevent_homework_assignment_reparenting
before update on public.homework_assignments
for each row execute function private.prevent_homework_assignment_reparenting();
revoke all on function private.prevent_homework_assignment_reparenting() from public, anon, authenticated;

-- Check participant membership at creation, while preserving archived membership
-- history if a Couple member later leaves the group.
create function private.validate_homework_progress_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.assignment_revision_id is distinct from old.assignment_revision_id
       or new.profile_id is distinct from old.profile_id then
      raise exception 'Homework participant progress cannot be reparented';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.homework_assignment_revisions r
    join public.homework_assignments a on a.id = r.homework_assignment_id
    join public.counseling_cases c on c.id = a.counseling_case_id
    join public.groups g on g.id = c.couple_group_id and g.group_type = 'couple'
    join public.group_members gm on gm.group_id = g.id and gm.ended_at is null
    where r.id = new.assignment_revision_id
      and r.ended_at is null
      and a.unassigned_at is null
      and gm.profile_id = new.profile_id
  ) then
    raise exception 'Homework progress requires an active member of the assigned Couple';
  end if;
  return new;
end;
$$;

create trigger validate_homework_progress_ownership
before insert or update on public.homework_participant_progress
for each row execute function private.validate_homework_progress_ownership();
revoke all on function private.validate_homework_progress_ownership() from public, anon, authenticated;

create or replace function private.validate_homework_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare progress_row public.homework_participant_progress;
begin
  if tg_op = 'UPDATE' and (
    new.participant_progress_id is distinct from old.participant_progress_id
    or new.homework_version_block_id is distinct from old.homework_version_block_id
  ) then
    raise exception 'Homework answers cannot be reparented';
  end if;

  select p.* into progress_row
  from public.homework_participant_progress p
  join public.homework_assignment_revisions r on r.id = p.assignment_revision_id
  join public.homework_assignments a on a.id = r.homework_assignment_id
  where p.id = new.participant_progress_id
    and r.ended_at is null
    and a.unassigned_at is null;
  if not found then raise exception 'Answers require active Homework progress'; end if;

  if not exists (
    select 1
    from public.homework_assignment_revisions r
    join public.homework_version_blocks block
      on block.homework_version_id = r.homework_version_id
    where r.id = progress_row.assignment_revision_id
      and block.id = new.homework_version_block_id
      and block.block_type = 'long_answer'
  ) then
    raise exception 'Answers may only target Long Answer blocks in the assigned version';
  end if;
  if progress_row.status in ('submitted', 'reviewed') then
    raise exception 'Submitted answers are read-only';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_homework_answer() from public, anon, authenticated;
