-- Add versioned Checkbox and Radio Homework questions without changing the
-- existing Long Answer text contract.
alter table public.homework_version_blocks
  add column question_choices jsonb,
  add column is_required boolean not null default true;

alter table public.homework_answers
  add column answer_value jsonb;

alter table public.homework_version_blocks drop constraint homework_version_blocks_type_check;
alter table public.homework_version_blocks add constraint homework_version_blocks_type_check check (
  block_type in ('rich_text', 'video_link', 'long_answer', 'checkbox_question', 'radio_question')
);

alter table public.homework_version_blocks drop constraint homework_version_blocks_shape_check;
alter table public.homework_version_blocks add constraint homework_version_blocks_shape_check check (
  (block_type in ('rich_text', 'long_answer')
    and rich_text_content is not null and url is null and question_choices is null)
  or (block_type = 'video_link'
    and rich_text_content is null and url is not null and btrim(url) <> '' and question_choices is null)
  or (block_type in ('checkbox_question', 'radio_question')
    and rich_text_content is not null and url is null
    and question_choices is not null and jsonb_typeof(question_choices) = 'array')
);

alter table public.homework_answers add constraint homework_answers_shape_check check (
  (answer_value is null)
  or (answer_text = '')
);

create or replace function private.homework_question_is_publishable(
  question_content jsonb,
  choices jsonb
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    private.homework_json_has_meaningful_text(question_content)
    and jsonb_typeof(choices) = 'array'
    and jsonb_array_length(choices) >= 2
    and not exists (
      select 1
      from jsonb_array_elements(choices) choice
      where jsonb_typeof(choice) <> 'object'
        or (select count(*) from jsonb_object_keys(choice)) <> 2
        or not (choice ? 'id' and choice ? 'label')
        or jsonb_typeof(choice -> 'id') <> 'string'
        or jsonb_typeof(choice -> 'label') <> 'string'
        or not coalesce((choice ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
        or btrim(choice ->> 'label') = ''
    )
    and (
      select count(*) = count(distinct choice ->> 'id')
      from jsonb_array_elements(choices) choice
    );
$$;
revoke all on function private.homework_question_is_publishable(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.validate_homework_version_block()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  version_homework uuid;
  block_homework uuid;
begin
  select homework_id into version_homework
  from public.homework_versions where id = new.homework_version_id;
  select homework_id into block_homework
  from public.homework_blocks where id = new.homework_block_id;
  if version_homework is null or version_homework <> block_homework then
    raise exception 'Homework block belongs to another Homework';
  end if;
  if new.block_type in ('rich_text', 'long_answer')
     and not private.homework_json_has_meaningful_text(new.rich_text_content) then
    raise exception 'Rich text content must be meaningful';
  end if;
  if new.block_type = 'video_link'
     and new.url !~* '^https?://(\[[0-9a-f:.]+\]|[[:alnum:]]+(-[[:alnum:]]+)*(\.[[:alnum:]]+(-[[:alnum:]]+)*)*\.?)(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
    raise exception 'Video link must be a valid http or https URL with a host';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_homework_version_block() from public, anon, authenticated;

create or replace function public.get_or_create_homework_draft(
  target_homework_id uuid,
  source_version_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  draft_id uuid;
  source public.homework_versions;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  perform 1 from public.homeworks where id = target_homework_id and withdrawn_at is null for update;
  if not found then raise exception 'Homework is unavailable'; end if;
  select id into draft_id from public.homework_versions where homework_id = target_homework_id and status = 'draft';
  if found then return draft_id; end if;
  if source_version_id is not null then
    select * into source from public.homework_versions
    where id = source_version_id and homework_id = target_homework_id and status = 'published' for update;
    if not found then raise exception 'Source version is unavailable'; end if;
  end if;
  insert into public.homework_versions(homework_id, status, based_on_version_id, created_by)
  values (target_homework_id, 'draft', source_version_id, actor)
  returning id into draft_id;
  if source_version_id is not null then
    insert into public.homework_version_blocks(
      homework_version_id, homework_block_id, block_type, position, title,
      rich_text_content, url, description, question_choices, is_required
    )
    select
      draft_id, homework_block_id, block_type, position, title,
      rich_text_content, url, description, question_choices, is_required
    from public.homework_version_blocks
    where homework_version_id = source_version_id
    order by position;
  end if;
  return draft_id;
end;
$$;

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
    select 1
    from public.homework_version_blocks block
    where block.homework_version_id = target_version_id
      and block.block_type in ('checkbox_question', 'radio_question')
      and not private.homework_question_is_publishable(block.rich_text_content, block.question_choices)
  ) then
    raise exception 'Complete each selection question before publishing';
  end if;
  select coalesce(max(version_number), 0) + 1 into next_number
  from public.homework_versions
  where homework_id = version_row.homework_id and status = 'published';
  update public.homework_versions
  set status = 'published', version_number = next_number, published_at = now()
  where id = target_version_id;
  insert into public.homework_audit_events(
    actor_profile_id, event_type, homework_id, to_version_id, metadata
  ) values (
    auth.uid(), 'homework_published', version_row.homework_id, target_version_id,
    jsonb_build_object('version_number', next_number)
  );
end;
$$;

create or replace function private.validate_homework_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  progress_row public.homework_participant_progress;
  target_block public.homework_version_blocks;
  selected_id text;
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

  select block.* into target_block
  from public.homework_assignment_revisions r
  join public.homework_version_blocks block on block.homework_version_id = r.homework_version_id
  where r.id = progress_row.assignment_revision_id
    and block.id = new.homework_version_block_id;
  if not found or target_block.block_type not in ('long_answer', 'checkbox_question', 'radio_question') then
    raise exception 'Answer does not target a response question in the assigned version';
  end if;
  if target_block.block_type = 'long_answer' then
    if new.answer_value is not null then raise exception 'Long Answer responses must use text'; end if;
  elsif target_block.block_type = 'radio_question' then
    if jsonb_typeof(new.answer_value) <> 'string' then raise exception 'Radio responses must contain one choice ID'; end if;
    selected_id := new.answer_value #>> '{}';
    if selected_id <> '' and not exists (
      select 1 from jsonb_array_elements(target_block.question_choices) choice
      where choice ->> 'id' = selected_id
    ) then raise exception 'Selection response contains an unknown choice'; end if;
  else
    if jsonb_typeof(new.answer_value) <> 'array' then raise exception 'Checkbox responses must contain choice IDs'; end if;
    if exists (
      select 1 from jsonb_array_elements(new.answer_value) selection
      where jsonb_typeof(selection) <> 'string'
        or not exists (
          select 1 from jsonb_array_elements(target_block.question_choices) choice
          where choice ->> 'id' = selection #>> '{}'
        )
    ) then raise exception 'Selection response contains an unknown choice'; end if;
    if (
      select count(*) <> count(distinct selection #>> '{}')
      from jsonb_array_elements(new.answer_value) selection
    ) then raise exception 'Checkbox responses cannot contain duplicate choices'; end if;
  end if;
  if progress_row.status in ('submitted', 'reviewed') then raise exception 'Submitted answers are read-only'; end if;
  return new;
end;
$$;
revoke all on function private.validate_homework_answer() from public, anon, authenticated;

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
              and jsonb_array_length(answer.answer_value) > 0
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
        or (block.block_type = 'checkbox_question' and jsonb_typeof(answer.answer_value) = 'array' and jsonb_array_length(answer.answer_value) > 0)
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

-- Keep existing direct table-write boundaries unchanged. New values are written
-- through the same authenticated RPC and existing triggers.

-- Extend the existing atomic Session/Homework authoring workflow with the new snapshot fields.
create or replace function public.save_session_homework_authoring_state(
  target_session_id uuid,
  target_title text,
  target_material jsonb,
  save_session boolean,
  target_homework_version_id uuid,
  target_homework_blocks jsonb,
  save_homework boolean,
  publish_homework boolean,
  target_session_intent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  session_row public.sessions%rowtype;
  target_homework_root_id uuid;
  version_row public.homework_versions%rowtype;
  version_id uuid;
  source_version_id uuid;
  submitted_snapshot_id uuid;
  snapshot_exists boolean;
  logical_id uuid;
  snapshot_id uuid;
  item jsonb;
  item_type text;
  item_title text;
  item_description text;
  item_url text;
  item_content jsonb;
  item_choices jsonb;
  item_required boolean;
  item_position integer;
  offset_value bigint;
  seen_snapshots uuid[] := '{}'::uuid[];
  seen_logical_ids uuid[] := '{}'::uuid[];
  seen_client_ids text[] := '{}'::text[];
  saved_blocks jsonb := '[]'::jsonb;
  session_result jsonb;
  published_version_number integer;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if target_session_intent not in ('save','publish','publish_changes') then
    raise exception 'Invalid authoring intent';
  end if;
  if publish_homework is distinct from (target_session_intent in ('publish','publish_changes')) then
    raise exception 'Homework publishing must match the Session action';
  end if;
  if target_session_intent = 'publish_changes' and not exists (
    select 1 from public.sessions s where s.id = target_session_id and s.status = 'published'
  ) then raise exception 'Publish Changes requires a Published Session'; end if;
  if save_homework and (target_homework_blocks is null or jsonb_typeof(target_homework_blocks) <> 'array') then
    raise exception 'Homework blocks must be an array';
  end if;

  if save_session or target_session_intent = 'publish' then
    session_result := public.save_session_builder_state(
      target_session_id, target_title, target_material,
      case when target_session_intent = 'publish' then 'publish' else 'save' end
    );
    target_session_id := (session_result ->> 'session_id')::uuid;
  else
    select * into session_row from public.sessions where id = target_session_id for update;
    if not found or session_row.status = 'archived' then raise exception 'Session is unavailable'; end if;
    if target_session_intent = 'publish_changes' then
      session_result := jsonb_build_object('session_id', session_row.id, 'status', session_row.status,
        'title', session_row.title, 'blocks', '[]'::jsonb);
    else
      session_result := jsonb_build_object('session_id', session_row.id, 'status', session_row.status,
        'title', session_row.title, 'blocks', '[]'::jsonb);
    end if;
  end if;

  select h.id into target_homework_root_id from public.homeworks h
  where h.session_id = target_session_id and h.withdrawn_at is null for update;

  if target_homework_root_id is null and save_homework then
    version_id := public.get_or_create_homework_draft_for_session(target_session_id);
    select h.id into target_homework_root_id from public.homeworks h
    where h.session_id = target_session_id and h.withdrawn_at is null for update;
    select v.* into version_row from public.homework_versions v where v.id = version_id for update;
  end if;

  if save_homework or publish_homework then
    if target_homework_root_id is null then
      if save_homework and jsonb_array_length(target_homework_blocks) > 0 then
        raise exception 'Homework draft is unavailable';
      end if;
    else
      if version_id is null and target_homework_version_id is not null then
        select v.* into version_row from public.homework_versions v
        where v.id = target_homework_version_id and v.homework_id = target_homework_root_id for update;
        if not found then raise exception 'Select a valid Homework draft or remove the unavailable Homework selection'; end if;
        version_id := version_row.id;
      end if;

      if save_homework then
        if version_id is null then raise exception 'Homework draft is unavailable'; end if;

        if version_row.status = 'published' and exists (
          select 1 from public.homework_assignment_revisions r where r.homework_version_id = version_id
        ) then
          source_version_id := version_id;
          version_id := public.get_or_create_homework_draft(target_homework_root_id, version_id);
          select * into version_row from public.homework_versions where id = version_id for update;
        end if;

        if version_row.status = 'draft' and exists (
          select 1 from public.homework_versions other
          where other.homework_id = target_homework_root_id and other.status = 'draft' and other.id <> version_id
        ) then
          raise exception 'Homework Draft changed. Reload and try again.';
        end if;

        for item in select value from jsonb_array_elements(target_homework_blocks) as blocks(value) loop
          if jsonb_typeof(item) <> 'object' or exists (
            select 1 from jsonb_object_keys(item) keys(key)
            where keys.key not in ('id','homework_block_id','client_id','block_type','title','rich_text_content','url','description','question_choices','is_required')
          ) then raise exception 'Invalid Homework block'; end if;
          item_type := item ->> 'block_type';
          if item_type not in ('rich_text','video_link','long_answer','checkbox_question','radio_question') then raise exception 'Unsupported Homework block type'; end if;
          item_title := nullif(btrim(item ->> 'title'), '');
          item_description := nullif(btrim(item ->> 'description'), '');
          item_url := nullif(btrim(item ->> 'url'), '');
          item_content := item -> 'rich_text_content';
          item_choices := item -> 'question_choices';
          item_required := case when jsonb_typeof(item -> 'is_required') = 'boolean' then (item ->> 'is_required')::boolean else null end;
          if item_title is not null and char_length(item_title) > 180 then raise exception 'Homework title is too long'; end if;
          if item_type in ('rich_text','long_answer') then
            if jsonb_typeof(item_content) is distinct from 'object' or item_url is not null or item_choices is not null and jsonb_typeof(item_choices) <> 'null' then raise exception 'Invalid Homework text block'; end if;
          elsif item_type in ('checkbox_question','radio_question') then
            if jsonb_typeof(item_content) is distinct from 'object' or item_url is not null
              or jsonb_typeof(item_choices) is distinct from 'array' or item_required is null then
              raise exception 'Invalid Homework selection question';
            end if;
          elsif jsonb_typeof(item -> 'url') is distinct from 'string'
            or not coalesce(item_url ~* '^https?://(\[[0-9a-f:.]+\]|[[:alnum:]]+(-[[:alnum:]]+)*(\.[[:alnum:]]+(-[[:alnum:]]+)*)*\.?)(:[0-9]{1,5})?([/?#][^[:space:]]*)?$', false)
            or item_content is not null and jsonb_typeof(item_content) <> 'null' then
            raise exception 'Enter a valid http or https Homework URL';
          end if;

          snapshot_id := null;
          logical_id := null;
          if item ? 'id' and jsonb_typeof(item -> 'id') = 'string' then
            submitted_snapshot_id := (item ->> 'id')::uuid;
            if submitted_snapshot_id = any(seen_snapshots) then raise exception 'Duplicate Homework block ID'; end if;
            seen_snapshots := array_append(seen_snapshots, submitted_snapshot_id);
            select vb.homework_block_id into logical_id from public.homework_version_blocks vb
            where vb.id = submitted_snapshot_id and vb.homework_version_id = version_id;
            if not found and source_version_id is not null then
              select vb.homework_block_id into logical_id from public.homework_version_blocks vb
              where vb.id = submitted_snapshot_id and vb.homework_version_id = source_version_id;
            end if;
            if not found or not exists (select 1 from public.homework_blocks b where b.id = logical_id and b.homework_id = target_homework_root_id) then
              raise exception 'Homework block does not belong to the editable version';
            end if;
            if item ? 'homework_block_id' and (item ->> 'homework_block_id')::uuid is distinct from logical_id then
              raise exception 'Homework block identity does not match its version snapshot';
            end if;
          else
            if item ? 'homework_block_id' and jsonb_typeof(item -> 'homework_block_id') = 'string' then
              logical_id := (item ->> 'homework_block_id')::uuid;
              if not exists (select 1 from public.homework_blocks b where b.id = logical_id and b.homework_id = target_homework_root_id) then
                raise exception 'Homework block belongs to another Homework';
              end if;
            else
              if jsonb_typeof(item -> 'client_id') <> 'string' then raise exception 'New Homework block requires a client ID'; end if;
              if btrim(item ->> 'client_id') = '' or char_length(item ->> 'client_id') > 100
                or (item ->> 'client_id') = any(seen_client_ids) then raise exception 'Invalid or duplicate Homework client ID'; end if;
              seen_client_ids := array_append(seen_client_ids, item ->> 'client_id');
              logical_id := null;
            end if;
          end if;
          if logical_id is not null then
            if logical_id = any(seen_logical_ids) then raise exception 'Duplicate Homework logical block ID'; end if;
            seen_logical_ids := array_append(seen_logical_ids, logical_id);
          end if;
        end loop;

        delete from public.homework_version_blocks vb
        where vb.homework_version_id = version_id and not (vb.id = any(seen_snapshots))
          and not (vb.homework_block_id = any(seen_logical_ids));
        select coalesce(max(position), -1)::bigint + count(*) + jsonb_array_length(target_homework_blocks) + 1
        into offset_value from public.homework_version_blocks where homework_version_id = version_id;
        update public.homework_version_blocks set position = position + offset_value
        where homework_version_id = version_id;

        item_position := 0;
        for item in select value from jsonb_array_elements(target_homework_blocks) as blocks(value) loop
          item_type := item ->> 'block_type';
          item_title := nullif(btrim(item ->> 'title'), '');
          item_description := nullif(btrim(item ->> 'description'), '');
          item_url := case when item_type = 'video_link' then btrim(item ->> 'url') else null end;
          item_content := case when item_type in ('rich_text','long_answer','checkbox_question','radio_question') then item -> 'rich_text_content' else null end;
          item_choices := case when item_type in ('checkbox_question','radio_question') then item -> 'question_choices' else null end;
          item_required := case when item_type in ('checkbox_question','radio_question') then (item ->> 'is_required')::boolean else true end;
          logical_id := case when item ? 'homework_block_id' and jsonb_typeof(item -> 'homework_block_id') = 'string'
            then (item ->> 'homework_block_id')::uuid else null end;
          snapshot_exists := false;
          if item ? 'id' and jsonb_typeof(item -> 'id') = 'string' then
            submitted_snapshot_id := (item ->> 'id')::uuid;
            select vb.id, vb.homework_block_id into snapshot_id, logical_id from public.homework_version_blocks vb
            where vb.id = submitted_snapshot_id and vb.homework_version_id = version_id;
            snapshot_exists := found;
            if not snapshot_exists and source_version_id is not null then
              select vb.homework_block_id into logical_id from public.homework_version_blocks vb
              where vb.id = submitted_snapshot_id and vb.homework_version_id = source_version_id;
              if found then
                select vb.id into snapshot_id from public.homework_version_blocks vb
                where vb.homework_version_id = version_id and vb.homework_block_id = logical_id;
                snapshot_exists := found;
              end if;
            end if;
          end if;
          if snapshot_exists then
            update public.homework_version_blocks set block_type = item_type, position = item_position,
              title = item_title, rich_text_content = item_content, url = item_url, description = item_description,
              question_choices = item_choices, is_required = item_required
            where id = snapshot_id and homework_version_id = version_id;
          else
            if logical_id is null and item ? 'homework_block_id' and jsonb_typeof(item -> 'homework_block_id') = 'string' then
              logical_id := (item ->> 'homework_block_id')::uuid;
            end if;
            if logical_id is null then
              insert into public.homework_blocks(homework_id) values(target_homework_root_id) returning id into logical_id;
            end if;
            insert into public.homework_version_blocks(homework_version_id, homework_block_id, block_type, position, title, rich_text_content, url, description, question_choices, is_required)
            values(version_id, logical_id, item_type, item_position, item_title, item_content, item_url, item_description, item_choices, item_required)
            returning id into snapshot_id;
          end if;
          saved_blocks := saved_blocks || jsonb_build_array(jsonb_build_object(
            'id', snapshot_id, 'homework_block_id', logical_id, 'block_type', item_type,
            'position', item_position, 'title', item_title, 'rich_text_content', item_content,
            'url', item_url, 'description', item_description,
            'question_choices', item_choices, 'is_required', item_required,
            'client_id', case when jsonb_typeof(item -> 'client_id') = 'string' then item ->> 'client_id' else null end
          ));
          item_position := item_position + 1;
        end loop;
      end if;

      if publish_homework and version_id is not null then
        if (select count(*) from public.homework_version_blocks where homework_version_id = version_id) > 0 then
          perform public.publish_homework_version(version_id);
          select version_number into published_version_number from public.homework_versions where id = version_id;
        end if;
      elsif publish_homework and target_homework_version_id is not null then
        raise exception 'Select a valid Homework draft or remove the unavailable Homework selection';
      end if;
    end if;
  end if;

  if target_homework_version_id is not null and not save_homework and target_homework_root_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id',vb.id,'homework_block_id',vb.homework_block_id,
      'block_type',vb.block_type,'position',vb.position,'title',vb.title,'rich_text_content',vb.rich_text_content,
      'url',vb.url,'description',vb.description,'question_choices',vb.question_choices,'is_required',vb.is_required) order by vb.position),'[]'::jsonb)
    into saved_blocks from public.homework_version_blocks vb where vb.homework_version_id = target_homework_version_id;
  end if;

  return jsonb_build_object('session', session_result, 'homework', jsonb_build_object(
    'version_id', coalesce(version_id, target_homework_version_id),
    'status', case when publish_homework and published_version_number is not null then 'published'
      when version_id is not null then (select status::text from public.homework_versions where id = version_id)
      else null end,
    'version_number', published_version_number,
    'blocks', saved_blocks
  ));
end;
$$;

-- A forced assignment revision carries forward only answers whose complete
-- versioned question definition is unchanged. New required questions downgrade
-- prior submissions in the same way existing new Long Answer prompts do.
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
                and jsonb_array_length(oa.answer_value) > 0)
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
