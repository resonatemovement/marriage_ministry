alter table public.invitations add column phone text;

create or replace function public.create_invitations(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, private as $$
declare actor uuid := auth.uid(); invite_role public.app_role := (payload->>'role')::public.app_role; campus uuid := (payload->>'campus_id')::uuid; members jsonb := coalesce(payload->'invitees', '[]'::jsonb); group_kind public.group_type; group_id uuid; invitation_ids jsonb := '[]'::jsonb; item jsonb; normalized_email text; normalized_phone text; phone_digits text; invitation_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin']::public.app_role[]) then raise exception 'Only Admin or Super Admin may create invitations'; end if;
  if invite_role not in ('super_admin','admin','author','couple','coach','counselor','campus_lead') then raise exception 'Unsupported invitation role'; end if;
  if not exists (select 1 from public.campuses where id = campus and active) then raise exception 'Choose an active campus'; end if;
  if jsonb_array_length(members) <> (case when invite_role in ('couple','coach','counselor','campus_lead') then 2 else 1 end) then raise exception 'Invitation role requires the expected number of invitees'; end if;
  if invite_role in ('couple','coach','counselor','campus_lead') then
    group_kind := case invite_role when 'couple' then 'couple' when 'coach' then 'coach_team' when 'counselor' then 'counselor_team' else 'campus_lead_team' end;
    insert into public.groups (campus_id,group_type,name) values (campus,group_kind,'Pending ' || initcap(replace(invite_role::text,'_',' ')) || ' invitation') returning id into group_id;
  end if;
  for item in select * from jsonb_array_elements(members) loop
    normalized_email := lower(btrim(item->>'email')); normalized_phone := nullif(btrim(item->>'phone'),'');
    if normalized_email is null or normalized_email = '' then raise exception 'Invitee email is required'; end if;
    if invite_role = 'couple' then
      phone_digits := regexp_replace(coalesce(normalized_phone,''),'[^0-9]','','g');
      if normalized_phone is null or normalized_phone !~ '^[0-9+(). -]+$' or length(phone_digits) < 7 or length(phone_digits) > 15 then raise exception 'Enter a valid phone number'; end if;
    end if;
    if exists (select 1 from jsonb_array_elements(members) other where lower(btrim(other->>'email')) = normalized_email and other <> item) then raise exception 'Invitee emails must be unique'; end if;
    if private.invitation_auth_email_exists(normalized_email) or exists (select 1 from public.profiles where email = normalized_email) or exists (select 1 from public.invitations where email = normalized_email and status = 'pending') then raise exception 'An active user or pending invitation already exists for this email'; end if;
    insert into public.invitations (email,first_name,last_name,phone,intended_role,campus_id,group_id,invited_by) values (normalized_email,coalesce(item->>'first_name',''),coalesce(item->>'last_name',''),normalized_phone,invite_role,campus,group_id,actor) returning id into invitation_id;
    invitation_ids := invitation_ids || to_jsonb(invitation_id);
  end loop;
  return jsonb_build_object('invitation_ids',invitation_ids,'group_id',group_id);
end; $$;

create or replace function public.accept_invitation()
returns jsonb language plpgsql security definer set search_path = public, auth, private as $$
declare actor uuid := auth.uid(); actor_email text; invitation public.invitations%rowtype; group_kind public.group_type; matching_invitations integer; accepted_now boolean := false;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select lower(email) into actor_email from auth.users where id = actor; if actor_email is null then raise exception 'Authenticated user email is missing'; end if;
  select count(*) into matching_invitations from public.invitations where auth_user_id = actor;
  if matching_invitations > 1 then raise exception 'Invitation identity is ambiguous'; elsif matching_invitations = 1 then select * into invitation from public.invitations where auth_user_id = actor for update; else select count(*) into matching_invitations from public.invitations where auth_user_id is null and email = actor_email and status = 'pending'; if matching_invitations > 1 then raise exception 'Invitation identity is ambiguous'; elsif matching_invitations = 1 then select * into invitation from public.invitations where auth_user_id is null and email = actor_email and status = 'pending' for update; elsif exists (select 1 from public.invitations where email = actor_email and auth_user_id is not null and auth_user_id <> actor) then raise exception 'Invitation belongs to another account'; else raise exception 'Invitation not found'; end if; end if;
  if invitation.auth_user_id is not null and invitation.auth_user_id <> actor then raise exception 'Invitation belongs to another account'; end if;
  if invitation.status = 'revoked' then raise exception 'Invitation revoked'; end if;
  if invitation.status <> 'pending' and not (invitation.status = 'accepted' and invitation.auth_user_id = actor) then raise exception 'Invitation expired'; end if;
  if invitation.expires_at is not null and invitation.expires_at <= now() and invitation.status <> 'accepted' then raise exception 'Invitation expired'; end if;
  if invitation.email <> actor_email or not exists (select 1 from public.campuses where id = invitation.campus_id) then raise exception 'Invitation is invalid'; end if;
  group_kind := private.invitation_group_type(invitation.intended_role);
  if group_kind is not null then if invitation.group_id is null or not exists (select 1 from public.groups where id = invitation.group_id and active and group_type = group_kind) then raise exception 'Invitation group is invalid'; end if; if exists (select 1 from public.group_members membership join public.groups existing_group on existing_group.id = membership.group_id where membership.profile_id = actor and membership.ended_at is null and membership.group_id <> invitation.group_id and existing_group.group_type = group_kind) then raise exception 'Profile already belongs to another active group of this type'; end if; elsif invitation.group_id is not null then raise exception 'Invitation group is invalid'; end if;
  insert into public.profiles (id,campus_id,first_name,last_name,email,phone,status) values (actor,invitation.campus_id,invitation.first_name,invitation.last_name,actor_email,invitation.phone,'invited'::public.profile_status) on conflict (id) do update set campus_id=excluded.campus_id,first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,phone=coalesce(excluded.phone,public.profiles.phone),status=case when public.profiles.status='active' then 'active'::public.profile_status else 'invited'::public.profile_status end;
  insert into public.profile_roles (profile_id,role,assigned_by) values (actor,invitation.intended_role,actor) on conflict (profile_id,role) do nothing;
  if invitation.group_id is not null then insert into public.group_members (group_id,profile_id) values (invitation.group_id,actor) on conflict (group_id,profile_id) where ended_at is null do nothing; end if;
  if invitation.status = 'pending' then update public.invitations set status = 'accepted', accepted_at = now(), auth_user_id = actor where id = invitation.id; accepted_now := true; end if;
  if accepted_now then insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details) values (actor,'invitation.accepted','invitation',invitation.id,jsonb_build_object('profile_id',actor,'role',invitation.intended_role,'group_id',invitation.group_id)); end if;
  return jsonb_build_object('invitation_id',invitation.id,'role',invitation.intended_role,'group_id',invitation.group_id);
