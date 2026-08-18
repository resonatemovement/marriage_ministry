create function private.current_user_is_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'active'
  );
$$;

create function private.current_user_has_role(allowed_roles public.app_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select private.current_user_is_active()) and exists (
    select 1 from public.profile_roles
    where profile_id = (select auth.uid()) and role = any (allowed_roles)
  );
$$;

create function private.current_user_can_access_group(target_group_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
    or exists (
      select 1 from public.group_members
      where group_id = target_group_id
        and profile_id = (select auth.uid())
        and ended_at is null
    )
    or exists (
      select 1
      from public.supervision_assignments supervision
      join public.group_members coach_membership
        on coach_membership.group_id = supervision.coach_group_id
       and coach_membership.profile_id = (select auth.uid())
       and coach_membership.ended_at is null
      where supervision.counselor_group_id = target_group_id
        and supervision.ended_at is null
        and (select private.current_user_has_role(array['coach']::public.app_role[]))
    );
$$;

create function private.current_user_can_access_profile(target_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    target_profile_id = (select auth.uid())
    or (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
    or exists (
      select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.profile_id = (select auth.uid())
        and mine.ended_at is null
        and theirs.profile_id = target_profile_id
        and theirs.ended_at is null
    )
    or exists (
      select 1
      from public.supervision_assignments supervision
      join public.group_members coach_membership
        on coach_membership.group_id = supervision.coach_group_id
       and coach_membership.profile_id = (select auth.uid())
       and coach_membership.ended_at is null
      join public.group_members counselor_membership
        on counselor_membership.group_id = supervision.counselor_group_id
       and counselor_membership.profile_id = target_profile_id
       and counselor_membership.ended_at is null
      where supervision.ended_at is null
        and (select private.current_user_has_role(array['coach']::public.app_role[]))
    );
$$;

create function private.current_user_can_access_case(target_case_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
    or exists (
      select 1
      from public.counseling_cases counseling_case
      join public.group_members couple_member
        on couple_member.group_id = counseling_case.couple_group_id
       and couple_member.profile_id = (select auth.uid())
       and couple_member.ended_at is null
      where counseling_case.id = target_case_id
        and (select private.current_user_has_role(array['couple']::public.app_role[]))
    )
    or exists (
      select 1
      from public.case_assignments assignment
      join public.group_members team_member
        on team_member.group_id = assignment.assigned_group_id
       and team_member.profile_id = (select auth.uid())
       and team_member.ended_at is null
      where assignment.counseling_case_id = target_case_id
        and assignment.ended_at is null
        and (
          (assignment.assignment_type = 'coach'
            and (select private.current_user_has_role(array['coach']::public.app_role[])))
          or (assignment.assignment_type = 'counselor'
            and (select private.current_user_has_role(array['counselor']::public.app_role[])))
        )
    );
$$;

create function private.validate_group_member_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  required_role public.app_role;
begin
  select case group_type
    when 'couple' then 'couple'::public.app_role
    when 'coach_team' then 'coach'::public.app_role
    when 'counselor_team' then 'counselor'::public.app_role
  end into required_role
  from public.groups where id = new.group_id;

  if required_role is null or not exists (
    select 1 from public.profile_roles
    where profile_id = new.profile_id and role = required_role
  ) then
    raise exception 'Profile does not hold the role required by this group';
  end if;
  return new;
end;
$$;

create trigger validate_group_member_role_before_write
before insert or update of group_id, profile_id on public.group_members
for each row execute function private.validate_group_member_role();

create function private.validate_couple_group()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.groups
    where id = new.couple_group_id and group_type = 'couple'
  ) then
    raise exception 'Counseling cases require a couple group';
  end if;
  return new;
end;
$$;

create trigger validate_couple_group_before_write
before insert or update of couple_group_id on public.counseling_cases
for each row execute function private.validate_couple_group();

create function private.validate_case_assignment_group()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.groups
    where id = new.assigned_group_id
      and active
      and group_type = case new.assignment_type
        when 'coach' then 'coach_team'::public.group_type
        when 'counselor' then 'counselor_team'::public.group_type
      end
  ) then
    raise exception 'Assignment group type does not match assignment type';
  end if;
  return new;
end;
$$;

create trigger validate_case_assignment_group_before_write
before insert or update of assigned_group_id, assignment_type on public.case_assignments
for each row execute function private.validate_case_assignment_group();

create function private.validate_supervision_groups()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.groups
    where id = new.coach_group_id and group_type = 'coach_team' and active
  ) or not exists (
    select 1 from public.groups
    where id = new.counselor_group_id and group_type = 'counselor_team' and active
  ) then
    raise exception 'Supervision requires an active Coach team and Counselor team';
  end if;
  return new;
end;
$$;

create trigger validate_supervision_groups_before_write
before insert or update of coach_group_id, counselor_group_id
on public.supervision_assignments
for each row execute function private.validate_supervision_groups();

create function private.validate_assessment_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.profile_id is not null and not exists (
    select 1
    from public.counseling_cases counseling_case
    join public.group_members couple_member
      on couple_member.group_id = counseling_case.couple_group_id
     and couple_member.profile_id = new.profile_id
     and couple_member.ended_at is null
    where counseling_case.id = new.counseling_case_id
  ) then
    raise exception 'Assessment profile must be an active member of the case couple';
  end if;
  return new;
end;
$$;

create trigger validate_assessment_profile_before_write
before insert or update of counseling_case_id, profile_id on public.assessment_documents
for each row execute function private.validate_assessment_profile();

create function private.set_case_closure_timestamp()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.status in ('finished', 'referred', 'inactive') and new.closed_at is null then
    new.closed_at := now();
  elsif new.status not in ('finished', 'referred', 'inactive') then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger set_case_closure_timestamp_before_write
before insert or update of status on public.counseling_cases
for each row execute function private.set_case_closure_timestamp();

create function private.record_case_status_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.case_status_history (
      counseling_case_id, from_status, to_status, changed_by
    ) values (
      new.id,
      case when tg_op = 'UPDATE' then old.status else null end,
      new.status,
      (select auth.uid())
    );
  end if;
  return new;
end;
$$;

create trigger record_case_status_change_after_write
after insert or update of status on public.counseling_cases
for each row execute function private.record_case_status_change();

create function private.assert_matched_case_has_assignment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target_case_id uuid;
begin
  if tg_table_name = 'counseling_cases' then
    target_case_id := new.id;
  elsif tg_op = 'DELETE' then
    target_case_id := old.counseling_case_id;
  else
    target_case_id := new.counseling_case_id;
  end if;

  if exists (
    select 1 from public.counseling_cases
    where id = target_case_id and status = 'matched'
  ) and not exists (
    select 1 from public.case_assignments
    where counseling_case_id = target_case_id and ended_at is null
  ) then
    raise exception 'Matched counseling cases require an active assignment';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create constraint trigger matched_case_requires_assignment
after insert or update of status on public.counseling_cases
deferrable initially deferred
for each row execute function private.assert_matched_case_has_assignment();

create constraint trigger assignment_change_preserves_matched_case
after insert or update or delete on public.case_assignments
deferrable initially deferred
for each row execute function private.assert_matched_case_has_assignment();

create function private.bootstrap_profile_for_auth_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, lower(btrim(new.email)));
  return new;
