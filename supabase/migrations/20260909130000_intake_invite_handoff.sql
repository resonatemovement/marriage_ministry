alter table public.intake_requests
  add column invited_group_id uuid unique references public.groups(id) on delete restrict;

alter table public.intake_request_status_history
  add column reason_code text,
  add column reason_detail text,
  add constraint intake_request_status_history_reason_code_valid check (
    reason_code is null or reason_code in ('couple_withdrew', 'professional_referral', 'not_appropriate', 'duplicate_request', 'unable_to_contact', 'other')
  ),
  add constraint intake_request_status_history_reason_detail_matches check (
    (reason_code = 'other') = (btrim(coalesce(reason_detail, '')) <> '')
  );

with migrated as (
  update public.intake_requests set status = 'under_review'
  where status = 'ready_to_invite'
  returning id
)
insert into public.intake_request_status_history (intake_request_id, from_status, to_status, note)
select id, 'ready_to_invite', 'under_review', 'Legacy Ready to Invite migrated to Under Review'
from migrated;

create or replace function public.take_intake_request_action(
  target_request_id uuid,
  target_action text,
  target_reason_code text default null,
  target_reason_detail text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  current_request public.intake_requests%rowtype;
  next_status public.intake_request_status;
  action_note text;
  normalized_detail text := nullif(btrim(coalesce(target_reason_detail, '')), '');
begin
  if actor is null or not (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])) then raise exception 'Only Admin or Super Admin may manage Intake Requests'; end if;
  select * into current_request from public.intake_requests where id = target_request_id for update;
  if not found then raise exception 'Intake Request not found'; end if;
  if target_action = 'start_review' and current_request.status = 'ready_for_review' then
    next_status := 'under_review'; action_note := 'Review Started';
  elsif target_action = 'reopen' and current_request.status = 'closed' then
    next_status := 'under_review'; action_note := 'Request Reopened';
  elsif target_action = 'close' and current_request.status in ('ready_for_review', 'under_review') then
    if target_reason_code not in ('couple_withdrew', 'professional_referral', 'not_appropriate', 'duplicate_request', 'unable_to_contact', 'other') then raise exception 'Choose a valid close reason'; end if;
    if (target_reason_code = 'other') <> (normalized_detail is not null) then raise exception 'Provide a short reason when Other is selected'; end if;
    next_status := 'closed'; action_note := 'Request Closed';
  else raise exception 'Invalid Intake Request action'; end if;
  update public.intake_requests set status = next_status where id = target_request_id;
  insert into public.intake_request_status_history (intake_request_id, from_status, to_status, changed_by, note, reason_code, reason_detail)
  values (target_request_id, current_request.status, next_status, actor, action_note, case when target_action = 'close' then target_reason_code end, case when target_action = 'close' then normalized_detail end);
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'intake_request.' || target_action, 'intake_request', target_request_id, jsonb_build_object('from_status', current_request.status, 'to_status', next_status, 'reason_code', target_reason_code));
end;
$$;

create or replace function public.invite_intake_request(target_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  current_request public.intake_requests%rowtype;
  requester public.intake_request_people%rowtype;
  partner public.intake_request_people%rowtype;
  group_id uuid;
  invitation_ids jsonb := '[]'::jsonb;
  invitation_id uuid;
  person public.intake_request_people%rowtype;
begin
  if actor is null or not (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])) then raise exception 'Only Admin or Super Admin may invite an Intake Request'; end if;
  select * into current_request from public.intake_requests where id = target_request_id for update;
  if not found then raise exception 'Intake Request not found'; end if;
  if current_request.status = 'invited' and current_request.invited_group_id is not null then
    select coalesce(jsonb_agg(id order by created_at), '[]'::jsonb) into invitation_ids from public.invitations where group_id = current_request.invited_group_id;
    return jsonb_build_object('group_id', current_request.invited_group_id, 'invitation_ids', invitation_ids, 'created', false);
  end if;
  if current_request.status <> 'under_review' or current_request.invited_group_id is not null then raise exception 'Intake Request is not ready to invite'; end if;
  if current_request.campus_id is null or not exists (select 1 from public.campuses where id = current_request.campus_id and active) then raise exception 'Intake Request requires an active campus before inviting'; end if;
  select * into requester from public.intake_request_people where intake_request_id = target_request_id and person_position = 'requester';
  select * into partner from public.intake_request_people where intake_request_id = target_request_id and person_position = 'partner';
  if requester.id is null or partner.id is null or requester.email = partner.email then raise exception 'Intake Request must have two people with different emails'; end if;
  if exists (select 1 from auth.users where lower(email) in (requester.email, partner.email)) or exists (select 1 from public.profiles where email in (requester.email, partner.email)) or exists (select 1 from public.invitations where email in (requester.email, partner.email) and status = 'pending') then raise exception 'An active user or pending invitation already exists for an Intake Request email'; end if;
  insert into public.groups (campus_id, group_type, name) values (current_request.campus_id, 'couple', 'Pending Couple invitation') returning id into group_id;
  for person in select * from public.intake_request_people where intake_request_id = target_request_id order by person_position loop
    insert into public.invitations (email, first_name, last_name, intended_role, campus_id, group_id, invited_by) values (person.email, person.first_name, person.last_name, 'couple', current_request.campus_id, group_id, actor) returning id into invitation_id;
    invitation_ids := invitation_ids || to_jsonb(invitation_id);
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details) values (actor, 'invitation.created', 'invitation', invitation_id, jsonb_build_object('role', 'couple', 'campus_id', current_request.campus_id, 'group_id', group_id));
  end loop;
  update public.intake_requests set status = 'invited', invited_group_id = group_id where id = target_request_id;
  insert into public.intake_request_status_history (intake_request_id, from_status, to_status, changed_by, note) values (target_request_id, current_request.status, 'invited', actor, 'Couple Invited');
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details) values (actor, 'intake_request.invited', 'intake_request', target_request_id, jsonb_build_object('group_id', group_id, 'invitation_ids', invitation_ids));
  return jsonb_build_object('group_id', group_id, 'invitation_ids', invitation_ids, 'created', true);
end;
$$;

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
  if invite_role not in ('super_admin', 'admin', 'author', 'coach', 'counselor') then raise exception 'Unsupported invitation role'; end if;
  if not exists (select 1 from public.campuses where id = campus and active) then raise exception 'Choose an active campus'; end if;
  if jsonb_array_length(members) <> (case when invite_role in ('coach', 'counselor') then 2 else 1 end) then raise exception 'Invitation role requires the expected number of invitees'; end if;
  if invite_role in ('coach', 'counselor') then
    group_kind := case invite_role when 'coach' then 'coach_team' else 'counselor_team' end;
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

revoke execute on function public.take_intake_request_action(uuid, text, text, text) from public, anon;
grant execute on function public.take_intake_request_action(uuid, text, text, text) to authenticated;
revoke execute on function public.invite_intake_request(uuid) from public, anon;
grant execute on function public.invite_intake_request(uuid) to authenticated;
