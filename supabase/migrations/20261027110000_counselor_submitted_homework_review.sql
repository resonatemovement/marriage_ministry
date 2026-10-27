create or replace function public.get_counselor_submitted_homework_review(target_progress_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'progressId', progress.id,
    'caseId', assignment.counseling_case_id,
    'profileId', progress.profile_id,
    'submittedAt', progress.submitted_at,
    'sessionTitle', coalesce(case_session.title, session.title),
    'sessionSequence', case_session.template_sequence_number,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'blockId', block.id,
        'type', block.block_type,
        'position', block.position,
        'title', block.title,
        'content', block.rich_text_content,
        'choices', block.question_choices,
        'isRequired', block.is_required,
        'answerText', answer.answer_text,
        'answerValue', answer.answer_value
      ) order by block.position)
      from public.homework_version_blocks block
      left join public.homework_answers answer
        on answer.homework_version_block_id = block.id
       and answer.participant_progress_id = progress.id
      where block.homework_version_id = revision.homework_version_id
        and block.block_type in ('long_answer', 'checkbox_question', 'radio_question')
    ), '[]'::jsonb)
  )
  from public.homework_participant_progress progress
  join public.homework_assignment_revisions revision
    on revision.id = progress.assignment_revision_id
  join public.homework_assignments assignment
    on assignment.id = revision.homework_assignment_id
  join public.case_sessions case_session
    on case_session.homework_assignment_revision_id = revision.id
   and case_session.counseling_case_id = assignment.counseling_case_id
  join public.sessions session on session.id = case_session.session_id
  join public.case_assignments counselor_assignment
    on counselor_assignment.counseling_case_id = assignment.counseling_case_id
   and counselor_assignment.assignment_type = 'counselor'
   and counselor_assignment.ended_at is null
  join public.groups counselor_team
    on counselor_team.id = counselor_assignment.assigned_group_id
   and counselor_team.active
  join public.group_members counselor_membership
    on counselor_membership.group_id = counselor_team.id
   and counselor_membership.profile_id = (select auth.uid())
   and counselor_membership.ended_at is null
  where progress.id = target_progress_id
    and progress.status in ('submitted', 'reviewed')
    and progress.submitted_at is not null
    and (
      (counselor_team.group_type = 'counselor_team'
        and (select private.current_user_has_role(array['counselor']::public.app_role[])))
      or (counselor_team.group_type = 'coach_team'
        and (select private.current_user_has_role(array['coach']::public.app_role[])))
      or (counselor_team.group_type = 'campus_lead_team'
        and (select private.current_user_has_role(array['campus_lead']::public.app_role[])))
    );
$$;

revoke all on function public.get_counselor_submitted_homework_review(uuid) from public, anon;
grant execute on function public.get_counselor_submitted_homework_review(uuid) to authenticated;
