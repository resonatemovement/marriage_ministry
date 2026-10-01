-- DEV ONLY: synthetic identities, Resources, versions, Sessions, and audit events roll back.
begin;

create function pg_temp.expect_failure(command text, message_part text default null)
returns void language plpgsql as $$
declare failed boolean := false; detail text;
begin
  begin execute command;
  exception when others then
    failed := true;
    get stacked diagnostics detail = message_text;
    if message_part is not null then assert position(message_part in detail) > 0, detail; end if;
  end;
  assert failed, 'Expected failure: ' || command;
end;
$$;

do $seed$
declare actor uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); categories text[] := array['image','document','audio','video'];
  mimes text[] := array['image/png','application/pdf','audio/mpeg','video/mp4'];
  filenames text[] := array['image.png','document.pdf','audio.mp3','video.mp4'];
  ids uuid[] := '{}'::uuid[]; resource_id uuid; version_id uuid; n integer;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  values(actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'session-resource-rollback-'||actor::text||'@example.invalid','',now(),'{}','{}');
  update public.profiles set status='active',first_name='Session',last_name='Resource Rollback' where id=actor;
  insert into public.profile_roles(profile_id,role) values(actor,'author'),(actor,'admin');
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  values(viewer,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'session-resource-rollback-'||viewer::text||'@example.invalid','',now(),'{}','{}');
  update public.profiles set status='active',first_name='Author',last_name='Resource Rollback' where id=viewer;
  insert into public.profile_roles(profile_id,role) values(viewer,'author');
  for n in 1..4 loop
    resource_id := gen_random_uuid(); version_id := gen_random_uuid(); ids := array_append(ids,resource_id);
    insert into public.resources(id,title,category,created_by,updated_by)
      values(resource_id,'Rollback '||categories[n],categories[n],actor,actor);
    insert into public.resource_versions(id,resource_id,version_number,storage_path,original_filename,mime_type,size_bytes,uploaded_by)
      values(version_id,resource_id,1,resource_id::text||'/'||version_id::text||'/'||filenames[n],filenames[n],mimes[n],10,actor);
    update public.resources set current_version_id=version_id,last_version_number=1 where id=resource_id;
  end loop;
  perform set_config('session_resource.verifier',jsonb_build_object('actor',actor,'viewer',viewer,'ids',ids)::text,true);
end;
$seed$;

set local role authenticated;
do $verify$
declare ctx jsonb := current_setting('session_resource.verifier')::jsonb;
  ids uuid[] := array(select jsonb_array_elements_text(ctx->'ids')::uuid);
  categories text[] := array['image','document','audio','video'];
  payload jsonb := '[]'::jsonb; result jsonb; verifier_session_id uuid; first_id uuid; duplicate_id uuid;
  n integer;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'actor',true);
  assert private.current_user_has_role(array['author']::public.app_role[]);
  for n in 1..4 loop
    payload := payload || jsonb_build_array(jsonb_build_object('client_id','resource-'||n,
      'block_type','library_resource','resource_id',ids[n],'resource_category',categories[n]));
  end loop;
  payload := payload || jsonb_build_array(jsonb_build_object('client_id','external','block_type','video_link',
    'url','https://example.com/watch'));
  result := public.save_session_builder_state(null,'Resource rollback Session',payload,'publish');
  verifier_session_id := (result->>'session_id')::uuid;
  first_id := (result->'blocks'->0->>'id')::uuid;
  assert (select count(*) from public.session_material_blocks where session_id=verifier_session_id and block_type='library_resource')=4;
  assert (select array_agg(resource_id order by position) from public.session_material_blocks
    where session_id=verifier_session_id and block_type='library_resource')=ids;
  assert (select position from public.session_material_blocks where session_id=verifier_session_id and block_type='video_link')=4;
  for n in 0..4 loop
    payload := jsonb_set(payload,array[n::text,'id'],result->'blocks'->n->'id');
    payload := payload #- array[n::text,'client_id'];
  end loop;

  perform pg_temp.expect_failure(format('select public.save_session_builder_state(%L,%L,%L::jsonb,%L)',
    verifier_session_id,'Resource rollback Session',jsonb_build_array(jsonb_build_object('id',first_id,
      'block_type','library_resource','resource_id',ids[1],'resource_category','document'))::text,'save'),
    'category does not match');
  perform pg_temp.expect_failure(format('select public.delete_resource(%L)',ids[1]),
    'session_material_blocks_resource_id_fkey');
  assert (select current_version_id is not null from public.resources where id=ids[1]);

  perform public.set_resource_archived(ids[1],true);
  perform set_config('request.jwt.claim.sub',ctx->>'viewer',true);
  assert (select count(*) from public.resources where id=ids[1])=1, 'Archived linked Resource hidden';
  assert (select count(*) from public.resource_versions where resource_id=ids[1])=1, 'Archived current Version hidden';
  assert (select count(*) from public.resources where id=ids[1] and archived_at is null)=0, 'Archived Resource selectable';
  perform set_config('request.jwt.claim.sub',ctx->>'actor',true);
  result := public.save_session_builder_state(verifier_session_id,'Resource rollback Session',payload,'save');
  assert result->'blocks'->0->>'resource_id'=ids[1]::text, 'Archived reference did not persist';
  perform pg_temp.expect_failure(format('select public.save_session_builder_state(%L,%L,%L::jsonb,%L)',
    verifier_session_id,'Resource rollback Session',jsonb_build_array(jsonb_build_object('client_id','new-archived',
      'block_type','library_resource','resource_id',ids[1],'resource_category','image'))::text,'save'),
    'Archived Resource cannot be newly selected');

  -- Reorder uploaded resources and the external link together, and duplicate the document reference.
  payload := jsonb_build_array(payload->4,payload->2,payload->1,payload->0,payload->3);
  result := public.save_session_builder_state(verifier_session_id,'Resource rollback Session',payload,'save');
  assert result->'blocks'->0->>'block_type'='video_link';
  assert result->'blocks'->3->>'resource_id'=ids[1]::text;
  payload := jsonb_insert(payload,'{3}',jsonb_build_object('client_id','duplicate-image',
    'block_type','library_resource','resource_id',ids[2],'resource_category','document'));
  result := public.save_session_builder_state(verifier_session_id,'Resource rollback Session',payload,'save');
  duplicate_id := (result->'blocks'->3->>'id')::uuid;
  assert duplicate_id <> (result->'blocks'->2->>'id')::uuid;
  assert (select resource_id=ids[2] from public.session_material_blocks where id=duplicate_id);
  payload := payload - 3;
  perform public.save_session_builder_state(verifier_session_id,'Resource rollback Session',payload,'save');
  assert not exists(select 1 from public.session_material_blocks where id=duplicate_id);
  assert exists(select 1 from public.resources where id=ids[2]), 'Removing reference deleted library Resource';
  raise notice 'SESSION RESOURCE LIBRARY DEV VERIFIER PASS (transaction will roll back)';
end;
$verify$;
rollback;
