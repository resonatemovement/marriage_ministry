create or replace function private.invitation_auth_email_exists(target_email text)
returns boolean
language sql
security definer
set search_path = auth
as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(target_email)));
$$;

revoke execute on function private.invitation_auth_email_exists(text) from public, anon, authenticated;
grant execute on function private.invitation_auth_email_exists(text) to authenticated;

create or replace function public.create_invitations(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  actor uuid := auth.uid();
  invite_role public.app_role := (payload->>'role')::public.app_role;
  campus uuid := (payload->>'campus_id')::uuid;
  members jsonb := coalesce(payload->'invitees', '[]'::jsonb);
  group_kind public.group_type;
  group_id uuid;
  invitation_ids jsonb := '[]'::jsonb;
  item jsonb;
  normalized_email text;
  invitation_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then raise exception 'Only Admin or Super Admin may create invitations'; end if;
  if invite_role not in ('super_admin', 'admin', 'author', 'couple', 'coach', 'counselor') then raise exception 'Unsupported invitation role'; end if;
  if not exists (select 1 from public.campuses where id = campus and active) then raise exception 'Choose an active campus'; end if;
  if jsonb_array_length(members) <> (case when invite_role in ('couple', 'coach', 'counselor') then 2 else 1 end) then raise exception 'Invitation role requires the expected number of invitees'; end if;
  if invite_role in ('couple', 'coach', 'counselor') then
    group_kind := case invite_role when 'couple' then 'couple' when 'coach' then 'coach_team' else 'counselor_team' end;
    insert into public.groups (campus_id, group_type, name) values (campus, group_kind, 'Pending ' || initcap(invite_role::text) || ' invitation') returning id into group_id;
  end if;
  for item in select * from jsonb_array_elements(members) loop
    normalized_email := lower(btrim(item->>'email'));
    if normalized_email = '' or normalized_email is null then raise exception 'Invitee email is required'; end if;
    if exists (select 1 from jsonb_array_elements(members) other where lower(btrim(other->>'email')) = normalized_email and other <> item) then raise exception 'Invitee emails must be unique'; end if;
    if private.invitation_auth_email_exists(normalized_email) or exists (select 1 from public.profiles where email = normalized_email) or exists (select 1 from public.invitations where email = normalized_email and status = 'pending') then raise exception 'An active user or pending invitation already exists for this email'; end if;
    insert into public.invitations (email, first_name, last_name, intended_role, campus_id, group_id, invited_by) values (normalized_email, coalesce(item->>'first_name', ''), coalesce(item->>'last_name', ''), invite_role, campus, group_id, actor) returning id into invitation_id;
    invitation_ids := invitation_ids || to_jsonb(invitation_id);
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details) values (actor, 'invitation.created', 'invitation', invitation_id, jsonb_build_object('role', invite_role, 'campus_id', campus, 'group_id', group_id, 'email', normalized_email));
  end loop;
  return jsonb_build_object('invitation_ids', invitation_ids, 'group_id', group_id);
end;
$$;
