-- Homework pages are part of a version snapshot. Existing versions keep a NULL
-- manifest and NULL block page IDs until an author edits them; the app renders
-- those versions as one implicit "Page 1" without touching answer history.
alter table public.homework_versions add column page_manifest jsonb;
alter table public.homework_version_blocks add column page_id uuid;

create or replace function public.publish_homework_version(target_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_row public.homework_versions;
  next_number integer;
  fallback_page_id uuid := '00000000-0000-4000-8000-000000000001'::uuid;
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
  if version_row.page_manifest is null then
    update public.homework_versions set page_manifest = jsonb_build_array(jsonb_build_object(
      'id', fallback_page_id, 'title', 'Page 1', 'position', 0
    )) where id = target_version_id;
    update public.homework_version_blocks set page_id = fallback_page_id
      where homework_version_id = target_version_id and page_id is null;
    select * into version_row from public.homework_versions where id = target_version_id;
  end if;
  if jsonb_typeof(version_row.page_manifest) <> 'array' or jsonb_array_length(version_row.page_manifest) = 0 then
    raise exception 'Homework must have at least one page';
  end if;
  if exists (
    select 1 from jsonb_array_elements(version_row.page_manifest) with ordinality p(value, n)
    where jsonb_typeof(p.value) <> 'object'
      or jsonb_typeof(p.value -> 'id') is distinct from 'string'
      or not coalesce((p.value ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
      or jsonb_typeof(p.value -> 'title') is distinct from 'string' or btrim(p.value ->> 'title') = ''
      or char_length(p.value ->> 'title') > 120
      or jsonb_typeof(p.value -> 'position') is distinct from 'number'
      or (p.value ->> 'position')::integer <> (p.n - 1)::integer
      or (select count(*) from jsonb_object_keys(p.value)) <> 3
  ) then raise exception 'Each Homework page needs a valid title and order'; end if;
  if exists (select 1 from jsonb_array_elements(version_row.page_manifest) p(value) group by p.value ->> 'id' having count(*) > 1) then
    raise exception 'Homework page IDs must be unique';
  end if;
  if exists (
    select 1 from jsonb_array_elements(version_row.page_manifest) p(value)
    where not exists (select 1 from public.homework_version_blocks b
      where b.homework_version_id = target_version_id and b.page_id = (p.value ->> 'id')::uuid)
  ) then raise exception 'Each Homework page must contain at least one content block'; end if;
  if exists (
    select 1 from public.homework_version_blocks b where b.homework_version_id = target_version_id
      and (b.page_id is null or not exists (select 1 from jsonb_array_elements(version_row.page_manifest) p(value)
        where p.value ->> 'id' = b.page_id::text))
  ) then raise exception 'Homework content must belong to a page'; end if;
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
    where block.homework_version_id = target_version_id and block.description like '%side_by_side_response%'
      and (private.homework_side_by_side_metadata(block.description) is null
        or not private.homework_side_by_side_pair_is_valid(target_version_id,
          private.homework_side_by_side_metadata(block.description) ->> 'groupId'))
  ) then raise exception 'Complete each Side-by-Side Response before publishing'; end if;
  select coalesce(max(version_number), 0) + 1 into next_number
    from public.homework_versions where homework_id = version_row.homework_id and status = 'published';
  update public.homework_versions set status = 'published', version_number = next_number, published_at = now()
    where id = target_version_id;
  insert into public.homework_audit_events(actor_profile_id, event_type, homework_id, to_version_id, metadata)
    values (auth.uid(), 'homework_published', version_row.homework_id, target_version_id,
      jsonb_build_object('version_number', next_number));
end;
$$;
revoke all on function public.publish_homework_version(uuid) from public, anon;
grant execute on function public.publish_homework_version(uuid) to authenticated;

create or replace function private.prevent_published_homework_page_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  version_status public.homework_version_status;
begin
  if tg_op = 'UPDATE' then
    perform 1 from public.homework_versions
      where id in (old.homework_version_id, new.homework_version_id) and status = 'published'
      order by id for update;
    if found then raise exception 'Published Homework versions are immutable'; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    select status into version_status from public.homework_versions where id = new.homework_version_id for update;
  else
    select status into version_status from public.homework_versions where id = old.homework_version_id for update;
  end if;
  if version_status = 'published' then raise exception 'Published Homework versions are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger prevent_published_homework_page_block_mutation
  before insert or update or delete on public.homework_version_blocks
  for each row execute function private.prevent_published_homework_page_mutation();
revoke all on function private.prevent_published_homework_page_mutation() from public, anon, authenticated;

create or replace function private.prevent_published_homework_version_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'published' then raise exception 'Published Homework versions are immutable'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger prevent_published_homework_version_mutation
  before update or delete on public.homework_versions
  for each row execute function private.prevent_published_homework_version_mutation();
revoke all on function private.prevent_published_homework_version_mutation() from public, anon, authenticated;

create or replace function public.get_or_create_homework_draft(
  target_homework_id uuid, source_version_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  draft_id uuid;
  source public.homework_versions;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then raise exception 'Not authorized'; end if;
  perform 1 from public.homeworks where id = target_homework_id and withdrawn_at is null for update;
  if not found then raise exception 'Homework is unavailable'; end if;
  select id into draft_id from public.homework_versions where homework_id = target_homework_id and status = 'draft';
  if found then return draft_id; end if;
  if source_version_id is not null then
    select * into source from public.homework_versions where id = source_version_id and homework_id = target_homework_id and status = 'published' for update;
    if not found then raise exception 'Source version is unavailable'; end if;
  end if;
  insert into public.homework_versions(homework_id,status,based_on_version_id,created_by,page_manifest)
    values(target_homework_id,'draft',source_version_id,actor,source.page_manifest) returning id into draft_id;
  if source_version_id is not null then
    insert into public.homework_version_blocks(homework_version_id,homework_block_id,block_type,position,title,rich_text_content,url,description,question_choices,is_required,page_id)
      select draft_id,homework_block_id,block_type,position,title,rich_text_content,url,description,question_choices,is_required,page_id
      from public.homework_version_blocks where homework_version_id = source_version_id order by position;
  end if;
  return draft_id;
end;
$$;
revoke all on function public.get_or_create_homework_draft(uuid,uuid) from public, anon;
grant execute on function public.get_or_create_homework_draft(uuid,uuid) to authenticated;

-- The existing authoring RPC remains unchanged for compatibility. This wrapper
-- stores page metadata and block placement in the same transaction, ensures edits
-- to a published source always target a new draft, then publishes only after the
-- page-level validation has succeeded.
create or replace function public.save_session_homework_authoring_state_with_pages(
  target_session_id uuid,
  target_title text,
  target_material jsonb,
  save_session boolean,
  target_homework_version_id uuid,
  target_homework_blocks jsonb,
  save_homework boolean,
  publish_homework boolean,
  target_session_intent text,
  target_is_final boolean,
  target_page_manifest jsonb,
  target_deleted_page_ids uuid[],
  target_page_delete_confirmation text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  session_result jsonb;
  result jsonb;
  version_id uuid;
  homework_id uuid;
  current_version public.homework_versions;
  page_item jsonb;
  block_item jsonb;
  saved_block jsonb;
  i integer;
  publish_number integer;
  previous_manifest jsonb;
  expected_deleted_page_ids uuid[];
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if target_session_intent not in ('save','publish','publish_changes')
    or publish_homework is distinct from (target_session_intent in ('publish','publish_changes')) then
    raise exception 'Homework publishing must match the Session action';
  end if;
  if save_homework and (jsonb_typeof(target_page_manifest) <> 'array' or jsonb_typeof(target_homework_blocks) <> 'array') then
    raise exception 'Homework pages and blocks must be arrays';
  end if;
  if target_session_intent = 'publish' then
    session_result := public.save_session_builder_state(target_session_id, target_title, target_material, 'publish');
    target_session_id := (session_result ->> 'session_id')::uuid;
  end if;
  if target_session_intent = 'publish_changes' and not exists (
    select 1 from public.sessions s where s.id = target_session_id and s.status = 'published'
  ) then raise exception 'Publish Changes requires a Published Session'; end if;

  select h.id into homework_id from public.homeworks h where h.session_id = target_session_id and h.withdrawn_at is null for update;
  if save_homework and homework_id is not null and target_homework_version_id is not null then
    select * into current_version from public.homework_versions v
      where v.id = target_homework_version_id and v.homework_id = homework_id for update;
    if not found then raise exception 'Select a valid Homework draft or remove the unavailable Homework selection'; end if;
    if current_version.status = 'published' then
      target_homework_version_id := public.get_or_create_homework_draft(homework_id, current_version.id);
      select * into current_version from public.homework_versions v where v.id = target_homework_version_id for update;
    end if;
  end if;

  result := public.save_session_homework_authoring_state(
    target_session_id, target_title, target_material,
    case when target_session_intent = 'save' then save_session else false end,
    target_homework_version_id,
    case when save_homework then (
      select coalesce(jsonb_agg(value - 'page_id' order by ordinality), '[]'::jsonb)
      from jsonb_array_elements(target_homework_blocks) with ordinality as items(value, ordinality)
    ) else target_homework_blocks end,
    save_homework, false, 'save'
  );
  session_result := coalesce(session_result, result -> 'session');
  target_session_id := coalesce(target_session_id, nullif(result #>> '{session,session_id}', '')::uuid);
  update public.sessions set is_final = target_is_final
    where id = target_session_id and status <> 'archived';
  if not found then raise exception 'Session is unavailable'; end if;
  session_result := jsonb_set(coalesce(session_result, '{}'::jsonb), '{is_final}', to_jsonb(target_is_final), true);
  version_id := nullif(result #>> '{homework,version_id}', '')::uuid;
  if save_homework and version_id is not null then
    select * into current_version from public.homework_versions v where v.id = version_id for update;
    if current_version.status <> 'draft' or exists (select 1 from public.homework_assignment_revisions r where r.homework_version_id = version_id) then
      raise exception 'Only an unassigned Homework Draft can be changed';
    end if;
    previous_manifest := coalesce(current_version.page_manifest,
      jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000001','title','Page 1','position',0)));
    select coalesce(array_agg((old_page.value ->> 'id')::uuid order by old_page.ordinality), '{}'::uuid[])
      into expected_deleted_page_ids
      from jsonb_array_elements(previous_manifest) with ordinality old_page(value, ordinality)
      where not exists (select 1 from jsonb_array_elements(target_page_manifest) new_page(value)
        where new_page.value ->> 'id' = old_page.value ->> 'id');
    if expected_deleted_page_ids is distinct from coalesce(target_deleted_page_ids, '{}'::uuid[]) then
      raise exception 'Homework page deletion confirmation is required';
    end if;
    if cardinality(expected_deleted_page_ids) > 0 and target_page_delete_confirmation is distinct from 'DELETE' then
      raise exception 'Homework page deletion confirmation is required';
    end if;
    if jsonb_array_length(target_page_manifest) = 0 then raise exception 'Homework must have at least one page'; end if;
    if exists (
      select 1 from jsonb_array_elements(target_page_manifest) with ordinality p(value, n)
      where jsonb_typeof(p.value) <> 'object' or (select count(*) from jsonb_object_keys(p.value)) <> 3
        or jsonb_typeof(p.value -> 'id') is distinct from 'string'
        or not coalesce((p.value ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
        or jsonb_typeof(p.value -> 'title') is distinct from 'string' or char_length(p.value ->> 'title') > 120
        or jsonb_typeof(p.value -> 'position') is distinct from 'number' or (p.value ->> 'position')::integer <> (p.n - 1)::integer
    ) then raise exception 'Invalid Homework page'; end if;
    if publish_homework and exists (
      select 1 from jsonb_array_elements(target_page_manifest) p(value)
      where not exists (select 1 from jsonb_array_elements(target_homework_blocks) b(value)
        where b.value ->> 'page_id' = p.value ->> 'id')
    ) then raise exception 'Each Homework page must contain at least one content block'; end if;
    if exists (
      select 1 from jsonb_array_elements(target_homework_blocks) b(value)
      where not exists (select 1 from jsonb_array_elements(target_page_manifest) p(value)
        where p.value ->> 'id' = b.value ->> 'page_id')
    ) then raise exception 'Homework content must belong to a page'; end if;
    if exists (select 1 from jsonb_array_elements(target_page_manifest) p(value) group by p.value ->> 'id' having count(*) > 1) then
      raise exception 'Homework page IDs must be unique';
    end if;
    update public.homework_versions set page_manifest = target_page_manifest where id = version_id and status = 'draft';
    for i in 0..jsonb_array_length(target_homework_blocks) - 1 loop
      block_item := target_homework_blocks -> i;
      saved_block := result #> array['homework','blocks',i::text];
      update public.homework_version_blocks set page_id = (block_item ->> 'page_id')::uuid
        where id = (saved_block ->> 'id')::uuid and homework_version_id = version_id;
      result := jsonb_set(result, array['homework','blocks',i::text,'page_id'], to_jsonb(block_item ->> 'page_id'), true);
    end loop;
    if publish_homework and jsonb_array_length(target_homework_blocks) > 0 then
      perform public.publish_homework_version(version_id);
      select version_number into publish_number from public.homework_versions where id = version_id;
      result := jsonb_set(result, '{homework,status}', '"published"'::jsonb, true);
      result := jsonb_set(result, '{homework,version_number}', to_jsonb(publish_number), true);
    end if;
  end if;
  if version_id is not null and not (save_homework and version_id is not null) then
    select page_manifest into target_page_manifest from public.homework_versions where id = version_id;
  end if;
  result := jsonb_set(result, '{homework,pages}', coalesce(target_page_manifest, '[]'::jsonb), true);
  result := jsonb_set(result, '{session}', coalesce(session_result, 'null'::jsonb), true);
  return result;
end;
$$;
revoke all on function public.save_session_homework_authoring_state_with_pages(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text,boolean,jsonb,uuid[],text) from public, anon;
grant execute on function public.save_session_homework_authoring_state_with_pages(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text,boolean,jsonb,uuid[],text) to authenticated;

create or replace function public.get_counselor_submitted_homework_review(target_progress_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'progressId', progress.id, 'caseId', assignment.counseling_case_id, 'profileId', progress.profile_id,
    'submittedAt', progress.submitted_at, 'sessionTitle', coalesce(case_session.title, session.title),
    'sessionSequence', case_session.template_sequence_number,
    'pages', coalesce((select version.page_manifest from public.homework_versions version where version.id = revision.homework_version_id),
      jsonb_build_array(jsonb_build_object('id','00000000-0000-4000-8000-000000000001','title','Page 1','position',0))),
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
      'blockId', block.id, 'type', block.block_type, 'position', block.position, 'title', block.title,
      'content', block.rich_text_content, 'choices', block.question_choices, 'isRequired', block.is_required,
      'description', block.description, 'answerText', answer.answer_text, 'answerValue', answer.answer_value,
      'pageId', coalesce(block.page_id, '00000000-0000-4000-8000-000000000001'::uuid),
      'pageTitle', coalesce((select p.value ->> 'title' from jsonb_array_elements(version.page_manifest) p(value) where p.value ->> 'id' = coalesce(block.page_id, '00000000-0000-4000-8000-000000000001'::uuid)::text limit 1), 'Page 1'))
      order by coalesce((select (p.value ->> 'position')::integer from jsonb_array_elements(version.page_manifest) p(value) where p.value ->> 'id' = coalesce(block.page_id, '00000000-0000-4000-8000-000000000001'::uuid)::text limit 1), 0), block.position)
      from public.homework_version_blocks block
      join public.homework_versions version on version.id = block.homework_version_id
      left join public.homework_answers answer on answer.homework_version_block_id = block.id and answer.participant_progress_id = progress.id
      where block.homework_version_id = revision.homework_version_id and block.block_type in ('long_answer','checkbox_question','radio_question')), '[]'::jsonb)
  )
  from public.homework_participant_progress progress
  join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
  join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
  join public.case_sessions case_session on case_session.homework_assignment_revision_id = revision.id and case_session.counseling_case_id = assignment.counseling_case_id
  join public.sessions session on session.id = case_session.session_id
  join public.case_assignments counselor_assignment on counselor_assignment.counseling_case_id = assignment.counseling_case_id and counselor_assignment.assignment_type = 'counselor' and counselor_assignment.ended_at is null
  join public.groups counselor_team on counselor_team.id = counselor_assignment.assigned_group_id and counselor_team.active
  join public.group_members counselor_membership on counselor_membership.group_id = counselor_team.id and counselor_membership.profile_id = (select auth.uid()) and counselor_membership.ended_at is null
  where progress.id = target_progress_id and progress.status in ('submitted','reviewed') and progress.submitted_at is not null
    and not exists (select 1 from public.counseling_cases counseling_case join public.group_members couple_membership on couple_membership.group_id = counseling_case.couple_group_id and couple_membership.profile_id = (select auth.uid()) and couple_membership.ended_at is null where counseling_case.id = assignment.counseling_case_id)
    and ((counselor_team.group_type = 'counselor_team' and (select private.current_user_has_role(array['counselor']::public.app_role[])))
      or (counselor_team.group_type = 'coach_team' and (select private.current_user_has_role(array['coach']::public.app_role[])))
      or (counselor_team.group_type = 'campus_lead_team' and (select private.current_user_has_role(array['campus_lead']::public.app_role[]))));
$$;
revoke all on function public.get_counselor_submitted_homework_review(uuid) from public, anon;
grant execute on function public.get_counselor_submitted_homework_review(uuid) to authenticated;