end;
$$;

create trigger create_profile_after_auth_user_insert
after insert on auth.users
for each row execute function private.bootstrap_profile_for_auth_user();

create function public.assign_counseling_case(
  target_case_id uuid,
  target_group_id uuid,
  target_assignment_type public.case_assignment_type,
  reassignment_reason text default 'Reassigned by administrator'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_assignment_id uuid;
  current_actor uuid := (select auth.uid());
begin
  if not (select private.current_user_has_role(
    array['super_admin', 'admin']::public.app_role[]
  )) then
    raise exception 'Only an Admin or Super Admin may assign counseling cases';
  end if;

  perform 1 from public.counseling_cases where id = target_case_id for update;
  if not found then
    raise exception 'Counseling case not found';
  end if;

  update public.case_assignments
  set ended_at = now(), end_reason = coalesce(nullif(btrim(reassignment_reason), ''), 'Reassigned by administrator')
  where counseling_case_id = target_case_id
    and assignment_type = target_assignment_type
    and ended_at is null;

  insert into public.case_assignments (
    counseling_case_id, assigned_group_id, assignment_type, assigned_by
  ) values (
    target_case_id, target_group_id, target_assignment_type, current_actor
  ) returning id into new_assignment_id;

  update public.counseling_cases
  set status = 'matched'
  where id = target_case_id
    and status in ('requested', 'assessment', 'interviewed');

  insert into public.audit_events (
    actor_id, event_type, entity_type, entity_id, details
  ) values (
    current_actor,
    'case.assigned',
    'counseling_case',
    target_case_id,
    jsonb_build_object(
      'assignment_id', new_assignment_id,
      'assignment_type', target_assignment_type,
      'group_id', target_group_id
    )
  );

  return new_assignment_id;
end;
$$;

revoke execute on function public.assign_counseling_case(uuid, uuid, public.case_assignment_type, text)
from public, anon;
grant execute on function public.assign_counseling_case(uuid, uuid, public.case_assignment_type, text)
to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.current_user_has_role(public.app_role[]) to authenticated;
grant execute on function private.current_user_can_access_group(uuid) to authenticated;
grant execute on function private.current_user_can_access_profile(uuid) to authenticated;
grant execute on function private.current_user_can_access_case(uuid) to authenticated;

alter table public.campuses enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.counseling_cases enable row level security;
alter table public.case_assignments enable row level security;
alter table public.case_status_history enable row level security;
alter table public.supervision_assignments enable row level security;
alter table public.assessment_documents enable row level security;
alter table public.audit_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.campuses, public.profiles, public.profile_roles,
  public.groups, public.group_members, public.counseling_cases,
  public.supervision_assignments, public.assessment_documents to authenticated;

create policy campuses_read_active_or_admin on public.campuses for select to authenticated
using (active or (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));
create policy campuses_admin_write on public.campuses for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create policy profiles_read_authorized on public.profiles for select to authenticated
using ((select private.current_user_can_access_profile(id)));
create policy profiles_admin_write on public.profiles for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create policy profile_roles_read_authorized on public.profile_roles for select to authenticated
using ((select private.current_user_can_access_profile(profile_id)));
create policy profile_roles_admin_write on public.profile_roles for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create policy groups_read_authorized on public.groups for select to authenticated
using ((select private.current_user_can_access_group(id)));
create policy groups_admin_write on public.groups for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create policy group_members_read_authorized on public.group_members for select to authenticated
using ((select private.current_user_can_access_group(group_id)));
create policy group_members_admin_write on public.group_members for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create policy counseling_cases_read_authorized on public.counseling_cases for select to authenticated
using ((select private.current_user_can_access_case(id)));
create policy counseling_cases_admin_write on public.counseling_cases for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create policy case_assignments_read_authorized on public.case_assignments for select to authenticated
using ((select private.current_user_can_access_case(counseling_case_id)));
create policy case_status_history_read_authorized on public.case_status_history for select to authenticated
using ((select private.current_user_can_access_case(counseling_case_id)));

create policy supervision_read_authorized on public.supervision_assignments for select to authenticated
using (
  (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
  or (select private.current_user_can_access_group(coach_group_id))
  or (select private.current_user_can_access_group(counselor_group_id))
);
create policy supervision_admin_write on public.supervision_assignments for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create policy assessment_documents_read_authorized on public.assessment_documents for select to authenticated
using ((select private.current_user_can_access_case(counseling_case_id)));
create policy assessment_documents_admin_write on public.assessment_documents for all to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])))
with check ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create policy audit_events_admin_read on public.audit_events for select to authenticated
using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

insert into storage.buckets (id, name, public, file_size_limit)
values ('assessment-documents', 'assessment-documents', false, 26214400);

create policy assessment_storage_read_authorized on storage.objects for select to authenticated
using (
  bucket_id = 'assessment-documents'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (select private.current_user_can_access_case(((storage.foldername(name))[1])::uuid))
);
create policy assessment_storage_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'assessment-documents'
  and (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
);
create policy assessment_storage_admin_update on storage.objects for update to authenticated
using (
  bucket_id = 'assessment-documents'
  and (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
)
with check (
  bucket_id = 'assessment-documents'
  and (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
);
create policy assessment_storage_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'assessment-documents'
  and (select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]))
);
