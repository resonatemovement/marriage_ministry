create or replace function public.invite_intake_request(target_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  current_request public.intake_requests%rowtype;
  requester public.intake_request_people%rowtype;
  partner public.intake_request_people%rowtype;
  created_group_id uuid;
  invitation_ids jsonb := '[]'::jsonb;
  invitation_id uuid;
  person public.intake_request_people%rowtype;
begin
  if actor is null or not private.current_user_can_manage_intake(target_request_id) then raise exception 'Not authorized to invite this Intake Request'; end if;
  select * into current_request from public.intake_requests where id = target_request_id for update;
  if not found then raise exception 'Intake Request not found'; end if;
  if current_request.status = 'invited' and current_request.invited_group_id is not null then
    select coalesce(jsonb_agg(invitation.id order by invitation.created_at), '[]'::jsonb)
      into invitation_ids
    from public.invitations invitation
    where invitation.group_id = current_request.invited_group_id;
    return jsonb_build_object('group_id', current_request.invited_group_id, 'invitation_ids', invitation_ids, 'created', false);
  end if;
  if current_request.status <> 'under_review' or current_request.invited_group_id is not null then raise exception 'Intake Request is not ready to invite'; end if;
  if current_request.campus_id is null or not exists (select 1 from public.campuses where id = current_request.campus_id and active) then raise exception 'Intake Request requires an active campus before inviting'; end if;
  select * into requester from public.intake_request_people where intake_request_id = target_request_id and person_position = 'requester';
  select * into partner from public.intake_request_people where intake_request_id = target_request_id and person_position = 'partner';
  if requester.id is null or partner.id is null or requester.email = partner.email then raise exception 'Intake Request must have two people with different emails'; end if;
  if exists (select 1 from auth.users where lower(email) in (requester.email, partner.email)) or exists (select 1 from public.profiles where email in (requester.email, partner.email)) or exists (select 1 from public.invitations where email in (requester.email, partner.email) and status = 'pending') then raise exception 'An active user or pending invitation already exists for an Intake Request email'; end if;
  insert into public.groups (campus_id, group_type, name) values (current_request.campus_id, 'couple', 'Pending Couple invitation') returning id into created_group_id;
  for person in select * from public.intake_request_people where intake_request_id = target_request_id order by person_position loop
    insert into public.invitations (email, first_name, last_name, phone, intended_role, campus_id, group_id, invited_by)
    values (person.email, person.first_name, person.last_name, person.phone, 'couple', current_request.campus_id, created_group_id, actor)
    returning id into invitation_id;
    invitation_ids := invitation_ids || to_jsonb(invitation_id);
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
    values (actor, 'invitation.created', 'invitation', invitation_id, jsonb_build_object('role', 'couple', 'campus_id', current_request.campus_id, 'group_id', created_group_id));
  end loop;
  update public.intake_requests set status = 'invited', invited_group_id = created_group_id where id = target_request_id;
  insert into public.intake_request_status_history (intake_request_id, from_status, to_status, changed_by, note)
  values (target_request_id, current_request.status, 'invited', actor, 'Couple Invited');
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'intake_request.invited', 'intake_request', target_request_id, jsonb_build_object('group_id', created_group_id, 'invitation_ids', invitation_ids));
  return jsonb_build_object('group_id', created_group_id, 'invitation_ids', invitation_ids, 'created', true);
end;
$$;
