-- Couple Workspace reads are limited to the authenticated partner's current case.
-- These helpers deliberately expose only the active scheduled session, never a session selected by the client.
create or replace function private.current_user_can_read_current_couple_session(target_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and private.current_user_has_role(array['couple']::public.app_role[])
    and exists (
      select 1
      from public.case_session_meetings meeting
      join public.counseling_cases counseling_case on counseling_case.id = meeting.counseling_case_id
      join public.sessions session on session.id = meeting.session_id
      where meeting.session_id = target_session_id
        and counseling_case.closed_at is null
        and private.current_user_can_access_case(counseling_case.id)
        and not exists (
          select 1
          from public.case_session_meetings later_meeting
          join public.sessions later_session on later_session.id = later_meeting.session_id
          where later_meeting.counseling_case_id = counseling_case.id
            and later_session.sequence_number > session.sequence_number
        )
    );
$$;

create or replace function private.current_user_can_read_current_couple_homework_version(target_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.homework_assignment_revisions revision
    join public.homework_assignments assignment on assignment.id = revision.homework_assignment_id
    join public.homeworks homework on homework.id = assignment.homework_id
    where revision.homework_version_id = target_version_id
      and revision.ended_at is null
      and assignment.unassigned_at is null
      and private.current_user_can_read_current_couple_session(homework.session_id)
  );
$$;

create or replace function public.get_current_couple_case_team()
returns table (
  counseling_case_id uuid,
  campus_lead_name text,
  coach_name text,
  counselor_name text,
  published_session_count bigint
) language sql stable security definer set search_path = '' as $$
  select counseling_case.id,
    max(assignment_group.name) filter (where assignment.assignment_type = 'campus_lead'),
    max(assignment_group.name) filter (where assignment.assignment_type = 'coach'),
    max(assignment_group.name) filter (where assignment.assignment_type = 'counselor'),
    (select count(*) from public.sessions where status = 'published')
  from public.counseling_cases counseling_case
  left join public.case_assignments assignment on assignment.counseling_case_id = counseling_case.id and assignment.ended_at is null
  left join public.groups assignment_group on assignment_group.id = assignment.assigned_group_id
  where private.current_user_has_role(array['couple']::public.app_role[])
    and private.current_user_can_access_case(counseling_case.id)
  group by counseling_case.id
  order by counseling_case.id
  limit 1;
$$;

create policy sessions_couple_current_read on public.sessions for select to authenticated
using (status = 'published' and (select private.current_user_can_read_current_couple_session(id)));

create policy session_material_blocks_couple_current_read on public.session_material_blocks for select to authenticated
using ((select private.current_user_can_read_current_couple_session(session_id)));

create policy resources_couple_current_session_read on public.resources for select to authenticated
using (
  current_version_id is not null
  and exists (
    select 1 from public.session_material_blocks material
    where material.resource_id = resources.id
      and private.current_user_can_read_current_couple_session(material.session_id)
  )
);

create policy homeworks_couple_current_read on public.homeworks for select to authenticated
using ((select private.current_user_can_read_current_couple_session(session_id)));

create policy homework_versions_couple_current_read on public.homework_versions for select to authenticated
using ((select private.current_user_can_read_current_couple_homework_version(id)));

create policy homework_version_blocks_couple_current_read on public.homework_version_blocks for select to authenticated
using ((select private.current_user_can_read_current_couple_homework_version(homework_version_id)));

drop policy assessment_documents_read_by_slot on public.assessment_documents;
create policy assessment_documents_read_by_slot on public.assessment_documents for select to authenticated
using (
  (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
  or (
    document_slot = 'counselor'
    and (select private.current_user_has_role(array['campus_lead', 'coach', 'counselor']::public.app_role[]))
    and (select private.current_user_can_manage_counseling_case(counseling_case_id))
  )
  or (
    document_slot = 'couple'
    and (select private.current_user_has_role(array['couple']::public.app_role[]))
    and (select private.current_user_can_access_case(counseling_case_id))
  )
);

drop policy assessment_storage_read_by_slot on storage.objects;
create policy assessment_storage_read_by_slot on storage.objects for select to authenticated
using (
  bucket_id = 'assessment-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
    or (
      (storage.foldername(name))[2] = 'counselor'
      and (select private.current_user_has_role(array['campus_lead', 'coach', 'counselor']::public.app_role[]))
      and (select private.current_user_can_manage_counseling_case(((storage.foldername(name))[1])::uuid))
    )
    or (
      (storage.foldername(name))[2] = 'couple'
      and (select private.current_user_has_role(array['couple']::public.app_role[]))
      and (select private.current_user_can_access_case(((storage.foldername(name))[1])::uuid))
    )
  )
);

revoke all on function private.current_user_can_read_current_couple_session(uuid), private.current_user_can_read_current_couple_homework_version(uuid) from public, anon;
grant execute on function private.current_user_can_read_current_couple_session(uuid), private.current_user_can_read_current_couple_homework_version(uuid), public.get_current_couple_case_team() to authenticated;
