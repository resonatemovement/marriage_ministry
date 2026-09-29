create function public.prepare_resource_upload(
  target_resource_id uuid, target_title text, target_description text, target_category text,
  target_mime_type text, target_size_bytes bigint, target_original_filename text, target_safe_filename text
)
returns public.resource_uploads language plpgsql security definer set search_path = '' as $$
declare r public.resources%rowtype; u public.resource_uploads%rowtype; vid uuid := gen_random_uuid();
begin
  if not private.resource_can_browse(false) then raise exception 'Not authorized'; end if;
  if not private.resource_file_valid(target_category,target_mime_type,target_size_bytes)
    or target_original_filename is null or char_length(target_original_filename) not between 1 and 255
    or target_original_filename ~ '[[:cntrl:]]'
    or target_safe_filename is null or target_safe_filename !~ '^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,159}$'
  then raise exception 'Invalid Resource upload'; end if;
  if target_resource_id is null then
    insert into public.resources(title,description,category,created_by,updated_by)
    values (btrim(target_title),nullif(btrim(target_description),''),target_category,auth.uid(),auth.uid()) returning * into r;
  else
    select * into r from public.resources where id = target_resource_id for update;
    if not found or r.current_version_id is null or not private.resource_can_manage(r.created_by,r.archived_at is not null)
    then raise exception 'Not authorized'; end if;
    if r.category <> target_category then raise exception 'Replacement must preserve Resource category'; end if;
  end if;
  insert into public.resource_uploads(id,resource_id,uploaded_by,storage_path,original_filename,mime_type,size_bytes)
  values (vid,r.id,auth.uid(),r.id::text || '/' || vid::text || '/' || target_safe_filename,
    target_original_filename,target_mime_type,target_size_bytes) returning * into u;
  return u;
end;
$$;

create function public.finalize_resource_upload(target_upload_id uuid)
returns public.resource_versions language plpgsql security definer set search_path = '' as $$
declare u public.resource_uploads%rowtype; r public.resources%rowtype; v public.resource_versions%rowtype; meta jsonb;
begin
  -- Idempotent retries never rewind current after a later replacement.
  select * into v from public.resource_versions where id = target_upload_id;
  if found then
    select * into r from public.resources where id = v.resource_id;
    if v.uploaded_by <> auth.uid() or not private.resource_can_manage(r.created_by,r.archived_at is not null)
    then raise exception 'Not authorized'; end if;
    return v;
  end if;
  select * into u from public.resource_uploads where id = target_upload_id;
  if not found or u.uploaded_by <> auth.uid() then raise exception 'Upload unavailable'; end if;
  select * into r from public.resources where id = u.resource_id for update;
  -- All upload/domain operations lock the Resource before its intents.
  select * into u from public.resource_uploads where id = target_upload_id for update;
  if not found then
    select * into v from public.resource_versions where id = target_upload_id;
    if found then return v; end if;
    raise exception 'Upload unavailable';
  end if;
  if not private.resource_can_manage(r.created_by,r.archived_at is not null) or u.expires_at <= now()
  then raise exception 'Upload unauthorized or expired'; end if;
  select metadata into meta from storage.objects where bucket_id = 'resource-library' and name = u.storage_path;
  if not found or (meta->>'size')::bigint is distinct from u.size_bytes
    or meta->>'mimetype' is distinct from u.mime_type
    or not private.resource_file_valid(r.category,u.mime_type,u.size_bytes)
  then raise exception 'Uploaded Resource file is missing or mismatched'; end if;
  insert into public.resource_versions(id,resource_id,version_number,storage_path,original_filename,mime_type,size_bytes,uploaded_by)
  values (u.id,r.id,r.last_version_number+1,u.storage_path,u.original_filename,u.mime_type,u.size_bytes,u.uploaded_by)
  returning * into v;
  update public.resources set current_version_id=v.id,last_version_number=v.version_number,updated_by=auth.uid() where id=r.id;
  delete from public.resource_uploads where id=u.id;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,details)
  values (auth.uid(),'resource.version_finalized','resource',r.id,jsonb_build_object('version_id',v.id,'version_number',v.version_number));
  return v;
end;
$$;

