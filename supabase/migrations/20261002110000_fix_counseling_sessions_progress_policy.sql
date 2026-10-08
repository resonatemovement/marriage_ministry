create or replace function private.current_user_can_manage_homework_assignment_revision(target_revision_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.homework_assignment_revisions revision
    join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
    where revision.id = target_revision_id
      and private.current_user_can_manage_counseling_case(assignment.counseling_case_id)
  );
$$;

drop policy homework_progress_care_team_read on public.homework_participant_progress;
create policy homework_progress_care_team_read on public.homework_participant_progress for select to authenticated
using ((select private.current_user_can_manage_homework_assignment_revision(assignment_revision_id)));
