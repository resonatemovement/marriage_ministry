-- DEV-only testing capability for linked project lctkqjjkhpyootwvttvj.
-- The JWT issuer check also makes this function reject tokens from PROD if the
-- migration is ever accidentally applied there.
create or replace function public.reset_counseling_journey(
  target_case_id uuid,
  reset_confirmation text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_status public.case_status;
begin
  if actor is null or not private.current_user_has_role(array['super_admin']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;
  if auth.jwt() ->> 'iss' is distinct from 'https://lctkqjjkhpyootwvttvj.supabase.co/auth/v1' then
    raise exception 'Counseling journey reset is available only in DEV';
  end if;
  if reset_confirmation is distinct from 'RESET' then
    raise exception 'Type exact uppercase RESET to continue';
  end if;

  select status into current_status
  from public.counseling_cases
  where id = target_case_id
  for update;
  if not found then raise exception 'Counseling case is unavailable'; end if;
  if current_status not in ('matched', 'active', 'pending_final', 'finished', 'inactive') then
    raise exception 'Only a matched or previously active counseling case can be reset';
  end if;

  -- Remove delivery records tied to lifecycle entities before removing the entities.
  delete from public.notification_deliveries delivery
  where (delivery.related_entity_type = 'counseling_case' and delivery.related_entity_id = target_case_id)
    or (delivery.related_entity_type = 'case_session' and delivery.related_entity_id in (
      select couple_session.id from public.case_sessions couple_session
      where couple_session.counseling_case_id = target_case_id
    ))
    or (delivery.related_entity_type = 'case_session_meeting' and delivery.related_entity_id in (
      select meeting.id from public.case_session_meetings meeting
      where meeting.counseling_case_id = target_case_id
    ));

  delete from public.case_session_meetings
  where counseling_case_id = target_case_id;
  delete from public.case_session_material_blocks material
  using public.case_sessions couple_session
  where material.case_session_id = couple_session.id
    and couple_session.counseling_case_id = target_case_id;
  delete from public.case_sessions
  where counseling_case_id = target_case_id;

  -- Clear participant responses and progress before removing pinned revisions.
  delete from public.homework_answers answer
  where answer.participant_progress_id in (
    select progress.id
    from public.homework_participant_progress progress
    join public.homework_assignment_revisions revision on revision.id = progress.assignment_revision_id
    join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
    where assignment.counseling_case_id = target_case_id
  );
  delete from public.homework_participant_progress progress
  where progress.assignment_revision_id in (
    select revision.id
    from public.homework_assignment_revisions revision
    join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
    where assignment.counseling_case_id = target_case_id
  );
  delete from public.homework_assignment_revisions revision
  using public.homework_assignments assignment
  where revision.homework_assignment_id = assignment.id
    and assignment.counseling_case_id = target_case_id;

  -- Homework audit events are append-only and reference assignment IDs; the
  -- assignment identity itself is immutable. Retain audited shells with no
  -- revision, so release queries cannot expose them, and remove unaudited rows.
  delete from public.homework_assignments assignment
  where assignment.counseling_case_id = target_case_id
    and not exists (
      select 1 from public.homework_audit_events event
      where event.homework_assignment_id = assignment.id
    );

  -- Preserve the pre-session status trail through the latest matched transition;
  -- remove only lifecycle status changes after that point, without adding history.
  delete from public.case_status_history history
  where history.counseling_case_id = target_case_id
    and history.id > coalesce((
      select max(matched.id)
      from public.case_status_history matched
      where matched.counseling_case_id = target_case_id and matched.to_status = 'matched'
    ), 0);

  update public.counseling_cases
  set status = 'matched', closed_at = null
  where id = target_case_id;
end;
$$;

revoke execute on function public.reset_counseling_journey(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_counseling_journey(uuid, text) to authenticated;
