create table public.case_session_meetings (
  id uuid primary key default gen_random_uuid(),
  counseling_case_id uuid not null references public.counseling_cases(id) on delete restrict,
  session_id uuid references public.sessions(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  scheduled_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint case_session_meetings_time_order check (ends_at > starts_at),
  constraint case_session_meetings_location_not_blank check (btrim(location) <> '')
);

create unique index case_session_meetings_initial_unique_idx on public.case_session_meetings (counseling_case_id) where session_id is null;
create unique index case_session_meetings_session_unique_idx on public.case_session_meetings (counseling_case_id, session_id) where session_id is not null;
create index case_session_meetings_case_starts_idx on public.case_session_meetings (counseling_case_id, starts_at desc);
create trigger set_case_session_meetings_updated_at before update on public.case_session_meetings for each row execute function private.set_updated_at();

create or replace function private.current_user_can_manage_counseling_case(target_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    (private.current_user_has_role(array['campus_lead']::public.app_role[]) and exists (
      select 1 from public.counseling_cases c where c.id = target_case_id and private.current_user_oversees_campus(c.campus_id)
    )) or exists (
      select 1 from public.case_assignments a join public.group_members m on m.group_id = a.assigned_group_id and m.profile_id = auth.uid() and m.ended_at is null
      where a.counseling_case_id = target_case_id and a.assignment_type = 'counselor' and a.ended_at is null
        and ((a.assigned_group_id is not null and private.current_user_has_role(array['coach', 'counselor', 'campus_lead']::public.app_role[])))
    )
  );
$$;

create or replace function private.case_session_homework_complete(target_case_id uuid, target_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.homework_assignments a
    join public.homeworks h on h.id = a.homework_id and h.session_id = target_session_id
    join public.homework_assignment_revisions r on r.homework_assignment_id = a.id and r.ended_at is null
    where a.counseling_case_id = target_case_id and a.unassigned_at is null
      and (select count(*) from public.homework_participant_progress p where p.assignment_revision_id = r.id) = 2
      and not exists (select 1 from public.homework_participant_progress p where p.assignment_revision_id = r.id and p.status not in ('submitted', 'reviewed'))
  );
$$;

create or replace function private.activate_case_session_homework(target_case_id uuid, target_session_id uuid, actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare homework_id uuid; version_id uuid; assignment_id uuid; revision_id uuid;
begin
  select h.id, v.id into homework_id, version_id
  from public.homeworks h join public.homework_versions v on v.homework_id = h.id and v.status = 'published'
  where h.session_id = target_session_id and h.withdrawn_at is null
  order by v.version_number desc limit 1;
  if homework_id is null then raise exception 'This Session needs published Homework before it can be scheduled'; end if;
  insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
  values (homework_id, target_case_id, actor_id)
  on conflict (homework_id, counseling_case_id) where unassigned_at is null do update set updated_at = now()
  returning id into assignment_id;
  select id into revision_id from public.homework_assignment_revisions where homework_assignment_id = assignment_id and ended_at is null;
  if revision_id is null then
    insert into public.homework_assignment_revisions(homework_assignment_id, homework_version_id, updated_by)
    values (assignment_id, version_id, actor_id) returning id into revision_id;
    perform private.create_homework_progress(revision_id);
  end if;
end;
$$;

create or replace function public.schedule_case_session_meeting(
  target_case_id uuid, target_session_id uuid, target_starts_at timestamptz, target_ends_at timestamptz, target_location text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); meeting_id uuid; current_session_id uuid; current_sequence integer; next_session_id uuid;
begin
  if not private.current_user_can_manage_counseling_case(target_case_id) then raise exception 'Not authorized'; end if;
  if target_ends_at <= target_starts_at or btrim(coalesce(target_location, '')) = '' then raise exception 'Enter a valid meeting time and location'; end if;
  perform 1 from public.counseling_cases where id = target_case_id and closed_at is null for update;
  if not found then raise exception 'This counseling case is closed or unavailable'; end if;

  select id into meeting_id from public.case_session_meetings where counseling_case_id = target_case_id and session_id is not distinct from target_session_id for update;
  if meeting_id is not null then
    update public.case_session_meetings set starts_at = target_starts_at, ends_at = target_ends_at, location = btrim(target_location), scheduled_by = actor where id = meeting_id;
    return meeting_id;
  end if;
  if target_session_id is null then
    insert into public.case_session_meetings(counseling_case_id, session_id, starts_at, ends_at, location, scheduled_by)
    values(target_case_id, null, target_starts_at, target_ends_at, btrim(target_location), actor) returning id into meeting_id;
    return meeting_id;
  end if;

  select m.session_id, s.sequence_number into current_session_id, current_sequence
  from public.case_session_meetings m join public.sessions s on s.id = m.session_id
  where m.counseling_case_id = target_case_id and m.session_id is not null order by s.sequence_number desc limit 1 for update;
  if current_session_id is not null and not private.case_session_homework_complete(target_case_id, current_session_id) then raise exception 'Complete the current Session Homework before scheduling the next meeting'; end if;
  select id into next_session_id from public.sessions where status = 'published' and sequence_number > coalesce(current_sequence, -1) order by sequence_number limit 1;
  if next_session_id is null or next_session_id <> target_session_id then raise exception 'Meetings must be scheduled in Session order'; end if;
  perform private.activate_case_session_homework(target_case_id, target_session_id, actor);
  insert into public.case_session_meetings(counseling_case_id, session_id, starts_at, ends_at, location, scheduled_by)
  values(target_case_id, target_session_id, target_starts_at, target_ends_at, btrim(target_location), actor) returning id into meeting_id;
  update public.counseling_cases set status = case when status in ('requested', 'assessment', 'interviewed', 'matched') then 'active' else status end where id = target_case_id;
  insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason)
  select id, status, 'active', actor, 'Session meeting scheduled' from public.counseling_cases where id = target_case_id and status = 'active';
  return meeting_id;
end;
$$;

create or replace function public.close_counseling_case(target_case_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current_session_id uuid; last_session_id uuid; prior_status public.case_status;
begin
  if not private.current_user_can_manage_counseling_case(target_case_id) then raise exception 'Not authorized'; end if;
  select status into prior_status from public.counseling_cases where id = target_case_id and closed_at is null for update;
  if prior_status is null then raise exception 'This counseling case is closed or unavailable'; end if;
  select m.session_id into current_session_id from public.case_session_meetings m join public.sessions s on s.id = m.session_id where m.counseling_case_id = target_case_id and m.session_id is not null order by s.sequence_number desc limit 1;
  select id into last_session_id from public.sessions where status = 'published' order by sequence_number desc limit 1;
  if current_session_id is null or current_session_id <> last_session_id or not private.case_session_homework_complete(target_case_id, current_session_id) then raise exception 'Only completed final-session Homework can close this case'; end if;
  update public.counseling_cases set status = 'finished', closed_at = now() where id = target_case_id;
  insert into public.case_status_history(counseling_case_id, from_status, to_status, changed_by, reason) values (target_case_id, prior_status, 'finished', actor, 'Final Session Homework complete');
end;
$$;

alter table public.case_session_meetings enable row level security;
revoke all on public.case_session_meetings from anon, authenticated;
grant select on public.case_session_meetings to authenticated;
grant all on public.case_session_meetings to service_role;
create policy case_session_meetings_read_authorized on public.case_session_meetings for select to authenticated using ((select private.current_user_can_access_case(counseling_case_id)));
create policy sessions_counseling_team_read on public.sessions for select to authenticated using (status = 'published' and private.current_user_has_role(array['campus_lead', 'coach', 'counselor']::public.app_role[]));
create policy homework_assignments_care_team_read on public.homework_assignments for select to authenticated using ((select private.current_user_can_manage_counseling_case(counseling_case_id)));
create policy homework_revisions_care_team_read on public.homework_assignment_revisions for select to authenticated using (exists (select 1 from public.homework_assignments a where a.id = homework_assignment_id and private.current_user_can_manage_counseling_case(a.counseling_case_id)));
create policy homework_progress_care_team_read on public.homework_participant_progress for select to authenticated using (exists (select 1 from public.homework_assignment_revisions r join public.homework_assignments a on a.id = r.homework_assignment_id where r.id = assignment_revision_id and private.current_user_can_manage_counseling_case(a.counseling_case_id)));
grant execute on function public.schedule_case_session_meeting(uuid, uuid, timestamptz, timestamptz, text), public.close_counseling_case(uuid) to authenticated;
