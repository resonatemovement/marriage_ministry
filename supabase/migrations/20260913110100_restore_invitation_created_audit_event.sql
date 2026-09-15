create or replace function public.create_invitations(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, private as $$
declare actor uuid := auth.uid(); invite_role public.app_role := (payload->>'role')::public.app_role; campus uuid := (payload->>'campus_id')::uuid; members jsonb := coalesce(payload->'invitees', '[]'::jsonb); group_kind public.group_type; group_id uuid; invitation_ids jsonb := '[]'::jsonb; item jsonb; normalized_email text; normalized_phone text; phone_digits text; invitation_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin']::public.app_role[]) then raise exception 'Only Admin or Super Admin may create invitations'; end if;
  if invite_role not in ('super_admin','admin','author','couple','coach','counselor','campus_lead') then raise exception 'Unsupported invitation role'; end if;
  if not exists (select 1 from public.campuses where id = campus and active) then raise exception 'Choose an active campus'; end if;
  if jsonb_array_length(members) <> (case when invite_role in ('couple','coach','counselor','campus_lead') then 2 else 1 end) then raise exception 'Invitation role requires the expected number of invitees'; end if;
  if invite_role in ('couple','coach','counselor','campus_lead') then group_kind := case invite_role when 'couple' then 'couple' when 'coach' then 'coach_team' when 'counselor' then 'counselor_team' else 'campus_lead_team' end; insert into public.groups (campus_id,group_type,name) values (campus,group_kind,'Pending ' || initcap(replace(invite_role::text,'_',' ')) || ' invitation') returning id into group_id; end if;
  for item in select * from jsonb_array_elements(members) loop
    normalized_email := lower(btrim(item->>'email')); normalized_phone := nullif(btrim(item->>'phone'),'');
    if normalized_email is null or normalized_email = '' then raise exception 'Invitee email is required'; end if;
    if invite_role = 'couple' then phone_digits := regexp_replace(coalesce(normalized_phone,''),'[^0-9]','','g'); if normalized_phone is null or normalized_phone !~ '^[0-9+(). -]+$' or length(phone_digits) < 7 or length(phone_digits) > 15 then raise exception 'Enter a valid phone number'; end if; end if;
    if exists (select 1 from jsonb_array_elements(members) other where lower(btrim(other->>'email')) = normalized_email and other <> item) then raise exception 'Invitee emails must be unique'; end if;
    if private.invitation_auth_email_exists(normalized_email) or exists (select 1 from public.profiles where email = normalized_email) or exists (select 1 from public.invitations where email = normalized_email and status = 'pending') then raise exception 'An active user or pending invitation already exists for this email'; end if;
    insert into public.invitations (email,first_name,last_name,phone,intended_role,campus_id,group_id,invited_by) values (normalized_email,coalesce(item->>'first_name',''),coalesce(item->>'last_name',''),normalized_phone,invite_role,campus,group_id,actor) returning id into invitation_id;
    invitation_ids := invitation_ids || to_jsonb(invitation_id);
    insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details) values (actor,'invitation.created','invitation',invitation_id,jsonb_build_object('role',invite_role,'campus_id',campus,'group_id',group_id,'email',normalized_email));
  end loop;
  return jsonb_build_object('invitation_ids',invitation_ids,'group_id',group_id);
end; $$;
