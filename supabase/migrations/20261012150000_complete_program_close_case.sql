drop function public.close_counseling_case(uuid);

create or replace function public.complete_counseling_program(
  target_case_session_id uuid,
  override_confirmation text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  target_case_id uuid;
  prior_status public.case_status;
  current_session public.case_sessions%rowtype;
  current_meeting_id uuid;
  total_partner_count integer;
  submitted_partner_count integer;
  is_admin boolean;
begin
  select counseling_case_id into target_case_id
  from public.case_sessions where id = target_case_session_id;
  is_admin := private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]);
  if target_case_id is null or not (
    private.current_user_can_manage_counseling_case(target_case_id)
    or (is_admin and exists (select 1 from public.counseling_cases c where c.id = target_case_id))
  ) then raise exception 'Not authorized'; end if;

  select status into prior_status from public.counseling_cases
  where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select * into current_session from public.case_sessions
  where id = target_case_session_id and counseling_case_id = target_case_id and status = 'active'
  for update;
  if not found then raise exception 'The Couple Session is no longer active'; end if;

  select count(*)::integer, (array_agg(id order by starts_at desc))[1]
  into total_partner_count, current_meeting_id
  from public.case_session_meetings
  where case_session_id = target_case_session_id and completed_at is null;
  if total_partner_count <> 1 then raise exception 'The active Session must have exactly one scheduled Meeting'; end if;

  select count(*)::integer, count(*) filter (where p.status in ('submitted', 'reviewed'))::integer
  into total_partner_count, submitted_partner_count
  from public.homework_participant_progress p
  where p.assignment_revision_id = current_session.homework_assignment_revision_id;
  if total_partner_count <> 2 then raise exception 'Required Homework progress for both partners is unavailable'; end if;
  if submitted_partner_count <> 2 then
    if not is_admin or override_confirmation is distinct from 'OVERRIDE' then
      raise exception 'Both partners must submit Homework. Admin or Super Admin may type OVERRIDE to continue.';
    end if;
  elsif override_confirmation is not null then
    raise exception 'OVERRIDE is only accepted when required Homework is incomplete';
  end if;

  update public.case_sessions
  set status = 'completed', completed_at = transition_at, completed_by = actor
  where id = target_case_session_id;
  update public.case_session_meetings
  set completed_at = transition_at, completed_by = actor
  where id = current_meeting_id;
  update public.counseling_cases
  set status = 'finished', closed_at = transition_at
  where id = target_case_id;
  insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason)
  values (target_case_id, prior_status, 'finished', actor, 'Counseling program completed');

  if submitted_partner_count <> 2 then
    insert into public.audit_events(actor_id, event_type, entity_type, entity_id, details)
    values(actor, 'case_session.homework_override', 'case_session', target_case_session_id,
      jsonb_build_object('homework_assignment_revision_id', current_session.homework_assignment_revision_id,
        'incomplete_partner_count', total_partner_count - submitted_partner_count,
        'operation', 'complete_program'));
  end if;
end;
$$;

create or replace function public.close_counseling_case_incomplete(
  target_case_session_id uuid,
  closure_reason text default null,
  closure_notes text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  transition_at timestamptz := now();
  target_case_id uuid;
  prior_status public.case_status;
  current_session public.case_sessions%rowtype;
  is_admin boolean;
  normalized_reason text := nullif(btrim(closure_reason), '');
  normalized_notes text := nullif(btrim(closure_notes), '');
  history_reason text;
begin
  select counseling_case_id into target_case_id
  from public.case_sessions where id = target_case_session_id;
  is_admin := private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]);
  if target_case_id is null or not (
    private.current_user_can_manage_counseling_case(target_case_id)
    or (is_admin and exists (select 1 from public.counseling_cases c where c.id = target_case_id))
  ) then raise exception 'Not authorized'; end if;

  select status into prior_status from public.counseling_cases
  where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select * into current_session from public.case_sessions
  where id = target_case_session_id and counseling_case_id = target_case_id and status = 'active'
  for update;
  if not found then raise exception 'The Couple Session is no longer active'; end if;

  if normalized_reason is null then
    if not is_admin then raise exception 'Select a reason for closing this counseling case'; end if;
    history_reason := 'Administrative closure (reason not provided)';
  else
    if normalized_reason not in (
      'Couple withdrew', 'Unable to contact couple', 'Couple relocated',
      'Referred elsewhere', 'Counseling relationship ended', 'Other'
    ) then raise exception 'Select a valid counseling case closure reason'; end if;
    if normalized_reason = 'Other' and normalized_notes is null then
      raise exception 'Add notes when the closure reason is Other';
    end if;
    history_reason := case when normalized_reason = 'Other'
      then 'Other: ' || normalized_notes else normalized_reason end;
  end if;

  update public.case_sessions
  set status = 'completed', completed_at = transition_at, completed_by = actor
  where id = target_case_session_id;
  update public.case_session_meetings
  set completed_at = transition_at, completed_by = actor
  where case_session_id = target_case_session_id and completed_at is null;
  update public.counseling_cases
  set status = 'inactive', closed_at = transition_at
  where id = target_case_id;
  insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason)
  values (target_case_id, prior_status, 'inactive', actor, history_reason);
end;
$$;

revoke execute on function public.complete_counseling_program(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_counseling_program(uuid, text) to authenticated;
revoke execute on function public.close_counseling_case_incomplete(uuid, text, text) from public, anon, authenticated;
grant execute on function public.close_counseling_case_incomplete(uuid, text, text) to authenticated;
