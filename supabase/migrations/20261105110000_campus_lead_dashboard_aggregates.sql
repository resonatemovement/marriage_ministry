create or replace function public.get_campus_lead_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null
    or not private.current_user_has_role(array['campus_lead']::public.app_role[])
    or private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]) then
    raise exception 'Not authorized to view Campus Lead dashboard metrics';
  end if;

  return (
    with scoped_couples as (
      select couple.id, couple.campus_id, counseling_case.id as case_id, counseling_case.status,
        exists (
          select 1 from public.case_assignments assignment
          where assignment.counseling_case_id = counseling_case.id
            and assignment.assignment_type = 'counselor'
            and assignment.ended_at is null
        ) as has_counselor
      from public.campus_lead_assignments scope
      join public.campuses campus on campus.id = scope.campus_id and campus.active
      join public.groups couple on couple.campus_id = campus.id and couple.active and couple.group_type = 'couple'
      left join public.counseling_cases counseling_case on counseling_case.couple_group_id = couple.id
      where scope.profile_id = actor and scope.ended_at is null
    ),
    couple_counts as (
      select
        count(*) filter (where case_id is null or not has_counselor)::integer as unassigned_couples,
        count(*) filter (where status = 'active')::integer as active_couples,
        count(*) filter (where status = 'finished')::integer as completed_couples,
        count(case_id)::integer as current_cases
      from scoped_couples
    ),
    intake_counts as (
      select count(*)::integer as under_review_intakes
      from public.intake_requests request
      where request.status = 'under_review'
        and exists (
          select 1 from public.campus_lead_assignments scope
          join public.campuses campus on campus.id = scope.campus_id and campus.active
          where scope.profile_id = actor and scope.ended_at is null and scope.campus_id = request.campus_id
        )
    ),
    workflow as (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', case_count) order by position), '[]'::jsonb) as stages
      from (values
        (1, 'requested'::text), (2, 'assessment'), (3, 'interviewed'), (4, 'matched'),
        (5, 'active'), (6, 'finished'), (7, 'referred'), (8, 'inactive')
      ) as stage(position, status)
      cross join lateral (
        select count(*)::integer as case_count from scoped_couples couple where couple.status::text = stage.status
      ) counts
    )
    select jsonb_build_object(
      'unassigned_couples', couple_counts.unassigned_couples,
      'active_couples', couple_counts.active_couples,
      'under_review_intakes', intake_counts.under_review_intakes,
      'completed_couples', couple_counts.completed_couples,
      'current_cases', couple_counts.current_cases,
      'workflow', workflow.stages
    )
    from couple_counts, intake_counts, workflow
  );
end;
$$;

revoke all on function public.get_campus_lead_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.get_campus_lead_dashboard_metrics() to authenticated;
comment on function public.get_campus_lead_dashboard_metrics() is
  'Returns minimum-scope Campus Lead dashboard counts across only that caller’s active assigned campuses; never returns Couple, Case, or Intake identities.';
