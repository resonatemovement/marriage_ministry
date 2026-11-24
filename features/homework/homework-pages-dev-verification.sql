-- Rollback-only verification for versioned Homework pages. Run only after the
-- unapplied pages migration has been reviewed and separately approved for DEV.
begin;

-- Snapshot only non-answer content fingerprints before synthetic work. These
-- temporary tables roll back with the verification transaction.
create temp table homework_pages_baseline_versions on commit drop as
select id, md5(to_jsonb(v)::text) as fingerprint from public.homework_versions v;
create temp table homework_pages_baseline_blocks on commit drop as
select id, md5(to_jsonb(b)::text) as fingerprint from public.homework_version_blocks b;
create temp table homework_pages_baseline_revisions on commit drop as
select id, md5(to_jsonb(r)::text) as fingerprint from public.homework_assignment_revisions r;
create temp table homework_pages_baseline_progress on commit drop as
select id, md5(to_jsonb(p)::text) as fingerprint from public.homework_participant_progress p;
create temp table homework_pages_baseline_answers on commit drop as
select id, md5(to_jsonb(a)::text) as fingerprint from public.homework_answers a;

do $setup$
declare
  admin_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data)
  values (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'homework-pages-admin-' || admin_id::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);
  update public.profiles set status = 'active', first_name = 'Homework', last_name = 'Pages Admin' where id = admin_id;
  insert into public.profile_roles(profile_id, role) values (admin_id, 'super_admin');
  perform set_config('homework.pages_ctx', jsonb_build_object('admin', admin_id)::text, true);
end;
$setup$;

set local role authenticated;

do $verify$
declare
  admin_id uuid := (current_setting('homework.pages_ctx')::jsonb ->> 'admin')::uuid;
  page_one uuid := 'f38e5b5a-5e88-40f7-aef4-86ed8c726a21';
  page_two uuid := '9c18d3c1-224d-4a08-b4a0-c75f50cbf8d1';
  session_id uuid;
  draft_id uuid;
  published_id uuid;
  legacy_session_id uuid;
  legacy_version_id uuid;
  legacy_page_id uuid := '9fd08e65-ded6-48b6-8755-0b76bd02afab';
  legacy_block jsonb;
  legacy_blocks jsonb;
  result jsonb;
  manifest jsonb;
  material jsonb := '[{"client_id":"material:welcome","block_type":"rich_text","title":"Welcome","rich_text_content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Session overview"}]}]},"url":null,"description":null}]'::jsonb;
  first_block jsonb;
  second_block jsonb;
  blocks jsonb;
