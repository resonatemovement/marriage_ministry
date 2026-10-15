-- Keep the revoked legacy scheduling helper valid while avoiding a PL/pgSQL
-- identifier collision between its selected Homework variable and table column.
create or replace function private.activate_case_session_homework(
  target_case_id uuid,
  target_session_id uuid,
  actor_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  selected_homework_id uuid;
  selected_version_id uuid;
  assignment_id uuid;
  revision_id uuid;
begin
  select homework.id, version.id
  into selected_homework_id, selected_version_id
  from public.homeworks homework
  join public.homework_versions version
    on version.homework_id = homework.id
   and version.status = 'published'
  where homework.session_id = target_session_id
    and homework.withdrawn_at is null
  order by version.version_number desc
  limit 1;

  if selected_homework_id is null then
    raise exception 'This Session needs published Homework before it can be scheduled';
  end if;

  insert into public.homework_assignments(homework_id, counseling_case_id, assigned_by)
  values (selected_homework_id, target_case_id, actor_id)
  on conflict (homework_id, counseling_case_id) where unassigned_at is null
  do update set updated_at = now()
  returning public.homework_assignments.id into assignment_id;

  select revision.id
  into revision_id
  from public.homework_assignment_revisions revision
  where revision.homework_assignment_id = assignment_id
    and revision.ended_at is null;

  if revision_id is null then
    insert into public.homework_assignment_revisions(
      homework_assignment_id,
      homework_version_id,
      updated_by
    ) values (
      assignment_id,
      selected_version_id,
      actor_id
    ) returning public.homework_assignment_revisions.id into revision_id;

    perform private.create_homework_progress(revision_id);
  end if;
end;
$$;

revoke all on function private.activate_case_session_homework(uuid, uuid, uuid)
from public, anon, authenticated;
