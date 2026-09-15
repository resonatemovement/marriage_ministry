grant select on public.campus_lead_coach_assignments to authenticated;

create policy campus_lead_coach_assignments_read_authorized
on public.campus_lead_coach_assignments
for select to authenticated
using (
  (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
  or exists (
    select 1 from public.group_members membership
    where membership.group_id = campus_lead_coach_assignments.campus_lead_group_id
      and membership.profile_id = (select auth.uid())
      and membership.ended_at is null
      and (select private.current_user_has_role(array['campus_lead']::public.app_role[]))
  )
);
