-- DEV ONLY. SQL integration tests use synthetic Storage metadata, NOT actual binaries.
-- Every auth/profile/resource/object/audit/outbox/reference fixture rolls back.
begin;

create function pg_temp.expect_rejected(command text, expected_message text default null)
returns void language plpgsql as $$
declare rejected boolean := false; message text;
begin
  begin execute command;
  exception when others then
    rejected := true; get stacked diagnostics message = message_text;
    if expected_message is not null then assert position(expected_message in message)>0, message; end if;
  end;
  assert rejected, 'Expected rejection: ' || command;
end;
$$;
create function pg_temp.seed_object(upload_id uuid, mismatch boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare u public.resource_uploads%rowtype;
begin
  select * into strict u from public.resource_uploads where id=upload_id;
  insert into storage.objects(bucket_id,name,metadata)
  values('resource-library',u.storage_path,jsonb_build_object('size',case when mismatch then u.size_bytes+1 else u.size_bytes end,'mimetype',u.mime_type));
end;
$$;
-- A real restrictive FK shape, present ONLY inside this rolled-back verifier.
create table public._resource_library_verifier_reference (
  resource_id uuid references public.resources(id) on delete restrict,
  version_id uuid references public.resource_versions(id) on delete restrict
);

do $setup$
declare ids uuid[] := array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; i integer;
begin
  for i in 1..5 loop
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
    values(ids[i],'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
      'resource-rollback-'||ids[i]::text||'@example.invalid','',now(),'{}','{}');
    update public.profiles set status='active',first_name='Resource',last_name='Rollback '||i where id=ids[i];
    insert into public.profile_roles(profile_id,role)
    values(ids[i],case i when 1 then 'admin'::public.app_role when 2 then 'author'::public.app_role
      when 3 then 'author'::public.app_role when 4 then 'coach'::public.app_role else 'super_admin'::public.app_role end);
  end loop;
  perform set_config('resource.verifier',jsonb_build_object('admin',ids[1],'author',ids[2],'other',ids[3],'denied',ids[4],'super',ids[5])::text,true);
end;
$setup$;

set local role authenticated;
do $author$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb; u public.resource_uploads%rowtype;
  v public.resource_versions%rowtype; failed public.resource_uploads%rowtype; n integer;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'author',true);
  assert private.current_user_has_role(array['author']::public.app_role[]);
  u:=public.prepare_resource_upload(null,'Rollback Resource',null,'document','application/pdf',10,'original.pdf','original.pdf');
  assert (select count(*) from public.resources where id=u.resource_id)=0, 'Pending resource exposed';
  perform pg_temp.expect_rejected(format('select public.finalize_resource_upload(%L)',u.id),'missing or mismatched');
  perform pg_temp.seed_object(u.id);
  v:=public.finalize_resource_upload(u.id);
  assert v.version_number=1 and v.resource_id=u.resource_id;
  assert (select current_version_id=v.id from public.resources where id=v.resource_id);
  assert (select count(*) from storage.objects where bucket_id='resource-library' and name=v.storage_path)=1;
  assert (public.finalize_resource_upload(u.id)).id=v.id, 'Finalize retry not idempotent';
  perform public.cancel_resource_upload(u.id); -- finalized version must never be enqueued
  perform public.update_resource_metadata(v.resource_id,'Own metadata','Description');
  perform pg_temp.expect_rejected(format('update public.resources set title=''bypass'' where id=%L',v.resource_id));
  perform pg_temp.expect_rejected(format('delete from public.resource_versions where id=%L',v.id));
  perform pg_temp.expect_rejected('insert into storage.objects(bucket_id,name,metadata) values(''resource-library'',''unrestricted/path'',''{"size":10,"mimetype":"application/pdf"}''::jsonb)');
  update storage.objects set metadata='{}'::jsonb where bucket_id='resource-library' and name=v.storage_path;
  perform pg_temp.expect_rejected(format('delete from storage.objects where bucket_id=''resource-library'' and name=%L',v.storage_path));
  -- UPDATE/DELETE RLS may silently affect zero rows; prove the immutable object remains intact.
  assert (select metadata->>'mimetype'='application/pdf' from storage.objects where bucket_id='resource-library' and name=v.storage_path);
  perform pg_temp.expect_rejected(format('select public.set_resource_archived(%L,true)',v.resource_id),'Not authorized');
  perform pg_temp.expect_rejected(format('select public.delete_resource(%L)',v.resource_id),'Not authorized');
  perform pg_temp.expect_rejected('select public.prepare_resource_upload(null,''Invalid'',null,''image'',''application/pdf'',10,''x.png'',''x.png'')','Invalid Resource upload');
  perform pg_temp.expect_rejected('select public.prepare_resource_upload(null,''Invalid'',null,''invalid'',''application/pdf'',10,''x.pdf'',''x.pdf'')','Invalid Resource upload');
  perform pg_temp.expect_rejected('select public.prepare_resource_upload(null,''Large'',null,''image'',''image/png'',15728641,''x.png'',''x.png'')','Invalid Resource upload');
  perform pg_temp.expect_rejected(format('select public.prune_resource_versions(%L,0)',v.resource_id));
  failed:=public.prepare_resource_upload(v.resource_id,null,null,'document','application/pdf',10,'failed.pdf','failed.pdf');
  perform pg_temp.seed_object(failed.id,true);
  perform pg_temp.expect_rejected(format('select public.finalize_resource_upload(%L)',failed.id),'missing or mismatched');
  assert (select current_version_id=v.id from public.resources where id=v.resource_id), 'Failed replacement changed current';
  perform public.cancel_resource_upload(failed.id);
  for n in 2..6 loop
    u:=public.prepare_resource_upload(v.resource_id,null,null,'document','application/pdf',10,'replacement.pdf','replacement.pdf');
    perform pg_temp.seed_object(u.id);
    v:=public.finalize_resource_upload(u.id);
    assert v.version_number=n and v.resource_id=u.resource_id;
  end loop;
  ctx:=ctx||jsonb_build_object('resource',v.resource_id,'current',v.id);
  perform set_config('resource.verifier',ctx::text,true);
