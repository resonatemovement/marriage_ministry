create table public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  notification_type text not null,
  title text not null,
  message text not null,
  case_session_id uuid not null references public.case_sessions(id) on delete restrict,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint in_app_notifications_type_valid check (notification_type = 'homework_reopened'),
  constraint in_app_notifications_title_valid check (title = 'Homework Reopened'),
  constraint in_app_notifications_message_not_blank check (btrim(message) <> '')
);

create index in_app_notifications_recipient_created_idx
  on public.in_app_notifications (recipient_profile_id, created_at desc);

alter table public.in_app_notifications enable row level security;
revoke all on public.in_app_notifications from public, anon, authenticated;
grant select on public.in_app_notifications to authenticated;

create policy in_app_notifications_recipient_read
  on public.in_app_notifications for select to authenticated
  using (recipient_profile_id = (select auth.uid()));

create or replace function private.current_user_can_reopen_homework_case(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and not exists (
      select 1
      from public.counseling_cases counseling_case
      join public.group_members couple_membership
        on couple_membership.group_id = counseling_case.couple_group_id
       and couple_membership.profile_id = (select auth.uid())
       and couple_membership.ended_at is null
      where counseling_case.id = target_case_id
    )
    and (
      private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])
      or (
        private.current_user_has_role(array['counselor']::public.app_role[])
        and exists (
          select 1
          from public.case_assignments assignment
          join public.groups counselor_team
            on counselor_team.id = assignment.assigned_group_id
           and counselor_team.group_type = 'counselor_team'
           and counselor_team.active
          join public.group_members counselor_membership
            on counselor_membership.group_id = counselor_team.id
           and counselor_membership.profile_id = (select auth.uid())
           and counselor_membership.ended_at is null
          where assignment.counseling_case_id = target_case_id
            and assignment.assignment_type = 'counselor'
            and assignment.ended_at is null
        )
      )
    );
$$;
revoke all on function private.current_user_can_reopen_homework_case(uuid) from public, anon, authenticated;

create or replace function public.get_homework_reopen_eligibility(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_user_can_reopen_homework_case(target_case_id)
    and exists (
      select 1
      from public.counseling_cases counseling_case
      join public.case_sessions case_session
        on case_session.counseling_case_id = counseling_case.id
       and case_session.status = 'active'
      join public.homework_assignments assignment
        on assignment.counseling_case_id = counseling_case.id
       and assignment.unassigned_at is null
      join public.homework_assignment_revisions revision
        on revision.homework_assignment_id = assignment.id
       and revision.ended_at is null
       and revision.id = case_session.homework_assignment_revision_id
      join public.homework_participant_progress progress
        on progress.assignment_revision_id = revision.id
       and progress.status in ('submitted', 'reviewed')
       and progress.submitted_at is not null
      where counseling_case.id = target_case_id
        and counseling_case.status = 'active'
        and counseling_case.closed_at is null
    );
$$;
revoke all on function public.get_homework_reopen_eligibility(uuid) from public, anon;
grant execute on function public.get_homework_reopen_eligibility(uuid) to authenticated;

create or replace function public.reopen_participant_homework(
  target_case_id uuid,
  target_progress_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  homework_row record;
begin
  if actor is null or not private.current_user_can_reopen_homework_case(target_case_id) then
    raise exception 'Homework is unavailable';
  end if;

  select
    counseling_case.id as case_id,
    case_session.id as case_session_id,
    assignment.id as assignment_id,
    assignment.homework_id,
    revision.homework_version_id,
    progress.id as progress_id,
    progress.profile_id,
    progress.status
  into homework_row
  from public.counseling_cases counseling_case
  join public.case_sessions case_session
    on case_session.counseling_case_id = counseling_case.id
   and case_session.status = 'active'
  join public.homework_assignments assignment
    on assignment.counseling_case_id = counseling_case.id
   and assignment.unassigned_at is null
  join public.homework_assignment_revisions revision
    on revision.homework_assignment_id = assignment.id
   and revision.ended_at is null
   and revision.id = case_session.homework_assignment_revision_id
  join public.homework_participant_progress progress
    on progress.assignment_revision_id = revision.id
   and progress.id = target_progress_id
  where counseling_case.id = target_case_id
    and counseling_case.status = 'active'
    and counseling_case.closed_at is null
  for update of counseling_case, case_session, assignment, revision, progress;

  if not found or homework_row.status not in ('submitted', 'reviewed') then
    raise exception 'Homework is unavailable';
  end if;

  update public.homework_participant_progress
  set status = 'in_progress', submitted_at = null, reviewed_at = null
  where id = homework_row.progress_id;

  insert into public.homework_audit_events (
    homework_id, homework_assignment_id, actor_profile_id, event_type, from_version_id, to_version_id, metadata
  ) values (
    homework_row.homework_id,
    homework_row.assignment_id,
    actor,
    'homework_reopened',
    homework_row.homework_version_id,
    homework_row.homework_version_id,
    jsonb_build_object(
      'counseling_case_id', homework_row.case_id,
      'case_session_id', homework_row.case_session_id,
      'participant_progress_id', homework_row.progress_id,
      'recipient_profile_id', homework_row.profile_id,
      'from_status', homework_row.status,
      'to_status', 'in_progress'
    )
  );

  insert into public.in_app_notifications (
    recipient_profile_id, notification_type, title, message, case_session_id
  ) values (
    homework_row.profile_id,
    'homework_reopened',
    'Homework Reopened',
    'Your previous answers are preserved. Please review them and resubmit your Homework.',
    homework_row.case_session_id
  );

  return homework_row.case_session_id;
end;
$$;
revoke all on function public.reopen_participant_homework(uuid, uuid) from public, anon;
grant execute on function public.reopen_participant_homework(uuid, uuid) to authenticated;

create or replace function public.mark_in_app_notification_read(target_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authorized'; end if;
  update public.in_app_notifications
  set read_at = now()
  where id = target_notification_id
    and recipient_profile_id = auth.uid()
    and read_at is null;
  return found;
end;
$$;
revoke all on function public.mark_in_app_notification_read(uuid) from public, anon;
grant execute on function public.mark_in_app_notification_read(uuid) to authenticated;
