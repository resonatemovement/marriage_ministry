-- DEV-only rollback verifier for the exact Homework Builder RPC payload.
-- Every Auth/domain row is created inside this transaction and rolled back.
begin;

do $setup$
declare
  admin_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data)
  values (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'homework-paired-authoring-' || admin_id::text || '@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb);
  update public.profiles set status = 'active', first_name = 'Homework', last_name = 'Authoring Verifier' where id = admin_id;
  insert into public.profile_roles(profile_id, role) values (admin_id, 'super_admin');
  perform set_config('homework.paired_authoring_admin', admin_id::text, true);
end;
$setup$;

set local role authenticated;

do $verify$
declare
  admin_id uuid := current_setting('homework.paired_authoring_admin')::uuid;
  group_id uuid := gen_random_uuid();
  first_save jsonb;
  edited_save jsonb;
  published jsonb;
  session_id uuid;
  version_id uuid;
  left_snapshot uuid;
  right_snapshot uuid;
  left_logical uuid;
  right_logical uuid;
  paired_blocks jsonb;
  material jsonb := '[{"client_id":"material:verifier","block_type":"rich_text","title":"Session material","rich_text_content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Published verifier material"}]}]},"url":null,"description":null}]'::jsonb;
begin
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  assert auth.uid() = admin_id;

  -- Same two long_answer rows emitted by serializeHomeworkBlocks for a paired block.
  paired_blocks := jsonb_build_array(
    jsonb_build_object('client_id', 'side-by-side:' || group_id::text || ':left', 'block_type', 'long_answer',
      'title', 'Recognize', 'rich_text_content', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Recognize"}]}]}'::jsonb, 'url', null,
      'description', jsonb_build_object('kind','side_by_side_response','groupId',group_id::text,'side','left',
        'instructions','Reflect on your next step.','leftHeading','Recognize','rightHeading','Renounce',
        'bothRequired',true,'responseMode','paired_rows_v1')::text),
    jsonb_build_object('client_id', 'side-by-side:' || group_id::text || ':right', 'block_type', 'long_answer',
      'title', 'Renounce', 'rich_text_content', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Renounce"}]}]}'::jsonb, 'url', null,
      'description', jsonb_build_object('kind','side_by_side_response','groupId',group_id::text,'side','right',
        'instructions','Reflect on your next step.','leftHeading','Recognize','rightHeading','Renounce',
        'bothRequired',true,'responseMode','paired_rows_v1')::text)
  );

  first_save := public.save_session_homework_authoring_state(null, 'Paired Response Verifier', '[]'::jsonb,
    true, null, paired_blocks, true, false, 'save');
  session_id := (first_save -> 'session' ->> 'session_id')::uuid;
  version_id := (first_save -> 'homework' ->> 'version_id')::uuid;
  assert jsonb_array_length(first_save -> 'homework' -> 'blocks') = 2, 'Save returns both paired response columns';
  left_snapshot := (first_save -> 'homework' -> 'blocks' -> 0 ->> 'id')::uuid;
  right_snapshot := (first_save -> 'homework' -> 'blocks' -> 1 ->> 'id')::uuid;
  left_logical := (first_save -> 'homework' -> 'blocks' -> 0 ->> 'homework_block_id')::uuid;
  right_logical := (first_save -> 'homework' -> 'blocks' -> 1 ->> 'homework_block_id')::uuid;
  assert left_snapshot <> right_snapshot and left_logical <> right_logical, 'Paired columns get independent stable identities';
  assert ((first_save -> 'homework' -> 'blocks' -> 0 ->> 'description')::jsonb ->> 'leftHeading') = 'Recognize', 'Left paired metadata is returned';
  assert ((first_save -> 'homework' -> 'blocks' -> 1 ->> 'description')::jsonb ->> 'rightHeading') = 'Renounce', 'Right paired metadata is returned';

  -- The user reopens, edits, saves, and the published snapshot keeps the paired metadata.
  paired_blocks := jsonb_build_array(
    jsonb_build_object('id',left_snapshot,'homework_block_id',left_logical,'block_type','long_answer',
      'title','Recognize','rich_text_content','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Recognize"}]}]}'::jsonb,'url',null,
      'description',jsonb_build_object('kind','side_by_side_response','groupId',group_id::text,'side','left',
        'instructions','Updated instructions.','leftHeading','Recognize','rightHeading','Renounce','bothRequired',true,'responseMode','paired_rows_v1')::text),
    jsonb_build_object('id',right_snapshot,'homework_block_id',right_logical,'block_type','long_answer',
      'title','Renounce','rich_text_content','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Renounce"}]}]}'::jsonb,'url',null,
      'description',jsonb_build_object('kind','side_by_side_response','groupId',group_id::text,'side','right',
        'instructions','Updated instructions.','leftHeading','Recognize','rightHeading','Renounce','bothRequired',true,'responseMode','paired_rows_v1')::text)
  );
  edited_save := public.save_session_homework_authoring_state(session_id, 'Paired Response Verifier', '[]'::jsonb,
    false, version_id, paired_blocks, true, false, 'save');
  assert (edited_save -> 'homework' ->> 'version_id')::uuid = version_id, 'Draft reload/edit/save preserves its version';
  assert (edited_save -> 'homework' -> 'blocks' -> 0 ->> 'id')::uuid = left_snapshot
    and (edited_save -> 'homework' -> 'blocks' -> 1 ->> 'id')::uuid = right_snapshot, 'Edit preserves stable snapshot identities';
  assert (edited_save -> 'homework' -> 'blocks' -> 0 ->> 'homework_block_id')::uuid = left_logical
    and (edited_save -> 'homework' -> 'blocks' -> 1 ->> 'homework_block_id')::uuid = right_logical, 'Edit preserves stable logical identities';

  published := public.save_session_homework_authoring_state(session_id, 'Paired Response Verifier', material,
    true, version_id, paired_blocks, true, true, 'publish');
  assert (published -> 'session' ->> 'status') = 'published', 'Session publish succeeds with paired Homework';
  assert (published -> 'homework' ->> 'status') = 'published', 'Paired Homework publish succeeds';
  assert jsonb_array_length(published -> 'homework' -> 'blocks') = 2, 'Published snapshot retains both columns';
  assert ((published -> 'homework' -> 'blocks' -> 0 ->> 'description')::jsonb ->> 'responseMode') = 'paired_rows_v1', 'Published paired metadata is preserved';
end;
$verify$;

rollback;
