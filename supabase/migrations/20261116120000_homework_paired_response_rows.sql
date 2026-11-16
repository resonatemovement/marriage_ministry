-- Side-by-Side answers remain in the existing versioned Long Answer snapshots
-- and per-participant answer rows. Each column stores an ordered JSON array of
-- stable UUID response-row IDs; no Couple answer table or RLS policy changes.

create or replace function private.homework_side_by_side_metadata(value text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare parsed jsonb; key_count integer;
begin
  if value is null then return null; end if;
  parsed := value::jsonb;
  key_count := (select count(*) from jsonb_object_keys(parsed));
  if jsonb_typeof(parsed) <> 'object'
    or key_count not in (7, 8)
    or not (parsed ?& array['kind','groupId','side','instructions','leftHeading','rightHeading','bothRequired'])
    or parsed ->> 'kind' <> 'side_by_side_response'
    or not coalesce(parsed ->> 'groupId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
    or coalesce(parsed ->> 'side' not in ('left','right'), true)
    or jsonb_typeof(parsed -> 'instructions') <> 'string'
    or jsonb_typeof(parsed -> 'leftHeading') <> 'string'
    or jsonb_typeof(parsed -> 'rightHeading') <> 'string'
    or jsonb_typeof(parsed -> 'bothRequired') <> 'boolean'
    or btrim(parsed ->> 'leftHeading') = ''
    or btrim(parsed ->> 'rightHeading') = ''
    or char_length(parsed ->> 'leftHeading') > 180
    or char_length(parsed ->> 'rightHeading') > 180
    or char_length(parsed ->> 'instructions') > 4000
    or (key_count = 7 and parsed ? 'responseMode')
    or (key_count = 8 and (not parsed ? 'responseMode' or jsonb_typeof(parsed -> 'responseMode') <> 'string' or parsed ->> 'responseMode' <> 'paired_rows_v1')) then
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
    and bool_and(title is not null and title = case when metadata ->> 'side' = 'left' then btrim(metadata ->> 'leftHeading') else btrim(metadata ->> 'rightHeading') end)
    and min(metadata ->> 'instructions') = max(metadata ->> 'instructions')
    and min(metadata ->> 'leftHeading') = max(metadata ->> 'leftHeading')
    and min(metadata ->> 'rightHeading') = max(metadata ->> 'rightHeading')
    and min(metadata ->> 'bothRequired') = max(metadata ->> 'bothRequired')
    and min(coalesce(metadata ->> 'responseMode', 'legacy')) = max(coalesce(metadata ->> 'responseMode', 'legacy'))
  from pair;
$$;

create or replace function private.homework_side_by_side_answer_column(value text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare parsed jsonb; row_value jsonb; row_id text; seen_ids text[] := '{}'::text[];
begin
  if value is null then return null; end if;
  parsed := value::jsonb;
  if jsonb_typeof(parsed) <> 'object'
    or (select count(*) from jsonb_object_keys(parsed)) <> 2
    or not (parsed ?& array['version','rows'])
    or jsonb_typeof(parsed -> 'version') <> 'number'
    or parsed ->> 'version' <> '1'
    or jsonb_typeof(parsed -> 'rows') <> 'array' then return null; end if;
  for row_value in select value from jsonb_array_elements(parsed -> 'rows') as rows(value) loop
    if jsonb_typeof(row_value) <> 'object'
      or (select count(*) from jsonb_object_keys(row_value)) <> 2
      or not (row_value ?& array['id','value'])
      or jsonb_typeof(row_value -> 'id') <> 'string'
      or jsonb_typeof(row_value -> 'value') <> 'string' then return null; end if;
    row_id := row_value ->> 'id';
    if not coalesce(row_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
      or row_id = any(seen_ids) then return null; end if;
    seen_ids := array_append(seen_ids, row_id);
  end loop;
  return parsed;
exception when others then
  return null;
end;
$$;

create or replace function private.validate_homework_side_by_side_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.description like '%side_by_side_response%'
    and private.homework_side_by_side_metadata(new.description) is null then
    raise exception 'Complete both Side-by-Side column headings before saving';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_homework_side_by_side_snapshot on public.homework_version_blocks;
create trigger validate_homework_side_by_side_snapshot
before insert or update on public.homework_version_blocks
for each row execute function private.validate_homework_side_by_side_snapshot();

revoke all on function private.homework_side_by_side_metadata(text) from public, anon, authenticated;
revoke all on function private.homework_side_by_side_pair_is_valid(uuid, text) from public, anon, authenticated;
revoke all on function private.homework_side_by_side_answer_column(text) from public, anon, authenticated;
revoke all on function private.validate_homework_side_by_side_snapshot() from public, anon, authenticated;

-- Keep the already-authorized persistence implementation intact behind a
-- narrow wrapper which validates paired payloads before delegating to it.
alter function public.persist_participant_homework(uuid, jsonb, text) set schema private;
revoke all on function private.persist_participant_homework(uuid, jsonb, text) from public, anon, authenticated;

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
  assigned_version_id uuid;
  progress_status public.homework_progress_status;
  pair record;
  left_text text;
  right_text text;
  left_column jsonb;
  right_column jsonb;
  left_ids text[];
  right_ids text[];
  has_complete boolean;
  has_incomplete boolean;
begin
  if target_intent is null or target_answers is null or jsonb_typeof(target_answers) <> 'object'
    or target_intent not in ('save','submit') then
    return private.persist_participant_homework(target_progress_id, target_answers, target_intent);
  end if;

  select progress.status, revision.homework_version_id into progress_status, assigned_version_id
  from public.homework_participant_progress progress
  join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
  join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
  where progress.id = target_progress_id and progress.profile_id = (select auth.uid())
    and assignment.unassigned_at is null and revision.ended_at is null
  for update of assignment, progress;
  if not found then return private.persist_participant_homework(target_progress_id, target_answers, target_intent); end if;

  for pair in
    select parsed.metadata ->> 'groupId' as group_id,
      (array_agg(block.id) filter (where parsed.metadata ->> 'side' = 'left'))[1] as left_id,
      (array_agg(block.id) filter (where parsed.metadata ->> 'side' = 'right'))[1] as right_id,
      bool_and((parsed.metadata ->> 'bothRequired')::boolean) as both_required,
      bool_and(parsed.metadata ->> 'responseMode' = 'paired_rows_v1') as row_mode
    from public.homework_version_blocks block
    cross join lateral (select private.homework_side_by_side_metadata(block.description) as metadata) parsed
    where block.homework_version_id = assigned_version_id and block.block_type = 'long_answer'
      and parsed.metadata ->> 'kind' = 'side_by_side_response'
    group by parsed.metadata ->> 'groupId'
  loop
    select case when jsonb_typeof(target_answers -> pair.left_id::text) = 'string' then target_answers ->> pair.left_id::text end
      into left_text;
    select case when jsonb_typeof(target_answers -> pair.right_id::text) = 'string' then target_answers ->> pair.right_id::text end
      into right_text;
    if left_text is null then select answer_text into left_text from public.homework_answers where participant_progress_id = target_progress_id and homework_version_block_id = pair.left_id; end if;
    if right_text is null then select answer_text into right_text from public.homework_answers where participant_progress_id = target_progress_id and homework_version_block_id = pair.right_id; end if;
    left_text := coalesce(left_text, '');
    right_text := coalesce(right_text, '');
    left_column := private.homework_side_by_side_answer_column(left_text);
    right_column := private.homework_side_by_side_answer_column(right_text);

    if pair.row_mode or left_column is not null or right_column is not null then
      if left_column is null or right_column is null then raise exception 'Side-by-Side responses are invalid'; end if;
      select coalesce(array_agg(value ->> 'id' order by ordinal), '{}'::text[]) into left_ids
        from jsonb_array_elements(left_column -> 'rows') with ordinality as entry(value, ordinal);
      select coalesce(array_agg(value ->> 'id' order by ordinal), '{}'::text[]) into right_ids
        from jsonb_array_elements(right_column -> 'rows') with ordinality as entry(value, ordinal);
      if left_ids is distinct from right_ids then raise exception 'Side-by-Side response pairs do not match'; end if;
      if target_intent = 'submit' and pair.both_required then
        select coalesce(bool_or(btrim(left_row.value ->> 'value') <> '' and btrim(right_row.value ->> 'value') <> ''), false),
          coalesce(bool_or((btrim(left_row.value ->> 'value') <> '' or btrim(right_row.value ->> 'value') <> '')
            and not (btrim(left_row.value ->> 'value') <> '' and btrim(right_row.value ->> 'value') <> '')), false)
        into has_complete, has_incomplete
        from jsonb_array_elements(left_column -> 'rows') with ordinality as left_row(value, ordinal)
        join jsonb_array_elements(right_column -> 'rows') with ordinality as right_row(value, ordinal) using (ordinal);
        if not has_complete or has_incomplete then raise exception 'Every required Side-by-Side response pair needs both meaningful answers'; end if;
      end if;
    end if;
  end loop;

  return private.persist_participant_homework(target_progress_id, target_answers, target_intent);
end;
$$;

revoke all on function public.persist_participant_homework(uuid, jsonb, text) from public, anon;
grant execute on function public.persist_participant_homework(uuid, jsonb, text) to authenticated;
