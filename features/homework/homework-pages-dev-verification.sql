-- Rollback-only verification for versioned Homework pages. Run only after the
-- unapplied pages migration has been reviewed and separately approved for DEV.
begin;

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

  begin
    perform public.publish_homework_version(draft_id);
    raise exception 'Expected publish rejection for an empty page';
  exception when others then
    assert sqlerrm = 'Each Homework page must contain at least one content block', 'Unexpected empty-page publish error: %', sqlerrm;
  end;

  begin
    perform public.save_session_homework_authoring_state_with_pages(
      session_id, 'Homework Pages Draft', '[]'::jsonb, false, draft_id, blocks, true, false, 'save', false,
      jsonb_build_array(jsonb_build_object('id',page_one,'title','Reflection','position',0)), '{}'::uuid[], null);
    raise exception 'Expected page deletion to require exact confirmation';
  exception when others then
    assert sqlerrm = 'Homework page deletion confirmation is required', 'Unexpected page deletion error: %', sqlerrm;
  end;
  result := public.save_session_homework_authoring_state_with_pages(
    session_id, 'Homework Pages Draft', '[]'::jsonb, false, draft_id, blocks, true, false, 'save', false,
    jsonb_build_array(jsonb_build_object('id',page_one,'title','Reflection','position',0)), array[page_two], 'DELETE');
  assert (select jsonb_array_length(page_manifest) = 1 from public.homework_versions where id = draft_id), 'Confirmed page deletion did not persist';

  second_block := jsonb_build_object('client_id','block:second','block_type','long_answer','title','Question',
    'rich_text_content','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"What will you practice?"}]}]}'::jsonb,
    'url',null,'description',null,'page_id',page_two);
  blocks := jsonb_build_array(first_block, second_block);
  manifest := jsonb_build_array(
    jsonb_build_object('id',page_one,'title','Reflection','position',0),
    jsonb_build_object('id',page_two,'title','Practice','position',1));
  result := public.save_session_homework_authoring_state_with_pages(
    session_id, 'Homework Pages Published', material, true, draft_id, blocks, true, true, 'publish', false, manifest, '{}'::uuid[], null);
  published_id := (result #>> '{homework,version_id}')::uuid;
  assert (result #>> '{homework,status}') = 'published', 'Valid multi-page Homework did not publish';
  assert (select count(distinct page_id) = 2 from public.homework_version_blocks where homework_version_id = published_id), 'Published pages lost block assignments';
  assert (select page_manifest = manifest from public.homework_versions where id = published_id), 'Published page order or titles changed';

  result := public.save_session_homework_authoring_state_with_pages(
    session_id, 'Homework Pages Published', '[]'::jsonb, false, published_id, blocks, true, false, 'save', false, manifest, '{}'::uuid[], null);
  assert (result #>> '{homework,version_id}')::uuid <> published_id, 'Editing a published version must create a draft';
  assert (select status = 'published' from public.homework_versions where id = published_id), 'Published version was modified by editing';
end;
$verify$;

rollback;
