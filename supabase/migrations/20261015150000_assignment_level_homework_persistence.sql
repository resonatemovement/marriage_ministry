create or replace function public.persist_participant_homework(
  target_progress_id uuid,
  target_answers jsonb,
  target_intent text
)
returns public.homework_progress_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  progress_status public.homework_progress_status;
  assigned_version_id uuid;
begin
  if target_intent not in ('save', 'submit') then
    raise exception 'Invalid Homework persistence intent';
  end if;

  if target_answers is null or jsonb_typeof(target_answers) <> 'object' then
    raise exception 'Homework answers must be an object';
  end if;

  if exists (
    select 1
    from jsonb_each(target_answers) entry
    where entry.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(entry.value) <> 'string'
  ) then
    raise exception 'Homework answers contain an invalid value';
  end if;

  -- This lock serializes the whole assignment-level operation with lifecycle writes.
  select p.status, r.homework_version_id
  into progress_status, assigned_version_id
  from public.homework_participant_progress p
  join public.homework_assignment_revisions r on r.id = p.assignment_revision_id
  join public.homework_assignments a on a.id = r.homework_assignment_id
  where p.id = target_progress_id
    and p.profile_id = auth.uid()
    and a.unassigned_at is null
    and r.ended_at is null
  for update of a, p;

  if not found then raise exception 'Active participant progress is unavailable'; end if;
  if progress_status in ('submitted', 'reviewed') then raise exception 'Submitted answers are read-only'; end if;

  -- Reject the entire payload before writing if any key is not a Long Answer
  -- from the exact pinned Homework version.
  if exists (
    select 1
    from jsonb_object_keys(target_answers) answer_key
    where not exists (
      select 1
      from public.homework_version_blocks block
      where block.id = answer_key::uuid
        and block.homework_version_id = assigned_version_id
        and block.block_type = 'long_answer'
    )
  ) then
    raise exception 'Homework answer does not belong to this assignment';
  end if;

  insert into public.homework_answers (
    participant_progress_id,
    homework_version_block_id,
    answer_text
  )
  select
    target_progress_id,
    entry.key::uuid,
    entry.value
  from jsonb_each_text(target_answers) entry
  left join public.homework_answers existing
    on existing.participant_progress_id = target_progress_id
   and existing.homework_version_block_id = entry.key::uuid
  where btrim(entry.value) <> '' or existing.id is not null
  on conflict (participant_progress_id, homework_version_block_id)
  do update set answer_text = excluded.answer_text;

  if target_intent = 'submit' then
    if exists (
      select 1
      from public.homework_version_blocks block
      where block.homework_version_id = assigned_version_id
        and block.block_type = 'long_answer'
        and not exists (
          select 1
          from public.homework_answers answer
          where answer.participant_progress_id = target_progress_id
            and answer.homework_version_block_id = block.id
            and btrim(answer.answer_text) <> ''
        )
    ) then
      raise exception 'Every Long Answer requires a meaningful answer';
    end if;

    update public.homework_participant_progress
    set status = 'submitted', submitted_at = now(), reviewed_at = null
    where id = target_progress_id
    returning status into progress_status;
  elsif progress_status = 'not_started' and exists (
    select 1
    from public.homework_answers answer
    join public.homework_version_blocks block on block.id = answer.homework_version_block_id
    where answer.participant_progress_id = target_progress_id
      and block.homework_version_id = assigned_version_id
      and btrim(answer.answer_text) <> ''
  ) then
    update public.homework_participant_progress
    set status = 'in_progress'
    where id = target_progress_id
    returning status into progress_status;
  end if;

  return progress_status;
end;
$$;

revoke all on function public.persist_participant_homework(uuid, jsonb, text) from public, anon;
grant execute on function public.persist_participant_homework(uuid, jsonb, text) to authenticated;
