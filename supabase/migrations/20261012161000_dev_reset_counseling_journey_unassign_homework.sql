-- Preserve append-only Homework audit references while marking retained
-- assignment shells inactive after their participant data and revisions are erased.
alter function public.reset_counseling_journey(uuid, text)
  rename to reset_counseling_journey_impl;
revoke execute on function public.reset_counseling_journey_impl(uuid, text)
  from public, anon, authenticated;

create function public.reset_counseling_journey(
  target_case_id uuid,
  reset_confirmation text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
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

  perform public.reset_counseling_journey_impl(target_case_id, reset_confirmation);

  update public.homework_assignments assignment
  set unassigned_at = now(), unassigned_by = actor
  where assignment.counseling_case_id = target_case_id
    and assignment.unassigned_at is null
    and exists (
      select 1 from public.homework_audit_events event
      where event.homework_assignment_id = assignment.id
    );
end;
$$;

revoke execute on function public.reset_counseling_journey(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reset_counseling_journey(uuid, text) to authenticated;