end; $$;

create or replace function public.activate_invitation_account()
returns jsonb language plpgsql security definer set search_path = public, auth, private as $$
declare actor uuid := auth.uid(); actor_email text; invitation public.invitations%rowtype; group_kind public.group_type; activated_now boolean := false;
begin
  if actor is null then raise exception 'No authenticated session'; end if;
  select lower(email) into actor_email from auth.users where id = actor;
  select * into invitation from public.invitations where auth_user_id = actor for update;
  if not found or actor_email is null or invitation.email <> actor_email then raise exception 'Invitation not found for this account'; end if;
  if invitation.status = 'revoked' or (invitation.status <> 'pending' and not (invitation.status = 'accepted' and invitation.auth_user_id = actor)) or (invitation.expires_at is not null and invitation.expires_at <= now() and invitation.status <> 'accepted') then raise exception 'Invitation expired'; end if;
  if not exists (select 1 from public.campuses where id = invitation.campus_id and active) then raise exception 'Invitation campus is invalid'; end if;
  group_kind := private.invitation_group_type(invitation.intended_role);
  if group_kind is not null then if invitation.group_id is null or not exists (select 1 from public.groups where id = invitation.group_id and active and group_type = group_kind) then raise exception 'Invitation group is invalid'; end if; if exists (select 1 from public.group_members membership join public.groups existing_group on existing_group.id = membership.group_id where membership.profile_id = actor and membership.ended_at is null and membership.group_id <> invitation.group_id and existing_group.group_type = group_kind) then raise exception 'Profile already belongs to another active group of this type'; end if; elsif invitation.group_id is not null then raise exception 'Invitation group is invalid'; end if;
  if exists (select 1 from public.profiles where id = actor and status = 'active') then raise exception 'Account is already active'; end if;
  insert into public.profiles (id,campus_id,first_name,last_name,email,phone,status) values (actor,invitation.campus_id,invitation.first_name,invitation.last_name,actor_email,invitation.phone,'password_required') on conflict (id) do update set campus_id=excluded.campus_id,first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,phone=coalesce(excluded.phone,public.profiles.phone),status=case when public.profiles.status='onboarding' then 'onboarding'::public.profile_status else 'password_required'::public.profile_status end;
  insert into public.profile_roles (profile_id,role,assigned_by) values (actor,invitation.intended_role,actor) on conflict (profile_id,role) do nothing;
  if invitation.group_id is not null then insert into public.group_members (group_id,profile_id) values (invitation.group_id,actor) on conflict (group_id,profile_id) where ended_at is null do nothing; end if;
  if invitation.status = 'pending' then update public.invitations set status='accepted',accepted_at=now() where id=invitation.id; activated_now:=true; end if;
  if activated_now then insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details) values (actor,'invitation.accepted','invitation',invitation.id,jsonb_build_object('profile_id',actor,'role',invitation.intended_role,'group_id',invitation.group_id)),(actor,'invitation.activation_completed','invitation',invitation.id,jsonb_build_object('profile_id',actor)); end if;
  return jsonb_build_object('invitation_id',invitation.id,'account_stage','password_required');