end;
$author$;

do $other_author$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'other',true);
  assert (select count(*) from public.resources where id=(ctx->>'resource')::uuid)=1, 'Author browse active failed';
  perform pg_temp.expect_rejected(format('select public.update_resource_metadata(%L,''Other'',null)',ctx->>'resource'),'Not authorized');
  perform pg_temp.expect_rejected(format('select public.prepare_resource_upload(%L,null,null,''document'',''application/pdf'',10,''other.pdf'',''other.pdf'')',ctx->>'resource'),'Not authorized');
  perform pg_temp.expect_rejected(format('select public.finalize_resource_upload(%L)',ctx->>'current'),'Not authorized');
  perform set_config('request.jwt.claim.sub',ctx->>'denied',true);
  assert (select count(*) from public.resources where id=(ctx->>'resource')::uuid)=0;
  assert (select count(*) from public.resource_versions where resource_id=(ctx->>'resource')::uuid)=0;
  assert (select count(*) from storage.objects where bucket_id='resource-library')=0;
  perform pg_temp.expect_rejected('select public.prepare_resource_upload(null,''Denied'',null,''document'',''application/pdf'',10,''x.pdf'',''x.pdf'')','Not authorized');
end;
$other_author$;

reset role;
do $integrity$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb; v public.resource_versions%rowtype; unrelated uuid; duplicate_id uuid:=gen_random_uuid();
begin
  select * into v from public.resource_versions where resource_id=(ctx->>'resource')::uuid and version_number=1;
  assert not exists(select 1 from public.resource_storage_cleanup where storage_path=v.storage_path), 'Finalized cancellation queued binary';
  perform pg_temp.expect_rejected(format('update public.resource_versions set original_filename=''changed.pdf'' where id=%L',v.id),'immutable');
  perform pg_temp.expect_rejected(format('insert into public.resource_versions(id,resource_id,version_number,storage_path,original_filename,mime_type,size_bytes,uploaded_by) values(%L,%L,1,%L,''x.pdf'',''application/pdf'',10,%L)',duplicate_id,v.resource_id,v.resource_id::text||'/'||duplicate_id::text||'/x.pdf',v.uploaded_by),'resource_versions_resource_id_version_number_key');
  insert into public.resources(title,category,created_by,updated_by) values('Other','document',v.uploaded_by,v.uploaded_by) returning id into unrelated;
  perform pg_temp.expect_rejected(format('update public.resources set current_version_id=%L where id=%L',v.id,unrelated),'resources_current_version_fk');
  perform pg_temp.expect_rejected(format('insert into public.resources(title,category,created_by,updated_by) values(''Invalid'',''bogus'',%L,%L)',v.uploaded_by,v.uploaded_by));
  insert into public._resource_library_verifier_reference(version_id) values(v.id);
  ctx:=ctx||jsonb_build_object('pinned',v.id,'unrelated',unrelated);
  perform set_config('resource.verifier',ctx::text,true);
end;
$integrity$;

set local role service_role;
do $prune$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb;
begin
  assert public.prune_resource_versions((ctx->>'resource')::uuid,3)=1, 'Unreferenced candidate not pruned or pinned version removed';
end;
$prune$;
reset role;
do $retention$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb;
begin
  assert (select count(*) from public.resource_versions where resource_id=(ctx->>'resource')::uuid)=5;
  assert exists(select 1 from public.resource_versions where id=(ctx->>'pinned')::uuid);
  assert not exists(select 1 from public.resource_storage_cleanup where storage_path=(select storage_path from public.resource_versions where id=(ctx->>'pinned')::uuid));
  delete from public._resource_library_verifier_reference;
  assert public.prune_resource_versions((ctx->>'resource')::uuid,3)=1;
  assert (select array_agg(version_number order by version_number) from public.resource_versions where resource_id=(ctx->>'resource')::uuid)=array[3,4,5,6];