begin
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  assert auth.uid() = admin_id, 'Synthetic Admin JWT was not established';
  manifest := jsonb_build_array(
    jsonb_build_object('id',page_one,'title','','position',0),
    jsonb_build_object('id',page_two,'title','Second page','position',1));
  result := public.save_session_homework_authoring_state_with_pages(
    null, 'Homework Pages Draft', '[]'::jsonb, true, null, '[]'::jsonb, true, false, 'save', true, manifest, '{}'::uuid[], null);
  session_id := (result #>> '{session,session_id}')::uuid;
  draft_id := (result #>> '{homework,version_id}')::uuid;
  assert (result #>> '{session,is_final}')::boolean, 'Session final designation was not returned';
  assert (select is_final from public.sessions where id = session_id), 'Session final designation was not persisted';
  assert (select status = 'draft' from public.homework_versions where id = draft_id), 'Save Draft must persist incomplete pages';
  assert (select page_manifest = manifest from public.homework_versions where id = draft_id), 'Page manifest was not saved';

  first_block := jsonb_build_object('client_id','block:first','block_type','rich_text','title','Reading',
    'rich_text_content','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Read this"}]}]}'::jsonb,
    'url',null,'description',null,'page_id',page_one);
  blocks := jsonb_build_array(first_block);
  manifest := jsonb_build_array(
    jsonb_build_object('id',page_one,'title','Reflection','position',0),
    jsonb_build_object('id',page_two,'title','Second page','position',1));
  result := public.save_session_homework_authoring_state_with_pages(
    session_id, 'Homework Pages Draft', '[]'::jsonb, false, draft_id, blocks, true, false, 'save', false, manifest, '{}'::uuid[], null);
  assert (select count(*) = 1 from public.homework_version_blocks where homework_version_id = draft_id and page_id = page_one), 'Block placement was not saved';
  first_block := jsonb_set((result #> '{homework,blocks,0}') - 'position', '{page_id}', to_jsonb(page_one), true);

  begin
    perform public.publish_homework_version(draft_id);
    raise exception 'Expected publish rejection for an empty page';
  exception when others then
    assert sqlerrm = 'Each Homework page must contain at least one content block', format('Unexpected empty-page publish error: %s', sqlerrm);
  end;

  begin
    perform public.save_session_homework_authoring_state_with_pages(
      session_id, 'Homework Pages Draft', '[]'::jsonb, false, draft_id,
      jsonb_build_array(jsonb_set(first_block, '{page_id}', to_jsonb(page_two), true)), true, false, 'save', false,
      jsonb_build_array(jsonb_build_object('id',page_two,'title','Second page','position',0)), array[page_one], null);
    raise exception 'Expected page deletion to require exact confirmation';
  exception when others then
    assert sqlerrm = 'Homework page deletion confirmation is required', format('Unexpected page deletion error: %s', sqlerrm);
  end;
  result := public.save_session_homework_authoring_state_with_pages(
    session_id, 'Homework Pages Draft', '[]'::jsonb, false, draft_id,
    jsonb_build_array(jsonb_set(first_block, '{page_id}', to_jsonb(page_two), true)), true, false, 'save', false,
    jsonb_build_array(jsonb_build_object('id',page_two,'title','Second page','position',0)), array[page_one], 'DELETE');
  assert (select jsonb_array_length(page_manifest) = 1 from public.homework_versions where id = draft_id), 'Confirmed page deletion did not persist';
  assert (select count(*) = 1 from public.homework_version_blocks where homework_version_id = draft_id and page_id = page_two and homework_block_id = (first_block ->> 'homework_block_id')::uuid), 'Moving a block while deleting its page changed its identity';

  second_block := jsonb_build_object('client_id','block:second','block_type','long_answer','title','Question',
    'rich_text_content','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"What will you practice?"}]}]}'::jsonb,
    'url',null,'description',null,'page_id',page_one);
  blocks := jsonb_build_array(jsonb_set(first_block, '{page_id}', to_jsonb(page_two), true), second_block);
  manifest := jsonb_build_array(
    jsonb_build_object('id',page_two,'title','Practice renamed','position',0),
    jsonb_build_object('id',page_one,'title','Reflection','position',1));
  result := public.save_session_homework_authoring_state_with_pages(
    session_id, 'Homework Pages Published', material, true, draft_id, blocks, true, true, 'publish', false, manifest, '{}'::uuid[], null);
  published_id := (result #>> '{homework,version_id}')::uuid;
  assert (result #>> '{homework,status}') = 'published', 'Valid multi-page Homework did not publish';
  assert (select count(distinct page_id) = 2 from public.homework_version_blocks where homework_version_id = published_id), 'Published pages lost block assignments';
  assert (select page_manifest = manifest from public.homework_versions where id = published_id), 'Published page order or titles changed';

  result := public.save_session_homework_authoring_state_with_pages(
    session_id, 'Homework Pages Published', '[]'::jsonb, false, published_id, blocks,
    true, false, 'save', false, manifest, '{}'::uuid[], null);
  assert (result #>> '{homework,version_id}')::uuid <> published_id, 'Editing a published version must create a draft';
  assert (select status = 'published' from public.homework_versions where id = published_id), 'Published version was modified by editing';
  assert (select status = 'draft' and page_manifest = manifest from public.homework_versions where id = (result #>> '{homework,version_id}')::uuid), 'Published page metadata was not cloned into a draft';
  assert (select count(*) = 2 and count(distinct page_id) = 2 and count(distinct homework_block_id) = 2
    from public.homework_version_blocks where homework_version_id = (result #>> '{homework,version_id}')::uuid), 'Published block identities and page placements were not cloned';
  perform set_config('homework.pages_ctx', jsonb_build_object('published', published_id)::text, true);

  legacy_block := jsonb_build_object('client_id','legacy:block','block_type','long_answer','title','Legacy prompt',
    'rich_text_content','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Legacy response prompt"}]}]}'::jsonb,
    'url',null,'description',null);
  result := public.save_session_homework_authoring_state(
    null, 'Legacy Homework', '[]'::jsonb, true, null, jsonb_build_array(legacy_block), true, false, 'save');
  legacy_session_id := (result #>> '{session,session_id}')::uuid;
  legacy_version_id := (result #>> '{homework,version_id}')::uuid;
  legacy_blocks := result #> '{homework,blocks}';
  legacy_block := jsonb_set((legacy_blocks -> 0) - 'position', '{page_id}', to_jsonb(legacy_page_id), true);
  result := public.save_session_homework_authoring_state_with_pages(
    legacy_session_id, 'Legacy Homework', '[]'::jsonb, false, legacy_version_id,
    jsonb_build_array(legacy_block), true, false, 'save', false,
    jsonb_build_array(jsonb_build_object('id',legacy_page_id,'title','Converted legacy page','position',0)), '{}'::uuid[], null);
  assert (select page_manifest -> 0 ->> 'title' = 'Converted legacy page' from public.homework_versions where id = legacy_version_id), 'Legacy single-page conversion was rejected or lost its title';
  assert (select count(*) = 1 from public.homework_version_blocks where homework_version_id = legacy_version_id and page_id = legacy_page_id and homework_block_id = (legacy_block ->> 'homework_block_id')::uuid), 'Legacy conversion failed to preserve its block identity';
end;
$verify$;

reset role;

do $published_guards$
declare
  published_version_id uuid := (current_setting('homework.pages_ctx')::jsonb ->> 'published')::uuid;
begin
  begin
    update public.homework_versions set version_number = coalesce(version_number, 0) + 1000 where id = published_version_id;
    raise exception 'Published version update unexpectedly succeeded';
  exception when others then
    assert sqlerrm = 'Published Homework versions are immutable', format('Unexpected published version guard error: %s', sqlerrm);
  end;
  begin
    update public.homework_version_blocks set position = position + 1000 where homework_version_id = published_version_id;
    raise exception 'Published block update unexpectedly succeeded';
  exception when others then
    assert sqlerrm = 'Published Homework versions are immutable', format('Unexpected published block guard error: %s', sqlerrm);
  end;
  begin
    delete from public.homework_version_blocks where homework_version_id = published_version_id;
    raise exception 'Published block deletion unexpectedly succeeded';
  exception when others then
    assert sqlerrm = 'Published Homework versions are immutable', format('Unexpected published block deletion guard error: %s', sqlerrm);
  end;
end;
$published_guards$;

do $preservation$
begin
  assert not exists (
    select 1 from homework_pages_baseline_versions before_row
    left join public.homework_versions current_row using (id)
    where current_row.id is null or md5(to_jsonb(current_row)::text) <> before_row.fingerprint
       or current_row.page_manifest is not null
  ), 'An existing Homework version was rewritten or backfilled';
  assert not exists (
    select 1 from homework_pages_baseline_blocks before_row
    left join public.homework_version_blocks current_row using (id)
    where current_row.id is null or md5(to_jsonb(current_row)::text) <> before_row.fingerprint
       or current_row.page_id is not null
  ), 'An existing Homework block was rewritten or assigned to a new page';
  assert not exists (
    select 1 from homework_pages_baseline_revisions before_row
    left join public.homework_assignment_revisions current_row using (id)
    where current_row.id is null or md5(to_jsonb(current_row)::text) <> before_row.fingerprint
  ), 'An existing Homework assignment revision changed';
  assert not exists (
    select 1 from homework_pages_baseline_progress before_row
    left join public.homework_participant_progress current_row using (id)
    where current_row.id is null or md5(to_jsonb(current_row)::text) <> before_row.fingerprint
  ), 'An existing Homework submission status changed';
  assert not exists (
    select 1 from homework_pages_baseline_answers before_row
    left join public.homework_answers current_row using (id)
    where current_row.id is null or md5(to_jsonb(current_row)::text) <> before_row.fingerprint
  ), 'An existing Homework answer changed';
end;
$preservation$;

rollback;
