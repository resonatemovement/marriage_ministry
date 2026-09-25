-- DEV-only integration verifier. All fixtures are rolled back.
begin;

do $setup$
declare
  author_id uuid := gen_random_uuid();
  couple_id uuid := gen_random_uuid();
  user_id uuid;
begin
  foreach user_id in array array[author_id, couple_id] loop
    insert into auth.users
      (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data)
    values
      (user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'session-save-verifier-' || user_id::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);
    update public.profiles set status = 'active', first_name = 'Session', last_name = 'Rollback Verifier'
    where id = user_id;
  end loop;
  insert into public.profile_roles(profile_id, role)
  values (author_id, 'author'), (couple_id, 'couple');
  perform set_config('session_builder.verifier_author', author_id::text, true);
  perform set_config('session_builder.verifier_couple', couple_id::text, true);
end;
$setup$;

set local role authenticated;

do $verify$
declare
  author_id uuid := current_setting('session_builder.verifier_author')::uuid;
  couple_id uuid := current_setting('session_builder.verifier_couple')::uuid;
  rich jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Original lesson"}]}]}'::jsonb;
  edited_rich jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Updated lesson"}]}]}'::jsonb;
  empty_rich jsonb := '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb;
  result jsonb;
  title_only_id uuid;
  draft_id uuid;
  published_id uuid;
  rich_id uuid;
  video_id uuid;
  new_video_id uuid;
  before_count integer;
  error_text text;
