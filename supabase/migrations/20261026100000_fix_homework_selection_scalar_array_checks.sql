-- Keep Checkbox non-empty checks safe when the same query also evaluates
-- Radio JSON scalars. PostgreSQL may evaluate Boolean operands in any order.
create or replace function public.persist_participant_homework(
  target_progress_id uuid,
  target_answers jsonb,
  target_intent text
) returns public.homework_progress_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  progress_status public.homework_progress_status;
  assigned_version_id uuid;
begin
  if target_intent not in ('save', 'submit') then raise exception 'Invalid Homework persistence intent'; end if;
  if target_answers is null or jsonb_typeof(target_answers) <> 'object' then
    raise exception 'Homework answers must be an object';
  end if;
  if exists (
    select 1 from jsonb_each(target_answers) entry
    where entry.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then raise exception 'Homework answers contain an invalid block ID'; end if;

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

  if exists (
    select 1
    from jsonb_each(target_answers) entry
    left join public.homework_version_blocks block
      on block.id = entry.key::uuid and block.homework_version_id = assigned_version_id
    where block.id is null
      or block.block_type not in ('long_answer', 'checkbox_question', 'radio_question')
      or (block.block_type in ('long_answer', 'radio_question') and jsonb_typeof(entry.value) <> 'string')
      or (block.block_type = 'checkbox_question' and jsonb_typeof(entry.value) <> 'array')
  ) then raise exception 'Homework answer does not belong to this assignment or has an invalid type'; end if;

  if exists (
    select 1
    from jsonb_each(target_answers) entry
    join public.homework_version_blocks block on block.id = entry.key::uuid
    where block.block_type = 'radio_question'
      and (entry.value #>> '{}') <> ''
      and not exists (
        select 1 from jsonb_array_elements(block.question_choices) choice
        where choice ->> 'id' = entry.value #>> '{}'
      )
  ) then raise exception 'Selection response contains an unknown choice'; end if;

  if exists (
    select 1
    from jsonb_each(target_answers) entry
    join public.homework_version_blocks block on block.id = entry.key::uuid
    where block.block_type = 'checkbox_question'
      and (
        exists (
          select 1 from jsonb_array_elements(entry.value) selection
          where jsonb_typeof(selection) <> 'string'
            or not exists (
              select 1 from jsonb_array_elements(block.question_choices) choice
              where choice ->> 'id' = selection #>> '{}'
            )
        )
        or (select count(*) <> count(distinct selection #>> '{}') from jsonb_array_elements(entry.value) selection)
      )
  ) then raise exception 'Checkbox response contains an invalid or duplicate choice'; end if;

  insert into public.homework_answers(
    participant_progress_id, homework_version_block_id, answer_text, answer_value
  )
  select
    target_progress_id,
    entry.key::uuid,
    case when block.block_type = 'long_answer' then entry.value #>> '{}' else '' end,
    case when block.block_type = 'long_answer' then null else entry.value end
  from jsonb_each(target_answers) entry
  join public.homework_version_blocks block
    on block.id = entry.key::uuid and block.homework_version_id = assigned_version_id
  left join public.homework_answers existing
    on existing.participant_progress_id = target_progress_id
   and existing.homework_version_block_id = entry.key::uuid
  where block.block_type <> 'long_answer'
     or btrim(entry.value #>> '{}') <> ''
     or existing.id is not null
  on conflict (participant_progress_id, homework_version_block_id)
  do update set answer_text = excluded.answer_text, answer_value = excluded.answer_value;

  if target_intent = 'submit' then
    if exists (
      select 1
      from public.homework_version_blocks block
      where block.homework_version_id = assigned_version_id
        and (
          (block.block_type = 'long_answer' and not exists (
            select 1 from public.homework_answers answer
            where answer.participant_progress_id = target_progress_id
              and answer.homework_version_block_id = block.id
              and btrim(answer.answer_text) <> ''
          ))
          or (block.block_type = 'radio_question' and block.is_required and not exists (
            select 1 from public.homework_answers answer
            where answer.participant_progress_id = target_progress_id
              and answer.homework_version_block_id = block.id
              and jsonb_typeof(answer.answer_value) = 'string'
              and btrim(answer.answer_value #>> '{}') <> ''
          ))
          or (block.block_type = 'checkbox_question' and block.is_required and not exists (
            select 1 from public.homework_answers answer
            where answer.participant_progress_id = target_progress_id
              and answer.homework_version_block_id = block.id
              and jsonb_typeof(answer.answer_value) = 'array'
              and answer.answer_value <> '[]'::jsonb
          ))
        )
    ) then raise exception 'Every required Homework response needs a meaningful answer'; end if;

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
      and (
        (block.block_type = 'long_answer' and btrim(answer.answer_text) <> '')
        or (block.block_type = 'radio_question' and jsonb_typeof(answer.answer_value) = 'string' and btrim(answer.answer_value #>> '{}') <> '')
        or (block.block_type = 'checkbox_question' and jsonb_typeof(answer.answer_value) = 'array' and answer.answer_value <> '[]'::jsonb)
      )
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

create or replace function public.force_update_homework_assignment(
  target_assignment_id uuid,
  target_version_id uuid,
  reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_revision public.homework_assignment_revisions;
  assignment_row public.homework_assignments;
  new_revision uuid;
  old_progress record;
  changed_required boolean;
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select a.* into assignment_row
  from public.homework_assignments a
  where a.id = target_assignment_id and a.unassigned_at is null
  for update;
  if not found then raise exception 'Active assignment not found'; end if;
  select * into old_revision
  from public.homework_assignment_revisions
  where homework_assignment_id = target_assignment_id and ended_at is null
  for update;
  if not found then raise exception 'Active revision not found'; end if;
  if not exists (
    select 1 from public.homework_versions
    where id = target_version_id
      and homework_id = assignment_row.homework_id
      and status = 'published'
  ) then raise exception 'Target must be a published version of the same Homework'; end if;

  update public.homework_assignment_revisions
  set ended_at = now(), update_reason = coalesce(reason, 'force_version_update'), updated_by = auth.uid()
  where id = old_revision.id;
  insert into public.homework_assignment_revisions(
    homework_assignment_id, homework_version_id, update_reason, updated_by
  ) values (
    target_assignment_id, target_version_id, coalesce(reason, 'force_version_update'), auth.uid()
  ) returning id into new_revision;
  perform private.create_homework_progress(new_revision);

  for old_progress in
    select * from public.homework_participant_progress
    where assignment_revision_id = old_revision.id
  loop
    insert into public.homework_answers(
      participant_progress_id, homework_version_block_id, answer_text, answer_value
    )
    select
      np.id, nb.id, oa.answer_text, oa.answer_value
    from public.homework_answers oa
    join public.homework_version_blocks ob on ob.id = oa.homework_version_block_id
    join public.homework_version_blocks nb
      on nb.homework_version_id = target_version_id
     and nb.homework_block_id = ob.homework_block_id
     and nb.block_type = ob.block_type
     and nb.rich_text_content = ob.rich_text_content
     and nb.title is not distinct from ob.title
     and nb.question_choices is not distinct from ob.question_choices
     and nb.is_required = ob.is_required
    join public.homework_participant_progress np
      on np.assignment_revision_id = new_revision
     and np.profile_id = old_progress.profile_id
    where oa.participant_progress_id = old_progress.id
      and ob.block_type in ('long_answer', 'checkbox_question', 'radio_question');

    select exists (
      select 1
      from public.homework_version_blocks nb
      where nb.homework_version_id = target_version_id
        and (
          nb.block_type = 'long_answer'
          or (nb.block_type in ('checkbox_question', 'radio_question') and nb.is_required)
        )
        and not exists (
          select 1
          from public.homework_version_blocks ob
          join public.homework_answers oa
            on oa.homework_version_block_id = ob.id
           and oa.participant_progress_id = old_progress.id
          where ob.homework_version_id = old_revision.homework_version_id
            and ob.homework_block_id = nb.homework_block_id
            and ob.block_type = nb.block_type
            and ob.rich_text_content = nb.rich_text_content
            and ob.title is not distinct from nb.title
            and ob.question_choices is not distinct from nb.question_choices
            and ob.is_required = nb.is_required
            and (
              (nb.block_type = 'long_answer' and btrim(oa.answer_text) <> '')
              or (nb.block_type = 'radio_question'
                and jsonb_typeof(oa.answer_value) = 'string'
                and btrim(oa.answer_value #>> '{}') <> '')
              or (nb.block_type = 'checkbox_question'
                and jsonb_typeof(oa.answer_value) = 'array'
                and oa.answer_value <> '[]'::jsonb)
            )
        )
    ) into changed_required;

    update public.homework_participant_progress
    set
      status = case
        when old_progress.status = 'submitted' and not changed_required then 'submitted'
        when old_progress.status in ('submitted', 'reviewed') then 'in_progress'
        else old_progress.status
      end,
      submitted_at = case
        when old_progress.status = 'submitted' and not changed_required then old_progress.submitted_at
        else null
      end
    where assignment_revision_id = new_revision
      and profile_id = old_progress.profile_id;
  end loop;

  insert into public.homework_audit_events(
    actor_profile_id, event_type, homework_id, homework_assignment_id,
    from_version_id, to_version_id
  ) values (
    auth.uid(), 'homework_assignment_force_updated', assignment_row.homework_id,
    target_assignment_id, old_revision.homework_version_id, target_version_id
  );
end;
$$;
