create or replace function public.assign_counseling_case(
  target_case_id uuid,
  target_group_id uuid,
  target_assignment_type public.case_assignment_type,
  reassignment_reason text default 'Reassigned by administrator'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target_campus uuid;
  target_group_type public.group_type;
  new_assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then raise exception 'Only an Admin or Super Admin may assign counseling cases'; end if;
  select campus_id into target_campus from public.counseling_cases where id = target_case_id for update;
  if target_campus is null then raise exception 'Counseling case not found'; end if;
  select group_type into target_group_type from public.groups where id = target_group_id and campus_id = target_campus and active;
  if target_assignment_type = 'counselor' then
    if target_group_type not in ('counselor_team', 'coach_team', 'campus_lead_team') then raise exception 'Choose an active same-campus Counselor, Coach, or Campus Lead team'; end if;
  elsif target_assignment_type = 'coach' then
    if target_group_type <> 'coach_team' then raise exception 'Choose an active same-campus Coach team'; end if;
  else
    if target_group_type <> 'campus_lead_team' then raise exception 'Choose an active same-campus Campus Lead team'; end if;
  end if;
  update public.case_assignments set ended_at = now(), end_reason = coalesce(nullif(btrim(reassignment_reason), ''), 'Reassigned by administrator') where counseling_case_id = target_case_id and assignment_type = target_assignment_type and ended_at is null;
  insert into public.case_assignments (counseling_case_id, assigned_group_id, assignment_type, assigned_by) values (target_case_id, target_group_id, target_assignment_type, actor) returning id into new_assignment_id;
  update public.counseling_cases set status = 'matched' where id = target_case_id and status in ('requested', 'assessment', 'interviewed');
  insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details) values (actor,'case.assigned','counseling_case',target_case_id,jsonb_build_object('assignment_id',new_assignment_id,'assignment_type',target_assignment_type,'group_id',target_group_id));
  return new_assignment_id;
end;
$$;

create or replace function public.assign_counseling_case_as_campus_lead(target_case_id uuid, target_group_id uuid, target_assignment_type public.case_assignment_type, reassignment_reason text default 'Reassigned by Campus Lead')
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_campus uuid; own_team_id uuid; target_group_type public.group_type; new_assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['campus_lead']::public.app_role[]) then raise exception 'Only an active Campus Lead may use this assignment path'; end if;
  select campus_id into target_campus from public.counseling_cases where id = target_case_id for update;
  if target_campus is null or not private.current_user_oversees_campus(target_campus) then raise exception 'Counseling case is outside the Campus Lead scope'; end if;
  if target_assignment_type = 'counselor' then
    select group_type into target_group_type from public.groups where id = target_group_id and campus_id = target_campus and active;
    if target_group_type not in ('counselor_team', 'coach_team', 'campus_lead_team') then raise exception 'Choose an active same-campus Counselor, Coach, or Campus Lead team'; end if;
  elsif target_assignment_type = 'campus_lead' then
    select team.id into own_team_id from public.groups team join public.group_members membership on membership.group_id = team.id and membership.profile_id = actor and membership.ended_at is null where team.group_type = 'campus_lead_team' and team.campus_id = target_campus and team.active;
    if own_team_id is null or (target_group_id is not null and target_group_id <> own_team_id) then raise exception 'Campus Lead team assignment is not available'; end if;
    target_group_id := own_team_id;
  else
    raise exception 'Unsupported assignment target';
  end if;
  update public.case_assignments set ended_at = now(), end_reason = coalesce(nullif(btrim(reassignment_reason), ''), 'Reassigned by Campus Lead') where counseling_case_id = target_case_id and assignment_type = target_assignment_type and ended_at is null;
  insert into public.case_assignments (counseling_case_id, assigned_group_id, assignment_type, assigned_by) values (target_case_id, target_group_id, target_assignment_type, actor) returning id into new_assignment_id;
  update public.counseling_cases set status = 'matched' where id = target_case_id and status in ('requested', 'assessment', 'interviewed');
  insert into public.audit_events (actor_id,event_type,entity_type,entity_id,details) values (actor,'case.assigned','counseling_case',target_case_id,jsonb_build_object('assignment_id',new_assignment_id,'assignment_type',target_assignment_type,'group_id',target_group_id));
  return new_assignment_id;
end;
$$;
