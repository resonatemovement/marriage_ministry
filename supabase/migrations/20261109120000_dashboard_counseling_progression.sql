create or replace function public.get_dashboard_counseling_progression()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  is_admin boolean := private.current_user_has_role(array['admin', 'super_admin']::public.app_role[]);
  is_campus_lead boolean := private.current_user_has_role(array['campus_lead']::public.app_role[]);
begin
  if actor is null or not (is_admin or is_campus_lead) then
    raise exception 'Not authorized to view Dashboard counseling progression';
  end if;

  return (
    with active_campuses as (
      select distinct scope.campus_id
      from public.campus_lead_assignments scope
      join public.campuses campus on campus.id = scope.campus_id and campus.active
      where scope.profile_id = actor and scope.ended_at is null
    ), scoped_couples as (
      select couple.id, counseling_case.id as case_id, counseling_case.status::text as case_status,
        exists (
          select 1 from public.case_assignments assignment
          where assignment.counseling_case_id = counseling_case.id
            and assignment.assignment_type = 'counselor'::public.case_assignment_type
            and assignment.ended_at is null
        ) as has_counselor,
        (count(distinct member.profile_id) filter (where member.ended_at is null))::integer as member_count,
        (count(distinct member.profile_id) filter (where member.ended_at is null and profile.onboarding_completed_at is not null))::integer as completed_member_count,
        count(distinct invitation.id) filter (where invitation.intended_role = 'couple'::public.app_role and invitation.status in ('pending'::public.invitation_status, 'accepted'::public.invitation_status))::integer as couple_invitation_count
      from public.groups couple
      left join public.counseling_cases counseling_case on counseling_case.couple_group_id = couple.id
      left join public.group_members member on member.group_id = couple.id and member.ended_at is null
      left join public.profiles profile on profile.id = member.profile_id
      left join public.invitations invitation on invitation.group_id = couple.id
      where couple.group_type = 'couple'::public.group_type and couple.active
        and (is_admin or couple.campus_id in (select campus_id from active_campuses))
      group by couple.id, counseling_case.id, counseling_case.status
    ), classified_couples as (
      select couple.*,
        case
          when couple.case_status = 'finished' then 'completed'
          when couple.case_status = 'referred' then 'referred'
          when couple.case_status = 'inactive' then 'closed_incomplete'
          when couple.member_count = 2 and couple.completed_member_count = 2 then 'complete'
          when couple.member_count < 2 and couple.couple_invitation_count = 2 then 'incomplete'
          else 'unknown'
        end as onboarding_state,
        case
          when couple.case_status = 'finished' then 'completed'
          when couple.case_status = 'referred' then 'referred'
          when couple.case_status = 'inactive' then 'closed_incomplete'
          when couple.case_id is not null and couple.member_count < 2 and couple.couple_invitation_count = 2 then null
          when couple.member_count = 2 and couple.completed_member_count < 2 and couple.case_id is null then 'onboarding'
          when couple.member_count < 2 and couple.couple_invitation_count = 2 and couple.case_id is null then 'onboarding'
          when couple.case_id is not null and (couple.member_count = 2 and couple.completed_member_count < 2) then null
          when couple.case_id is null and couple.member_count = 2 and couple.completed_member_count = 2 then 'awaiting_assignment'
          when couple.case_id is null and couple.member_count < 2 and couple.couple_invitation_count = 2 then 'onboarding'
          when couple.case_id is not null and not couple.has_counselor and couple.member_count = 2 and couple.completed_member_count = 2 then 'awaiting_assignment'
          when couple.case_id is not null and couple.has_counselor and couple.case_status in ('matched', 'active', 'pending_final') then 'counseling'
          else null
        end as stage
      from scoped_couples couple
    ), current_case_sessions as (
      select distinct on (case_session.counseling_case_id)
        case_session.counseling_case_id, case_session.session_id
      from public.case_sessions case_session
      where case_session.status = 'active'
      order by case_session.counseling_case_id, case_session.actual_sequence desc
    ), published_sessions as (
      select session_template.id, session_template.title,
        row_number() over (order by session_template.sequence_number)::integer as display_number
      from public.sessions session_template
      where session_template.status = 'published'
    ), stage_counts as (
      select stage.id, stage.label, stage.value_label,
        case when stage.id = 'intake' then (
          select count(*)::integer from public.intake_requests request
          where request.status in ('ready_for_review', 'under_review', 'ready_to_invite')
            and request.invited_group_id is null
            and (is_admin or request.campus_id in (select campus_id from active_campuses))
        ) else count(couple.id)::integer end as count
      from (values
        (1, 'intake'::text, 'Intake', 'Intake Requests'),
        (2, 'onboarding', 'Onboarding', 'Couples'),
        (3, 'awaiting_assignment', 'Awaiting Assignment', 'Couples'),
        (4, 'counseling', 'Counseling', 'Couples'),
        (5, 'completed', 'Completed', 'Couples'),
        (6, 'referred', 'Referred', 'Couples'),
        (7, 'closed_incomplete', 'Closed — Incomplete', 'Couples')
      ) as stage(position, id, label, value_label)
      left join classified_couples couple on couple.stage = stage.id
      group by stage.position, stage.id, stage.label, stage.value_label
    ), session_counts as (
      select jsonb_build_array(jsonb_build_object(
        'id', 'initial', 'number', null, 'title', 'Initial Meeting', 'count', initial_count.count
      )) as initial_rows
      from (
        select count(distinct couple.id)::integer as count
        from classified_couples couple
        left join current_case_sessions current_session on current_session.counseling_case_id = couple.case_id
        where couple.stage = 'counseling' and current_session.counseling_case_id is null
      ) initial_count
    ), session_rows as (
      select jsonb_build_object(
        'id', session_template.id,
        'number', session_template.display_number,
        'title', session_template.title,
        'count', count(distinct couple.id)::integer
      ) as row,
      session_template.display_number
      from published_sessions session_template
      left join current_case_sessions current_session on current_session.session_id = session_template.id
      left join classified_couples couple
        on couple.case_id = current_session.counseling_case_id and couple.stage = 'counseling'
      group by session_template.id, session_template.display_number, session_template.title
    ), issue_groups as (
      select couple.id
      from classified_couples couple
      where couple.stage is null
      union
      select couple.id
      from classified_couples couple
      join current_case_sessions current_session on current_session.counseling_case_id = couple.case_id
      where couple.stage = 'counseling'
        and not exists (select 1 from published_sessions session_template where session_template.id = current_session.session_id)
    ), orphan_invited_requests as (
      select count(*)::integer as count from public.intake_requests request
      where request.status = 'invited' and request.invited_group_id is null
        and (is_admin or request.campus_id in (select campus_id from active_campuses))
    )
    select jsonb_build_object(
      'stages', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'valueLabel', value_label, 'count', count) order by id_order) from (select *, case id when 'intake' then 1 when 'onboarding' then 2 when 'awaiting_assignment' then 3 when 'counseling' then 4 when 'completed' then 5 when 'referred' then 6 else 7 end as id_order from stage_counts) ordered_stages), '[]'::jsonb),
      'sessions', (select initial_rows from session_counts) || coalesce((select jsonb_agg(row order by display_number) from session_rows), '[]'::jsonb),
      'unclassified_count', (select count(*)::integer from issue_groups) + (select count from orphan_invited_requests)
    )
  );
end;
$$;

revoke all on function public.get_dashboard_counseling_progression() from public, anon, authenticated;
grant execute on function public.get_dashboard_counseling_progression() to authenticated;
comment on function public.get_dashboard_counseling_progression() is
  'Returns identity-free Dashboard progression and published Session counts for Admin/Super Admin globally or Campus Leads within active assigned campuses.';