begin
  perform set_config('request.jwt.claim.sub', author_id::text, true);
  assert auth.uid() = author_id and private.current_user_has_role(array['author']::public.app_role[]),
    'Author fixture is not authenticated';

  -- A: A title-only Draft is a complete, valid save.
  result := public.save_session_builder_state(null, 'Verifier title only Draft', '[]'::jsonb, 'save');
  title_only_id := (result ->> 'session_id')::uuid;
  assert result ->> 'status' = 'draft' and result -> 'blocks' = '[]'::jsonb,
    'Title-only Draft result is invalid';
  assert (select count(*) from public.sessions where id = title_only_id and status = 'draft') = 1,
    'Title-only Draft was not persisted';
  assert (select count(*) from public.session_material_blocks where session_id = title_only_id) = 0,
    'Title-only Draft unexpectedly has material';

  -- B: New Draft material is saved in submitted order with client ID mapping.
  result := public.save_session_builder_state(null, 'Verifier material Draft', jsonb_build_array(
    jsonb_build_object('client_id', 'rich-temp', 'block_type', 'rich_text',
      'title', 'Lesson', 'rich_text_content', rich),
    jsonb_build_object('client_id', 'video-temp', 'block_type', 'video_link',
      'url', 'https://example.com/video', 'description', 'Watch together')
  ), 'save');
  draft_id := (result ->> 'session_id')::uuid;
  rich_id := (result -> 'blocks' -> 0 ->> 'id')::uuid;
  video_id := (result -> 'blocks' -> 1 ->> 'id')::uuid;
  assert result -> 'blocks' -> 0 ->> 'client_id' = 'rich-temp'
    and result -> 'blocks' -> 1 ->> 'client_id' = 'video-temp',
    'New block client IDs were not returned';
  assert (select count(*) from public.session_material_blocks where session_id = draft_id) = 2,
    'New Draft material was not persisted';
  assert (select position from public.session_material_blocks where id = rich_id) = 0
    and (select position from public.session_material_blocks where id = video_id) = 1,
    'New Draft material order was not persisted';

  -- C: Direct publish creates a new Published Session without a prior Draft save.
  result := public.save_session_builder_state(null, 'Verifier direct Publish', jsonb_build_array(
    jsonb_build_object('client_id', 'direct-video', 'block_type', 'video_link',
      'url', 'https://example.com/direct')
  ), 'publish');
  published_id := (result ->> 'session_id')::uuid;
  assert result ->> 'status' = 'published', 'Direct Publish result is not Published';
  assert (select count(*) from public.sessions
          where id = published_id and status = 'published' and published_at is not null) = 1,
    'Direct Publish did not persist a Published Session';

  -- D: Invalid direct Publish leaves no Session or material behind.
  select count(*) into before_count from public.sessions;
  begin
    perform public.save_session_builder_state(null, 'Verifier invalid direct Publish', '[]'::jsonb, 'publish');
    raise exception 'Expected empty Publish to fail';
  exception when others then
    get stacked diagnostics error_text = message_text;
    if error_text <> 'Add at least one Session Material block before publishing' then raise; end if;
  end;
  begin
    perform public.save_session_builder_state(null, 'Verifier invalid URL Publish', jsonb_build_array(
      jsonb_build_object('client_id', 'bad-video', 'block_type', 'video_link', 'url', 'ftp://example.com')
    ), 'publish');
    raise exception 'Expected invalid URL Publish to fail';
  exception when others then
    get stacked diagnostics error_text = message_text;
    if error_text <> 'Enter a valid http or https URL for the Video / Link block' then raise; end if;
  end;
  assert (select count(*) from public.sessions) = before_count,
    'Invalid direct Publish left a Session behind';

  -- E: Existing Draft Save updates title, content, and order while retaining IDs.
  result := public.save_session_builder_state(draft_id, 'Verifier reordered Draft', jsonb_build_array(
    jsonb_build_object('id', video_id, 'block_type', 'video_link', 'url', 'https://example.com/video'),
    jsonb_build_object('id', rich_id, 'block_type', 'rich_text',
      'title', 'Updated lesson', 'rich_text_content', edited_rich)
  ), 'save');
  assert result ->> 'status' = 'draft' and result -> 'blocks' -> 0 ->> 'id' = video_id::text
    and result -> 'blocks' -> 1 ->> 'id' = rich_id::text,
    'Existing Draft Save lost status, block IDs, or order';
  assert (select title from public.sessions where id = draft_id) = 'Verifier reordered Draft',
    'Existing Draft title was not updated';
  assert (select position from public.session_material_blocks where id = video_id) = 0
    and (select position from public.session_material_blocks where id = rich_id) = 1,
    'Existing Draft order was not updated';

  -- H: Reconcile removes omitted material and adds a new DB block in place.
  result := public.save_session_builder_state(draft_id, 'Verifier reconciled Draft', jsonb_build_array(
    jsonb_build_object('id', rich_id, 'block_type', 'rich_text',
      'title', 'Updated lesson', 'rich_text_content', edited_rich),
    jsonb_build_object('client_id', 'replacement-video', 'block_type', 'video_link',
      'url', 'https://example.com/replacement')
  ), 'save');
  new_video_id := (result -> 'blocks' -> 1 ->> 'id')::uuid;
  assert new_video_id <> video_id and result -> 'blocks' -> 1 ->> 'client_id' = 'replacement-video',
    'New replacement block was not mapped to a new DB ID';
  assert (select count(*) from public.session_material_blocks where id = video_id) = 0
    and (select count(*) from public.session_material_blocks where id = rich_id and session_id = draft_id) = 1,
    'Reconciliation did not delete the omitted block or retain existing identity';

  -- I: A block from another Session cannot be reparented.
  begin
    perform public.save_session_builder_state(title_only_id, 'Verifier cross-Session attack', jsonb_build_array(
      jsonb_build_object('id', rich_id, 'block_type', 'rich_text', 'rich_text_content', edited_rich)
    ), 'save');
    raise exception 'Expected cross-Session block ID to fail';
  exception when others then
    get stacked diagnostics error_text = message_text;
    if error_text <> 'Session Material block does not belong to this Session' then raise; end if;
  end;
  assert (select title from public.sessions where id = title_only_id) = 'Verifier title only Draft',
    'Cross-Session failure changed another Session';

  -- F: Publish an existing Draft together with pending title/material edits.
  result := public.save_session_builder_state(draft_id, 'Verifier Draft published with edits', jsonb_build_array(
    jsonb_build_object('id', rich_id, 'block_type', 'rich_text',
      'title', 'Published lesson', 'rich_text_content', edited_rich),
    jsonb_build_object('id', new_video_id, 'block_type', 'video_link',
      'url', 'https://example.com/published')
  ), 'publish');
  assert result ->> 'status' = 'published', 'Existing Draft Publish did not return Published';
  assert (select count(*) from public.sessions where id = draft_id
          and status = 'published' and title = 'Verifier Draft published with edits'
          and published_at is not null) = 1,
    'Existing Draft Publish did not atomically persist title and status';
  assert (select url from public.session_material_blocks where id = new_video_id) = 'https://example.com/published',
    'Existing Draft Publish did not persist staged material';

  -- G: Published Save retains status while updating the whole document.
  result := public.save_session_builder_state(draft_id, 'Verifier Published edited', jsonb_build_array(
    jsonb_build_object('id', new_video_id, 'block_type', 'video_link',
      'url', 'https://example.com/published-edited')
  ), 'save');
  assert result ->> 'status' = 'published'
    and (select status from public.sessions where id = draft_id) = 'published',
    'Published Save changed lifecycle status';
  assert (select count(*) from public.session_material_blocks where id = rich_id) = 0
    and (select position from public.session_material_blocks where id = new_video_id) = 0,
    'Published Save did not reconcile material';

  -- J: Invalid staged content cannot change a Published title or material.
  begin
    perform public.save_session_builder_state(draft_id, 'Verifier should roll back', jsonb_build_array(
      jsonb_build_object('id', new_video_id, 'block_type', 'video_link',
        'url', 'https://example.com/attempted'),
      jsonb_build_object('client_id', 'invalid-rich', 'block_type', 'rich_text',
        'rich_text_content', empty_rich)
    ), 'save');
    raise exception 'Expected invalid Published material to fail';
  exception when others then
    get stacked diagnostics error_text = message_text;
    if error_text <> 'Rich Text material cannot be empty' then raise; end if;
  end;
  assert (select title from public.sessions where id = draft_id) = 'Verifier Published edited'
    and (select url from public.session_material_blocks where id = new_video_id) = 'https://example.com/published-edited',
    'Failed Published Save changed persisted data';

  -- Internal role check rejects a nonauthor even when the function is executable.
  perform set_config('request.jwt.claim.sub', couple_id::text, true);
  begin
    perform public.save_session_builder_state(title_only_id, 'Unauthorized change', '[]'::jsonb, 'save');
    raise exception 'Expected unauthorized save to fail';
  exception when others then
    get stacked diagnostics error_text = message_text;
    if error_text <> 'Not authorized' then raise; end if;
  end;

  raise notice 'Session Builder transactional verifier passed: A through J and role authorization';
end;
$verify$;

rollback;
