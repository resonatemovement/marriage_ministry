alter table public.sessions
  add column is_final boolean not null default false;

alter table public.case_sessions
  add column is_final boolean not null default false;

create function private.snapshot_case_session_finality()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.is_final into new.is_final
  from public.sessions s
  where s.id = new.session_id;
  if not found then raise exception 'Session is unavailable'; end if;
  return new;
end;
$$;

create trigger case_sessions_snapshot_finality
before insert on public.case_sessions
for each row execute function private.snapshot_case_session_finality();

create function private.prevent_case_session_finality_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_final is distinct from old.is_final then
    raise exception 'Assigned Session finality is immutable';
  end if;
  return new;
end;
$$;

create trigger case_sessions_finality_immutable
before update of is_final on public.case_sessions
for each row execute function private.prevent_case_session_finality_change();

revoke execute on function private.snapshot_case_session_finality() from public, anon, authenticated;
revoke execute on function private.prevent_case_session_finality_change() from public, anon, authenticated;

-- Extend the existing authoring transaction so the explicit designation is saved
-- atomically with Session and Homework edits, under the same role authorization.
create function public.save_session_homework_authoring_state(
  target_session_id uuid,
  target_title text,
  target_material jsonb,
  save_session boolean,
  target_homework_version_id uuid,
  target_homework_blocks jsonb,
  save_homework boolean,
  publish_homework boolean,
  target_session_intent text,
  target_is_final boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result jsonb;
  resolved_session_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin','admin','author']::public.app_role[]) then
    raise exception 'Not authorized';
  end if;

  result := public.save_session_homework_authoring_state(
    target_session_id, target_title, target_material, save_session,
    target_homework_version_id, target_homework_blocks, save_homework,
    publish_homework, target_session_intent
  );
  resolved_session_id := coalesce(target_session_id, (result #>> '{session,session_id}')::uuid);
  if resolved_session_id is null then raise exception 'Session is unavailable'; end if;

  update public.sessions
  set is_final = target_is_final
  where id = resolved_session_id and status <> 'archived';
  if not found then raise exception 'Session is unavailable'; end if;

  if save_session or target_session_intent = 'publish' then
    result := jsonb_set(result, '{session}',
      (result -> 'session') || jsonb_build_object('is_final', target_is_final), true);
  end if;
  return result;
end;
$$;

revoke all on function public.save_session_homework_authoring_state(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text,boolean) from public, anon;
grant execute on function public.save_session_homework_authoring_state(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text,boolean) to authenticated;

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
  if not current_session.is_final then
    raise exception 'Only an explicitly designated Final Session can complete the counseling program';
  end if;

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
