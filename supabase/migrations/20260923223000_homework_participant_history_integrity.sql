create or replace function public.save_homework_answer(target_progress_id uuid, target_block_id uuid, target_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  progress_status public.homework_progress_status;
begin
  -- The assignment lock serializes participant writes with unassign and force update.
  select p.status into progress_status
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

  -- The answer trigger remains authoritative for exact-version Long Answers.
  insert into public.homework_answers (participant_progress_id, homework_version_block_id, answer_text)
  values (target_progress_id, target_block_id, coalesce(target_answer, ''))
  on conflict (participant_progress_id, homework_version_block_id)
  do update set answer_text = excluded.answer_text;

  if progress_status = 'not_started' and btrim(coalesce(target_answer, '')) <> '' then
    update public.homework_participant_progress
    set status = 'in_progress'
    where id = target_progress_id;
  end if;
end;
$$;

create or replace function public.submit_homework(target_progress_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  progress_status public.homework_progress_status;
  assigned_version_id uuid;
begin
  select p.status, r.homework_version_id into progress_status, assigned_version_id
  from public.homework_participant_progress p
  join public.homework_assignment_revisions r on r.id = p.assignment_revision_id
  join public.homework_assignments a on a.id = r.homework_assignment_id
  where p.id = target_progress_id
    and p.profile_id = auth.uid()
    and a.unassigned_at is null
    and r.ended_at is null
  for update of a, p;

  if not found then raise exception 'Active participant progress is unavailable'; end if;
  if progress_status in ('submitted', 'reviewed') then return; end if;

  if exists (
    select 1
    from public.homework_version_blocks b
    where b.homework_version_id = assigned_version_id
      and b.block_type = 'long_answer'
      and not exists (
        select 1
        from public.homework_answers answer
        where answer.participant_progress_id = target_progress_id
          and answer.homework_version_block_id = b.id
          and btrim(answer.answer_text) <> ''
      )
  ) then
    raise exception 'Every Long Answer requires a meaningful answer';
  end if;

  update public.homework_participant_progress
  set status = 'submitted', submitted_at = now(), reviewed_at = null
  where id = target_progress_id;
end;
$$;

revoke all on function private.create_homework_progress(uuid) from public, anon, authenticated;
