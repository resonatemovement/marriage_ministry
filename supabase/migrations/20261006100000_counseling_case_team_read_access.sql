-- The Couple Detail read-only team card needs only the assigned team names for
-- cases already authorized by the existing Counseling Workspace care-team helper.
create policy case_assignments_care_team_read on public.case_assignments for select to authenticated
using ((select private.current_user_can_manage_counseling_case(counseling_case_id)));

create policy groups_counseling_case_team_read on public.groups for select to authenticated
using (
  exists (
    select 1
    from public.case_assignments assignment
    where assignment.assigned_group_id = groups.id
      and assignment.ended_at is null
      and (select private.current_user_can_manage_counseling_case(assignment.counseling_case_id))
  )
);
