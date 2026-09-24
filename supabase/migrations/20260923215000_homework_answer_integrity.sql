create or replace function private.validate_homework_answer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  progress_row public.homework_participant_progress;
  assigned_version_id uuid;
begin
  select * into progress_row from public.homework_participant_progress where id = new.participant_progress_id;
  select homework_version_id into assigned_version_id from public.homework_assignment_revisions where id = progress_row.assignment_revision_id;

  if not exists (
    select 1
    from public.homework_version_blocks block
    where block.id = new.homework_version_block_id
      and block.homework_version_id = assigned_version_id
      and block.block_type = 'long_answer'
  ) then
    raise exception 'Answers may only target Long Answer blocks in the assigned version';
  end if;

  if progress_row.status in ('submitted', 'reviewed') then raise exception 'Submitted answers are read-only'; end if;
  return new;
end;
$$;