end; $$;

create or replace function public.invite_intake_request(target_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid(); current_request public.intake_requests%rowtype; requester public.intake_request_people%rowtype; partner public.intake_request_people%rowtype; group_id uuid; invitation_ids jsonb := '[]'::jsonb; invitation_id uuid; person public.intake_request_people%rowtype;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','campus_lead']::public.app_role[]) then raise exception 'Not authorized to invite this Intake Request'; end if;
  select * into current_request from public.intake_requests where id=target_request_id for update; if not found then raise exception 'Intake Request not found'; end if;
  select * into requester from public.intake_request_people where intake_request_id=target_request_id and person_position='requester'; select * into partner from public.intake_request_people where intake_request_id=target_request_id and person_position='partner';
  if requester.id is null or partner.id is null or requester.email=partner.email then raise exception 'Intake Request must have two people with different emails'; end if;
  insert into public.groups (campus_id,group_type,name) values (current_request.campus_id,'couple','Pending Couple invitation') returning id into group_id;
  for person in select * from public.intake_request_people where intake_request_id=target_request_id order by person_position loop insert into public.invitations (email,first_name,last_name,phone,intended_role,campus_id,group_id,invited_by) values (person.email,person.first_name,person.last_name,person.phone,'couple',current_request.campus_id,group_id,actor) returning id into invitation_id; invitation_ids:=invitation_ids||to_jsonb(invitation_id); end loop;
  update public.intake_requests set status='invited',invited_group_id=group_id where id=target_request_id; return jsonb_build_object('group_id',group_id,'invitation_ids',invitation_ids,'created',true);
end; $$;
