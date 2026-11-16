-- Side-by-Side Response is represented by two existing Long Answer snapshot
-- blocks. This preserves versioned block identity and the existing per-block
-- answer/RLS model; the reserved description metadata only groups the pair.

create or replace function private.homework_side_by_side_metadata(value text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare parsed jsonb;
begin
  if value is null then return null; end if;
  parsed := value::jsonb;
  if jsonb_typeof(parsed) <> 'object'
    or (select count(*) from jsonb_object_keys(parsed)) <> 7
    or not (parsed ?& array['kind','groupId','side','instructions','leftHeading','rightHeading','bothRequired'])
    or parsed ->> 'kind' <> 'side_by_side_response'
    or not coalesce(parsed ->> 'groupId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
    or parsed ->> 'side' not in ('left','right')
    or jsonb_typeof(parsed -> 'instructions') <> 'string'
    or jsonb_typeof(parsed -> 'leftHeading') <> 'string'
    or jsonb_typeof(parsed -> 'rightHeading') <> 'string'
    or jsonb_typeof(parsed -> 'bothRequired') <> 'boolean'
    or btrim(parsed ->> 'leftHeading') = ''
    or btrim(parsed ->> 'rightHeading') = ''
    or char_length(parsed ->> 'leftHeading') > 180
    or char_length(parsed ->> 'rightHeading') > 180
    or char_length(parsed ->> 'instructions') > 4000 then
    return null;
  end if;
  return parsed;
exception when others then
  return null;
end;
$$;

create or replace function private.homework_side_by_side_pair_is_valid(target_version_id uuid, target_group_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with pair as (
    select block.title, private.homework_side_by_side_metadata(block.description) as metadata
    from public.homework_version_blocks block
    where block.homework_version_id = target_version_id
      and block.block_type = 'long_answer'
      and private.homework_side_by_side_metadata(block.description) ->> 'groupId' = target_group_id
  )
  select count(*) = 2
    and count(*) filter (where metadata ->> 'side' = 'left') = 1
    and count(*) filter (where metadata ->> 'side' = 'right') = 1
    and bool_and(metadata is not null)
    and bool_and(title is not null and title = case when metadata ->> 'side' = 'left' then metadata ->> 'leftHeading' else metadata ->> 'rightHeading' end)
    and min(metadata ->> 'instructions') = max(metadata ->> 'instructions')
    and min(metadata ->> 'leftHeading') = max(metadata ->> 'leftHeading')
    and min(metadata ->> 'rightHeading') = max(metadata ->> 'rightHeading')
    and min(metadata ->> 'bothRequired') = max(metadata ->> 'bothRequired')
  from pair;
$$;

revoke all on function private.homework_side_by_side_metadata(text) from public, anon, authenticated;
revoke all on function private.homework_side_by_side_pair_is_valid(uuid, text) from public, anon, authenticated;

create or replace function public.publish_homework_version(target_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_row public.homework_versions;
  next_number integer;
begin
  if auth.uid() is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  select v.* into version_row
  from public.homework_versions v
  join public.homeworks h on h.id = v.homework_id
  where v.id = target_version_id and h.withdrawn_at is null
  for update;
  if not found or version_row.status <> 'draft' then raise exception 'Only an active Draft may be published'; end if;
  perform 1 from public.homeworks where id = version_row.homework_id for update;
  if not exists (select 1 from public.homework_version_blocks where homework_version_id = target_version_id) then
    raise exception 'Homework must contain at least one block';
  end if;
  if exists (
    select 1 from public.homework_version_blocks block
    where block.homework_version_id = target_version_id
      and block.block_type in ('checkbox_question', 'radio_question')
      and not private.homework_question_is_publishable(block.rich_text_content, block.question_choices)
  ) then raise exception 'Complete each selection question before publishing'; end if;
  if exists (
    select 1 from public.homework_version_blocks block
    where block.homework_version_id = target_version_id
      and block.description like '%side_by_side_response%'
      and (
        private.homework_side_by_side_metadata(block.description) is null
        or not private.homework_side_by_side_pair_is_valid(
          target_version_id,
          private.homework_side_by_side_metadata(block.description) ->> 'groupId'
        )
      )
  ) then raise exception 'Complete each Side-by-Side Response before publishing'; end if;
  select coalesce(max(version_number), 0) + 1 into next_number
  from public.homework_versions
  where homework_id = version_row.homework_id and status = 'published';
  update public.homework_versions
  set status = 'published', version_number = next_number, published_at = now()
  where id = target_version_id;
  insert into public.homework_audit_events(actor_profile_id, event_type, homework_id, to_version_id, metadata)
  values (auth.uid(), 'homework_published', version_row.homework_id, target_version_id,
    jsonb_build_object('version_number', next_number));
end;
$$;
revoke all on function public.publish_homework_version(uuid) from public, anon;
grant execute on function public.publish_homework_version(uuid) to authenticated;

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
  if target_answers is null or jsonb_typeof(target_answers) <> 'object' then raise exception 'Homework answers must be an object'; end if;
  if exists (select 1 from jsonb_each(target_answers) entry where entry.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'Homework answers contain an invalid block ID';
  end if;

  select p.status, r.homework_version_id into progress_status, assigned_version_id
  from public.homework_participant_progress p
  join public.homework_assignment_revisions r on r.id = p.assignment_revision_id
  join public.homework_assignments a on a.id = r.homework_assignment_id
  where p.id = target_progress_id and p.profile_id = auth.uid() and a.unassigned_at is null and r.ended_at is null
  for update of a, p;
  if not found then raise exception 'Active participant progress is unavailable'; end if;
  if progress_status in ('submitted', 'reviewed') then raise exception 'Submitted answers are read-only'; end if;

  if exists (
    select 1 from public.homework_version_blocks block
    where block.homework_version_id = assigned_version_id
      and block.description like '%side_by_side_response%'
      and (
        private.homework_side_by_side_metadata(block.description) is null
        or not private.homework_side_by_side_pair_is_valid(assigned_version_id,
          private.homework_side_by_side_metadata(block.description) ->> 'groupId')
      )
  ) then raise exception 'Side-by-Side Homework content is invalid'; end if;

  if exists (
    select 1 from jsonb_each(target_answers) entry
    left join public.homework_version_blocks block on block.id = entry.key::uuid and block.homework_version_id = assigned_version_id
    where block.id is null
      or block.block_type not in ('long_answer', 'checkbox_question', 'radio_question')
      or (block.block_type in ('long_answer', 'radio_question') and jsonb_typeof(entry.value) <> 'string')
      or (block.block_type = 'checkbox_question' and jsonb_typeof(entry.value) <> 'array')
  ) then raise exception 'Homework answer does not belong to this assignment or has an invalid type'; end if;

  if exists (
    select 1 from jsonb_each(target_answers) entry
    join public.homework_version_blocks block on block.id = entry.key::uuid
    where block.block_type = 'radio_question' and (entry.value #>> '{}') <> ''
      and not exists (select 1 from jsonb_array_elements(block.question_choices) choice where choice ->> 'id' = entry.value #>> '{}')
  ) then raise exception 'Selection response contains an unknown choice'; end if;

  if exists (
    select 1 from jsonb_each(target_answers) entry
    join public.homework_version_blocks block on block.id = entry.key::uuid
    where block.block_type = 'checkbox_question' and (
      exists (select 1 from jsonb_array_elements(entry.value) selection where jsonb_typeof(selection) <> 'string'
        or not exists (select 1 from jsonb_array_elements(block.question_choices) choice where choice ->> 'id' = selection #>> '{}'))
      or (select count(*) <> count(distinct selection #>> '{}') from jsonb_array_elements(entry.value) selection)
    )
  ) then raise exception 'Checkbox response contains an invalid or duplicate choice'; end if;

  insert into public.homework_answers(participant_progress_id, homework_version_block_id, answer_text, answer_value)
  select target_progress_id, entry.key::uuid,
    case when block.block_type = 'long_answer' then entry.value #>> '{}' else '' end,
    case when block.block_type = 'long_answer' then null else entry.value end
  from jsonb_each(target_answers) entry
  join public.homework_version_blocks block on block.id = entry.key::uuid and block.homework_version_id = assigned_version_id
  left join public.homework_answers existing on existing.participant_progress_id = target_progress_id and existing.homework_version_block_id = entry.key::uuid
  where block.block_type <> 'long_answer' or btrim(entry.value #>> '{}') <> '' or existing.id is not null
  on conflict (participant_progress_id, homework_version_block_id)
  do update set answer_text = excluded.answer_text, answer_value = excluded.answer_value;

  if target_intent = 'submit' then
    if exists (
      select 1 from public.homework_version_blocks block
      where block.homework_version_id = assigned_version_id and (
        (block.block_type = 'long_answer'
          and not coalesce((private.homework_side_by_side_metadata(block.description) ->> 'kind' = 'side_by_side_response'
            and private.homework_side_by_side_metadata(block.description) ->> 'bothRequired' = 'false'), false)
          and not exists (select 1 from public.homework_answers answer where answer.participant_progress_id = target_progress_id
            and answer.homework_version_block_id = block.id and btrim(answer.answer_text) <> ''))
        or (block.block_type = 'radio_question' and block.is_required and not exists (
          select 1 from public.homework_answers answer where answer.participant_progress_id = target_progress_id
            and answer.homework_version_block_id = block.id and jsonb_typeof(answer.answer_value) = 'string' and btrim(answer.answer_value #>> '{}') <> ''))
        or (block.block_type = 'checkbox_question' and block.is_required and not exists (
          select 1 from public.homework_answers answer where answer.participant_progress_id = target_progress_id
            and answer.homework_version_block_id = block.id and jsonb_typeof(answer.answer_value) = 'array' and answer.answer_value <> '[]'::jsonb))
      )
    ) then raise exception 'Every required Homework response needs a meaningful answer'; end if;
    update public.homework_participant_progress set status = 'submitted', submitted_at = now(), reviewed_at = null
    where id = target_progress_id returning status into progress_status;
  elsif progress_status = 'not_started' and exists (
    select 1 from public.homework_answers answer
    join public.homework_version_blocks block on block.id = answer.homework_version_block_id
    where answer.participant_progress_id = target_progress_id and block.homework_version_id = assigned_version_id and (
      (block.block_type = 'long_answer' and btrim(answer.answer_text) <> '')
      or (block.block_type = 'radio_question' and jsonb_typeof(answer.answer_value) = 'string' and btrim(answer.answer_value #>> '{}') <> '')
      or (block.block_type = 'checkbox_question' and jsonb_typeof(answer.answer_value) = 'array' and answer.answer_value <> '[]'::jsonb))
  ) then
    update public.homework_participant_progress set status = 'in_progress' where id = target_progress_id returning status into progress_status;
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
  if auth.uid() is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select a.* into assignment_row from public.homework_assignments a where a.id = target_assignment_id and a.unassigned_at is null for update;
  if not found then raise exception 'Active assignment not found'; end if;
  select * into old_revision from public.homework_assignment_revisions where homework_assignment_id = target_assignment_id and ended_at is null for update;
  if not found then raise exception 'Active revision not found'; end if;
  if not exists (select 1 from public.homework_versions where id = target_version_id and homework_id = assignment_row.homework_id and status = 'published') then
    raise exception 'Target must be a published version of the same Homework';
  end if;
  update public.homework_assignment_revisions set ended_at = now(), update_reason = coalesce(reason, 'force_version_update'), updated_by = auth.uid() where id = old_revision.id;
  insert into public.homework_assignment_revisions(homework_assignment_id, homework_version_id, update_reason, updated_by)
  values (target_assignment_id, target_version_id, coalesce(reason, 'force_version_update'), auth.uid()) returning id into new_revision;
  perform private.create_homework_progress(new_revision);

  for old_progress in select * from public.homework_participant_progress where assignment_revision_id = old_revision.id loop
    insert into public.homework_answers(participant_progress_id, homework_version_block_id, answer_text, answer_value)
    select np.id, nb.id, oa.answer_text, oa.answer_value
    from public.homework_answers oa
    join public.homework_version_blocks ob on ob.id = oa.homework_version_block_id
    join public.homework_version_blocks nb on nb.homework_version_id = target_version_id
      and nb.homework_block_id = ob.homework_block_id and nb.block_type = ob.block_type
      and nb.rich_text_content = ob.rich_text_content and nb.title is not distinct from ob.title
      and nb.description is not distinct from ob.description and nb.question_choices is not distinct from ob.question_choices
      and nb.is_required = ob.is_required
    join public.homework_participant_progress np on np.assignment_revision_id = new_revision and np.profile_id = old_progress.profile_id
    where oa.participant_progress_id = old_progress.id and ob.block_type in ('long_answer', 'checkbox_question', 'radio_question');

    select exists (
      select 1 from public.homework_version_blocks nb where nb.homework_version_id = target_version_id
        and (
          (nb.block_type = 'long_answer'
            and not coalesce((private.homework_side_by_side_metadata(nb.description) ->> 'kind' = 'side_by_side_response'
              and private.homework_side_by_side_metadata(nb.description) ->> 'bothRequired' = 'false'), false))
          or (nb.block_type in ('checkbox_question', 'radio_question') and nb.is_required)
        )
        and not exists (
          select 1 from public.homework_version_blocks ob
          join public.homework_answers oa on oa.homework_version_block_id = ob.id and oa.participant_progress_id = old_progress.id
          where ob.homework_version_id = old_revision.homework_version_id and ob.homework_block_id = nb.homework_block_id
            and ob.block_type = nb.block_type and ob.rich_text_content = nb.rich_text_content
            and ob.title is not distinct from nb.title and ob.description is not distinct from nb.description
            and ob.question_choices is not distinct from nb.question_choices and ob.is_required = nb.is_required
            and ((nb.block_type = 'long_answer' and btrim(oa.answer_text) <> '')
              or (nb.block_type = 'radio_question' and jsonb_typeof(oa.answer_value) = 'string' and btrim(oa.answer_value #>> '{}') <> '')
              or (nb.block_type = 'checkbox_question' and jsonb_typeof(oa.answer_value) = 'array' and oa.answer_value <> '[]'::jsonb))
        )
    ) into changed_required;

    update public.homework_participant_progress set
      status = case when old_progress.status = 'submitted' and not changed_required then 'submitted'
        when old_progress.status in ('submitted', 'reviewed') then 'in_progress' else old_progress.status end,
      submitted_at = case when old_progress.status = 'submitted' and not changed_required then old_progress.submitted_at else null end
    where assignment_revision_id = new_revision and profile_id = old_progress.profile_id;
  end loop;

  insert into public.homework_audit_events(actor_profile_id, event_type, homework_id, homework_assignment_id, from_version_id, to_version_id)
  values (auth.uid(), 'homework_assignment_force_updated', assignment_row.homework_id, target_assignment_id, old_revision.homework_version_id, target_version_id);
end;
$$;
revoke all on function public.force_update_homework_assignment(uuid, uuid, text) from public, anon;
grant execute on function public.force_update_homework_assignment(uuid, uuid, text) to authenticated;

create or replace function public.get_counselor_submitted_homework_review(target_progress_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'progressId', progress.id, 'caseId', assignment.counseling_case_id, 'profileId', progress.profile_id,
    'submittedAt', progress.submitted_at, 'sessionTitle', coalesce(case_session.title, session.title),
    'sessionSequence', case_session.template_sequence_number,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'blockId', block.id, 'type', block.block_type, 'position', block.position, 'title', block.title,
        'content', block.rich_text_content, 'choices', block.question_choices, 'isRequired', block.is_required,
        'description', block.description, 'answerText', answer.answer_text, 'answerValue', answer.answer_value
      ) order by block.position)
      from public.homework_version_blocks block
      left join public.homework_answers answer on answer.homework_version_block_id = block.id and answer.participant_progress_id = progress.id
      where block.homework_version_id = revision.homework_version_id
        and block.block_type in ('long_answer', 'checkbox_question', 'radio_question')
    ), '[]'::jsonb)
  )
  from public.homework_participant_progress progress
  join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
  join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
  join public.case_sessions case_session on case_session.homework_assignment_revision_id = revision.id and case_session.counseling_case_id = assignment.counseling_case_id
  join public.sessions session on session.id = case_session.session_id
  join public.case_assignments counselor_assignment on counselor_assignment.counseling_case_id = assignment.counseling_case_id
    and counselor_assignment.assignment_type = 'counselor' and counselor_assignment.ended_at is null
  join public.groups counselor_team on counselor_team.id = counselor_assignment.assigned_group_id and counselor_team.active
  join public.group_members counselor_membership on counselor_membership.group_id = counselor_team.id
    and counselor_membership.profile_id = (select auth.uid()) and counselor_membership.ended_at is null
  where progress.id = target_progress_id and progress.status in ('submitted', 'reviewed') and progress.submitted_at is not null
    and not exists (select 1 from public.counseling_cases counseling_case join public.group_members couple_membership
      on couple_membership.group_id = counseling_case.couple_group_id and couple_membership.profile_id = (select auth.uid())
      and couple_membership.ended_at is null where counseling_case.id = assignment.counseling_case_id)
    and ((counselor_team.group_type = 'counselor_team' and (select private.current_user_has_role(array['counselor']::public.app_role[])))
      or (counselor_team.group_type = 'coach_team' and (select private.current_user_has_role(array['coach']::public.app_role[])))
      or (counselor_team.group_type = 'campus_lead_team' and (select private.current_user_has_role(array['campus_lead']::public.app_role[]))));
$$;
revoke all on function public.get_counselor_submitted_homework_review(uuid) from public, anon;
grant execute on function public.get_counselor_submitted_homework_review(uuid) to authenticated;
