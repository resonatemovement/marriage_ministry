-- Keep Homework audit rows append-only during normal use. The DEV reset may
-- remove only assignment-linked audit rows for its locked, explicitly scoped
-- counseling case so the journey's Homework assignments can be fully deleted.
create or replace function private.validate_homework_audit_ownership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  reset_case_id uuid := nullif(current_setting('app.dev_reset_counseling_case_id', true), '')::uuid;
begin
  if tg_op = 'DELETE' then
    if reset_case_id is not null
       and reset_case_id = (select assignment.counseling_case_id
         from public.homework_assignments assignment
         where assignment.id = old.homework_assignment_id)
       and auth.jwt() ->> 'iss' = 'https://lctkqjjkhpyootwvttvj.supabase.co/auth/v1'
       and private.current_user_has_role(array['super_admin']::public.app_role[]) then
      return old;
    end if;
    raise exception 'Homework audit events are append-only';
  end if;
  if tg_op = 'UPDATE' then raise exception 'Homework audit events are append-only'; end if;

  if (new.homework_assignment_id is not null and not exists (
        select 1 from public.homework_assignments assignment
        where assignment.id = new.homework_assignment_id and assignment.homework_id = new.homework_id
      ))
     or (new.from_version_id is not null and not exists (
        select 1 from public.homework_versions version_row
        where version_row.id = new.from_version_id and version_row.homework_id = new.homework_id
      ))
     or (new.to_version_id is not null and not exists (
        select 1 from public.homework_versions version_row
        where version_row.id = new.to_version_id and version_row.homework_id = new.homework_id
      )) then
    raise exception 'Homework audit references must belong to the event Homework';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_homework_audit_ownership() from public, anon, authenticated;

create or replace function public.reset_counseling_journey(
  target_case_id uuid,
  reset_confirmation text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  lifecycle_session_ids uuid[];
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

  select coalesce(array_agg(session_row.id), array[]::uuid[])
  into lifecycle_session_ids
  from public.case_sessions session_row
  where session_row.counseling_case_id = target_case_id;

  perform public.reset_counseling_journey_impl(target_case_id, reset_confirmation);

  -- Clear only test-run override audit rows tied to this case's Couple Sessions.
  delete from public.audit_events event
  where event.entity_type = 'case_session'
    and event.entity_id = any(lifecycle_session_ids);

  -- Permit the immutable Homework-audit trigger to pass only for this exact
  -- DEV Super Admin reset, then remove all case assignments and their audit rows.
  perform set_config('app.dev_reset_counseling_case_id', target_case_id::text, true);
  delete from public.homework_audit_events event
  using public.homework_assignments assignment
  where event.homework_assignment_id = assignment.id
    and assignment.counseling_case_id = target_case_id;
  perform set_config('app.dev_reset_counseling_case_id', '', true);

  delete from public.homework_assignments assignment
  where assignment.counseling_case_id = target_case_id;
end;
$$;

revoke execute on function public.reset_counseling_journey(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reset_counseling_journey(uuid, text) to authenticated;
