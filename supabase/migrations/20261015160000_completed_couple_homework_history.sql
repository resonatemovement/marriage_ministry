create or replace function private.current_user_can_read_released_couple_homework_version(target_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and private.current_user_has_role(array['couple']::public.app_role[])
    and exists (
      select 1
      from public.homework_assignment_revisions revision
      join public.homework_participant_progress progress
        on progress.assignment_revision_id = revision.id
       and progress.profile_id = auth.uid()
      join public.case_sessions case_session
        on case_session.homework_assignment_revision_id = revision.id
      where revision.homework_version_id = target_version_id
        and case_session.status in ('active', 'completed')
        and private.current_user_can_access_case(case_session.counseling_case_id)
    );
$$;

drop policy homework_versions_couple_current_read on public.homework_versions;
create policy homework_versions_couple_released_read on public.homework_versions
for select to authenticated
using ((select private.current_user_can_read_released_couple_homework_version(id)));

drop policy homework_version_blocks_couple_current_read on public.homework_version_blocks;
create policy homework_version_blocks_couple_released_read on public.homework_version_blocks
for select to authenticated
using ((select private.current_user_can_read_released_couple_homework_version(homework_version_id)));

revoke all on function private.current_user_can_read_released_couple_homework_version(uuid) from public, anon;
grant execute on function private.current_user_can_read_released_couple_homework_version(uuid) to authenticated;
