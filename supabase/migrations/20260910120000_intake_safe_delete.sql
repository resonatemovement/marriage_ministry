create or replace function public.delete_intake_request(target_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  current_request public.intake_requests%rowtype;
begin
  if actor is null or not (select private.current_user_has_role(array['super_admin']::public.app_role[])) then
    raise exception 'Only Super Admins may permanently delete Intake Requests';
  end if;

  select * into current_request
  from public.intake_requests
  where id = target_request_id
  for update;
  if not found then raise exception 'Intake Request not found'; end if;

  if current_request.status = 'invited' or current_request.invited_group_id is not null then
    raise exception 'Intake Request cannot be deleted because invitations have already been created or participant records exist';
  end if;
  if exists (select 1 from public.invitations as invitation where invitation.group_id = current_request.invited_group_id) then
    raise exception 'Intake Request cannot be deleted because invitations have already been created or participant records exist';
  end if;
  if exists (select 1 from public.counseling_cases as counseling_case where counseling_case.couple_group_id = current_request.invited_group_id) then
    raise exception 'Intake Request cannot be deleted because invitations have already been created or participant records exist';
  end if;

  delete from public.notification_deliveries
  where related_entity_type = 'intake_request' and related_entity_id = target_request_id;
  delete from public.intake_request_status_history where intake_request_id = target_request_id;
  delete from public.intake_request_people where intake_request_id = target_request_id;
  delete from public.audit_events where entity_type = 'intake_request' and entity_id = target_request_id;
  delete from public.intake_requests where id = target_request_id;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'intake.deleted', 'intake_request', target_request_id, '{}'::jsonb);
  return jsonb_build_object('deleted', true);
end;
$$;

revoke execute on function public.delete_intake_request(uuid) from public, anon;
grant execute on function public.delete_intake_request(uuid) to authenticated;