end;
$retention$;

set local role authenticated;
do $admin$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb; u public.resource_uploads%rowtype; v public.resource_versions%rowtype;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'admin',true);
  perform public.update_resource_metadata((ctx->>'resource')::uuid,'Admin metadata',null);
  u:=public.prepare_resource_upload((ctx->>'resource')::uuid,null,null,'document','application/pdf',10,'admin.pdf','admin.pdf');
  perform pg_temp.seed_object(u.id); v:=public.finalize_resource_upload(u.id);
  assert v.version_number=7;
  assert (select created_by=(ctx->>'author')::uuid from public.resources where id=v.resource_id), 'Admin replacement transferred ownership';
  perform public.set_resource_archived(v.resource_id,true);
  perform set_config('request.jwt.claim.sub',ctx->>'author',true);
  assert (select count(*) from public.resources where id=v.resource_id)=0;
  perform pg_temp.expect_rejected(format('select public.update_resource_metadata(%L,''Archived'',null)',v.resource_id),'Not authorized');
  perform pg_temp.expect_rejected(format('select public.set_resource_archived(%L,false)',v.resource_id),'Not authorized');
  perform set_config('request.jwt.claim.sub',ctx->>'super',true);
  assert (select count(*) from public.resources where id=v.resource_id)=1;
  perform public.set_resource_archived(v.resource_id,false);
  assert (select archived_at is null from public.resources where id=v.resource_id);
end;
$admin$;

reset role;
insert into public._resource_library_verifier_reference(resource_id,version_id)
select id,current_version_id from public.resources where id=(current_setting('resource.verifier')::jsonb->>'resource')::uuid;
set local role authenticated;
do $blocked_delete$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'admin',true);
  perform pg_temp.expect_rejected(format('select public.delete_resource(%L)',ctx->>'resource'));
  assert (select current_version_id is not null from public.resources where id=(ctx->>'resource')::uuid), 'Rejected delete altered current';
end;
$blocked_delete$;
reset role;
do $delete_outbox$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb; current_path text;
begin
  select storage_path into current_path from public.resource_versions where id=(select current_version_id from public.resources where id=(ctx->>'resource')::uuid);
  assert not exists(select 1 from public.resource_storage_cleanup where storage_path=current_path), 'Rejected DB deletion queued current file';
end;
$delete_outbox$;
delete from public._resource_library_verifier_reference;
set local role authenticated;
do $delete_allowed$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb;
begin
  perform public.delete_resource((ctx->>'resource')::uuid);
  assert (select count(*) from public.resources where id=(ctx->>'resource')::uuid)=0;
end;
$delete_allowed$;
reset role;
do $finished$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb;
begin
  assert (select count(*) from public.resource_versions where resource_id=(ctx->>'resource')::uuid)=0;
  assert (select count(*) from public.resource_storage_cleanup where resource_id=(ctx->>'resource')::uuid)=8;
  assert not has_table_privilege('authenticated','public.resources','UPDATE');
  assert not has_table_privilege('authenticated','public.resource_versions','INSERT');
  assert not has_function_privilege('anon','public.prepare_resource_upload(uuid,text,text,text,text,bigint,text,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.prune_resource_versions(uuid,integer)','EXECUTE');
end;
$finished$;

-- Expiry handles abandoned creation, including its hidden Resource shell.
set local role authenticated;
do $abandoned$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb; u public.resource_uploads%rowtype;
begin
  perform set_config('request.jwt.claim.sub',ctx->>'author',true);
  u:=public.prepare_resource_upload(null,'Abandoned',null,'document','application/pdf',10,'abandoned.pdf','abandoned.pdf');
  ctx:=ctx||jsonb_build_object('abandoned',u.id,'abandoned_resource',u.resource_id);
  perform set_config('resource.verifier',ctx::text,true);
end;
$abandoned$;
reset role;
update public.resource_uploads set expires_at=now()-interval '1 second' where id=(current_setting('resource.verifier')::jsonb->>'abandoned')::uuid;
set local role service_role;
do $expiry$
begin assert public.expire_resource_uploads()=1; end;
$expiry$;
reset role;
do $expiry_result$
declare ctx jsonb:=current_setting('resource.verifier')::jsonb;
begin
  assert not exists(select 1 from public.resources where id=(ctx->>'abandoned_resource')::uuid);
  assert not exists(select 1 from public.resource_uploads where id=(ctx->>'abandoned')::uuid);
  assert exists(select 1 from public.resource_storage_cleanup where resource_id=(ctx->>'abandoned_resource')::uuid);
end;
$expiry_result$;
select 'PASS: role/RLS, creation, replacement, MIME/limits, failure safety, immutable versions, relational integrity, retention + pinned FK protection, archive/restore, delete/outbox. All fixtures rolled back.' as result;
rollback;
