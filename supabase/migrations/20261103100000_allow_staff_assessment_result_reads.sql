-- Permit score/status reads for the same staff who may manage the assigned Case,
-- without granting Couple answer access or assessment scheduling permissions.
create or replace function private.assessment_can_read_staff_results(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.counseling_cases counseling_case
    where counseling_case.id = target_case_id
      and (
        private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])
        or (
          counseling_case.closed_at is null
          and private.current_user_can_manage_counseling_case(counseling_case.id)
        )
      )
  );
$$;

revoke all on function private.assessment_can_read_staff_results(uuid) from public, anon, authenticated;
grant execute on function private.assessment_can_read_staff_results(uuid) to authenticated;

create or replace function public.get_case_assessment_catalog(target_case_id uuid)
returns table(
  assessment_id uuid,
  title text,
  description text,
  published_version_id uuid,
  published_version_number integer,
  system_default_session_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.assessment_can_read_staff_results(target_case_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select definition.id, definition.title, definition.description,
    published.id, published.version_number, default_setting.session_id
  from public.assessment_definitions definition
  left join lateral (
    select version.id, version.version_number
    from public.assessment_versions version
    where version.assessment_id = definition.id and version.status = 'published'
    order by version.version_number desc
    limit 1
  ) published on true
  left join public.assessment_system_defaults default_setting on default_setting.assessment_id = definition.id
  order by definition.title, definition.id;
end;
$$;

revoke all on function public.get_case_assessment_catalog(uuid) from public, anon, authenticated;
grant execute on function public.get_case_assessment_catalog(uuid) to authenticated;
comment on function public.get_case_assessment_catalog(uuid) is
  'Returns Assessment catalog metadata and the latest published version for staff authorized to read results for a Case. Never returns questionnaire content, scoring keys, responses, or results.';

drop policy assessment_participant_assignments_owner_or_counselor_read on public.assessment_participant_assignments;
create policy assessment_participant_assignments_owner_or_authorized_staff_read
on public.assessment_participant_assignments for select to authenticated
using (profile_id = auth.uid() or private.assessment_can_read_staff_results(counseling_case_id));

drop policy assessment_attempts_owner_or_counselor_read on public.assessment_attempts;
create policy assessment_attempts_owner_or_authorized_staff_read
on public.assessment_attempts for select to authenticated
using (profile_id = auth.uid() or private.assessment_can_read_staff_results(private.assessment_attempt_case_id(id)));

drop policy assessment_attempt_scores_owner_or_counselor_read on public.assessment_attempt_scores;
create policy assessment_attempt_scores_owner_or_authorized_staff_read
on public.assessment_attempt_scores for select to authenticated
using (private.assessment_user_owns_attempt(attempt_id) or private.assessment_can_read_staff_results(private.assessment_attempt_case_id(attempt_id)));

drop policy assessment_categories_read_authorized on public.assessment_categories;
create policy assessment_categories_read_authorized on public.assessment_categories for select to authenticated
using (
  private.assessment_user_can_read_version(assessment_version_id)
  or exists (
    select 1
    from public.assessment_case_schedules schedule
    where schedule.assessment_version_id = assessment_categories.assessment_version_id
      and private.assessment_can_read_staff_results(schedule.counseling_case_id)
  )
);

comment on policy assessment_responses_owner_read on public.assessment_responses is
  'Assessment responses remain private to their owning participant; staff result access never grants answer access.';
