create or replace function private.current_user_can_read_homework_assignment(target_assignment_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])
    or exists (
      select 1
      from public.homework_assignment_revisions revision
      join public.homework_participant_progress progress on progress.assignment_revision_id = revision.id
      where revision.homework_assignment_id = target_assignment_id
        and progress.profile_id = auth.uid()
    );
$$;

create or replace function private.current_user_can_read_homework_assignment_revision(target_revision_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])
    or exists (
      select 1 from public.homework_participant_progress progress
      where progress.assignment_revision_id = target_revision_id
        and progress.profile_id = auth.uid()
    );
$$;

drop policy homework_assignment_admin_read on public.homework_assignments;
create policy homework_assignment_admin_read on public.homework_assignments for select to authenticated
using ((select private.current_user_can_read_homework_assignment(id)));

drop policy homework_revision_admin_read on public.homework_assignment_revisions;
create policy homework_revision_admin_read on public.homework_assignment_revisions for select to authenticated
using ((select private.current_user_can_read_homework_assignment_revision(id)));
