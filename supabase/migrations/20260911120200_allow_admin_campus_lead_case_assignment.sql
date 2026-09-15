create or replace function public.assign_counseling_case_to_campus_lead(
  target_case_id uuid,
  target_profile_id uuid,
  reassignment_reason text default 'Reassigned by administrator'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_campus uuid; new_assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then raise exception 'Only an Admin or Super Admin may assign a Campus Lead'; end if;
  select campus_id into target_campus from public.counseling_cases where id = target_case_id for update;
  if target_campus is null then raise exception 'Counseling case not found'; end if;
  if not exists (
    select 1 from public.profiles profile
    join public.profile_roles role on role.profile_id = profile.id and role.role = 'campus_lead'
    join public.campus_lead_assignments scope on scope.profile_id = profile.id and scope.campus_id = target_campus and scope.ended_at is null
    where profile.id = target_profile_id and profile.status = 'active'
  ) then raise exception 'Choose an active Campus Lead for this campus'; end if;
  update public.case_assignments set ended_at = now(), end_reason = coalesce(nullif(btrim(reassignment_reason), ''), 'Reassigned by administrator')
  where counseling_case_id = target_case_id and assignment_type = 'campus_lead' and ended_at is null;
  insert into public.case_assignments (counseling_case_id, assigned_profile_id, assignment_type, assigned_by)
  values (target_case_id, target_profile_id, 'campus_lead', actor) returning id into new_assignment_id;
  update public.counseling_cases set status = 'matched' where id = target_case_id and status in ('requested', 'assessment', 'interviewed');
  insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details)
  values (actor,'case.assigned','counseling_case',target_case_id,jsonb_build_object('assignment_id',new_assignment_id,'assignment_type','campus_lead','profile_id',target_profile_id));
  return new_assignment_id;
end;
$$;
revoke execute on function public.assign_counseling_case_to_campus_lead(uuid, uuid, text) from public, anon;
grant execute on function public.assign_counseling_case_to_campus_lead(uuid, uuid, text) to authenticated;
