create or replace function public.update_intake_request_status(target_request_id uuid, next_status public.intake_request_status)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); current_request public.intake_requests%rowtype; allowed boolean := false; begin
  if actor is null or not (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])) then
    raise exception 'Only Admin or Super Admin may manage Intake Requests';
  end if;
  select * into current_request from public.intake_requests where id = target_request_id for update;
  if not found then raise exception 'Intake Request not found'; end if;
  if next_status = 'invited' then raise exception 'Invited is managed by the invitation workflow'; end if;
  allowed := case current_request.status
    when 'ready_for_review' then next_status in ('under_review', 'closed')
    when 'under_review' then next_status in ('ready_to_invite', 'closed')
    when 'ready_to_invite' then next_status in ('under_review', 'closed')
    when 'closed' then next_status = 'under_review'
    when 'invited' then false
  end;
  if not allowed then raise exception 'Invalid Intake Request status transition'; end if;
  update public.intake_requests set status = next_status where id = target_request_id;
  insert into public.intake_request_status_history (intake_request_id, from_status, to_status, changed_by)
  values (target_request_id, current_request.status, next_status, actor);
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'intake_request.status_updated', 'intake_request', target_request_id,
    jsonb_build_object('from_status', current_request.status, 'to_status', next_status));
end;
$$;

revoke execute on function public.update_intake_request_status(uuid, public.intake_request_status) from public, anon;
grant execute on function public.update_intake_request_status(uuid, public.intake_request_status) to authenticated;
