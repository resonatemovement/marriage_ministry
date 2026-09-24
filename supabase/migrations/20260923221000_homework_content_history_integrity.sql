-- Serialize snapshot edits with first assignment and inspect both sides of a move.
create or replace function private.prevent_assigned_homework_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_version_id uuid;
  new_version_id uuid;
  version_id uuid;
begin
  if tg_table_name = 'homework_versions' then
    if tg_op <> 'INSERT' then old_version_id := old.id; end if;
    if tg_op <> 'DELETE' then new_version_id := new.id; end if;
  else
    if tg_op <> 'INSERT' then old_version_id := old.homework_version_id; end if;
    if tg_op <> 'DELETE' then new_version_id := new.homework_version_id; end if;

    -- The revision INSERT guard below takes the same lock before recording use.
    for version_id in
      select v.id
      from public.homework_versions v
      where v.id in (old_version_id, new_version_id)
      order by v.id
      for update
    loop
      null;
    end loop;
  end if;

  if exists (
    select 1
    from public.homework_assignment_revisions r
    where r.homework_version_id in (old_version_id, new_version_id)
  ) then
    raise exception 'Assigned published Homework versions are immutable';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.prevent_assigned_homework_mutation() from public, anon, authenticated;

create function private.lock_homework_version_on_revision_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.homework_versions v
  where v.id = new.homework_version_id
  for update;
  return new;
end;
$$;

create trigger lock_homework_version_on_revision_insert
before insert on public.homework_assignment_revisions
for each row execute function private.lock_homework_version_on_revision_insert();

revoke all on function private.lock_homework_version_on_revision_insert() from public, anon, authenticated;

create function private.prevent_homework_block_reparenting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.homework_id is distinct from old.homework_id then
    raise exception 'Logical Homework blocks cannot change Homework';
  end if;
  return new;
end;
$$;

create trigger prevent_homework_block_reparenting
before update on public.homework_blocks
for each row execute function private.prevent_homework_block_reparenting();

revoke all on function private.prevent_homework_block_reparenting() from public, anon, authenticated;