create function private.cancel_resource_upload(target_upload_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare u public.resource_uploads%rowtype;
begin
  select * into u from public.resource_uploads where id=target_upload_id;
  if not found then return; end if;
  perform 1 from public.resources where id=u.resource_id for update;
  select * into u from public.resource_uploads where id=target_upload_id for update;
  if not found then return; end if; -- A concurrent finalization won: never remove that binary.
  insert into public.resource_storage_cleanup(storage_path,resource_id,not_before)
  values (u.storage_path,u.resource_id,u.expires_at) on conflict do nothing;
  delete from public.resource_uploads where id=u.id;
  delete from public.resources where id=u.resource_id and current_version_id is null
    and not exists(select 1 from public.resource_uploads where resource_id=u.resource_id);
end;
$$;
create function public.cancel_resource_upload(target_upload_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.resource_uploads where id=target_upload_id and uploaded_by=auth.uid())
  then perform private.cancel_resource_upload(target_upload_id); end if;
end;
$$;

create function public.update_resource_metadata(target_resource_id uuid,target_title text,target_description text)
returns public.resources language plpgsql security definer set search_path = '' as $$
declare r public.resources%rowtype;
begin
  select * into r from public.resources where id=target_resource_id for update;
  if not found or r.current_version_id is null or not private.resource_can_manage(r.created_by,r.archived_at is not null)
  then raise exception 'Not authorized'; end if;
  update public.resources set title=btrim(target_title),description=nullif(btrim(target_description),''),updated_by=auth.uid()
  where id=r.id returning * into r;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id)
  values (auth.uid(),'resource.metadata_updated','resource',r.id);
  return r;
end;
$$;
create function public.set_resource_archived(target_resource_id uuid,should_archive boolean)
returns public.resources language plpgsql security definer set search_path = '' as $$
declare r public.resources%rowtype;
begin
  if not private.current_user_has_role(array['super_admin','admin']::public.app_role[]) or should_archive is null
  then raise exception 'Not authorized'; end if;
  update public.resources set archived_at=case when should_archive then now() end,
    archived_by=case when should_archive then auth.uid() end,updated_by=auth.uid()
  where id=target_resource_id and current_version_id is not null returning * into r;
  if not found then raise exception 'Resource unavailable'; end if;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id)
  values(auth.uid(),case when should_archive then 'resource.archived' else 'resource.restored' end,'resource',r.id);
  return r;
end;
$$;

create function public.delete_resource(target_resource_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.resources%rowtype;
begin
  if not private.current_user_has_role(array['super_admin','admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
  select * into r from public.resources where id=target_resource_id for update;
  if not found or r.current_version_id is null then raise exception 'Resource unavailable'; end if;
  -- All changes, including the outbox, roll back on a future restrictive consumer FK rejection.
  insert into public.resource_storage_cleanup(storage_path,resource_id)
  select storage_path,resource_id from public.resource_versions where resource_id=r.id;
  insert into public.resource_storage_cleanup(storage_path,resource_id,not_before)
  select storage_path,resource_id,expires_at from public.resource_uploads where resource_id=r.id;
  update public.resources set current_version_id=null where id=r.id;
  delete from public.resource_uploads where resource_id=r.id;
  delete from public.resource_versions where resource_id=r.id;
  delete from public.resources where id=r.id;
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id)
  values(auth.uid(),'resource.permanently_deleted','resource',r.id);
end;
$$;

-- Service-only cleanup uses the centralized application retention count, not a client value.
create function public.prune_resource_versions(target_resource_id uuid,keep_previous integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare current_id uuid; candidate public.resource_versions%rowtype; removed integer := 0;
begin
  if keep_previous is null or keep_previous < 0 then raise exception 'Invalid retention'; end if;
  select current_version_id into current_id from public.resources where id=target_resource_id for update;
  if not found or current_id is null then return 0; end if;
  for candidate in select * from public.resource_versions where resource_id=target_resource_id and id<>current_id
    order by version_number desc offset keep_previous loop
    begin
      -- BEFORE first pinned consumer: extend explicit protection/candidate checks here.
      -- RESTRICT FKs are the final safety net; a rejected delete never queues Storage removal.
      delete from public.resource_versions where id=candidate.id;
      insert into public.resource_storage_cleanup(storage_path,resource_id) values(candidate.storage_path,candidate.resource_id);
      removed := removed + 1;
    exception when foreign_key_violation then null;
    end;
  end loop;
  return removed;
end;
$$;
create function public.expire_resource_uploads()
returns integer language plpgsql security definer set search_path = '' as $$
declare upload_id uuid; removed integer := 0;
begin
  for upload_id in select id from public.resource_uploads where expires_at<=now() order by resource_id limit 100 loop
    perform private.cancel_resource_upload(upload_id); removed := removed+1;
  end loop;
  return removed;
end;
$$;

revoke all on function public.prepare_resource_upload(uuid,text,text,text,text,bigint,text,text),
  public.finalize_resource_upload(uuid), public.cancel_resource_upload(uuid),
  public.update_resource_metadata(uuid,text,text), public.set_resource_archived(uuid,boolean),
  public.delete_resource(uuid), public.prune_resource_versions(uuid,integer),public.expire_resource_uploads(),
  private.cancel_resource_upload(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_resource_upload(uuid,text,text,text,text,bigint,text,text),
  public.finalize_resource_upload(uuid),public.cancel_resource_upload(uuid),public.update_resource_metadata(uuid,text,text),
  public.set_resource_archived(uuid,boolean),public.delete_resource(uuid) to authenticated;
grant execute on function public.prune_resource_versions(uuid,integer),public.expire_resource_uploads() to service_role;
