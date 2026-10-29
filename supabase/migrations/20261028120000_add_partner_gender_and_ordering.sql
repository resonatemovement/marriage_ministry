alter table public.profiles
  add column gender text,
  add constraint profiles_gender_valid check (gender is null or gender in ('male', 'female'));

alter table public.intake_request_people
  add column gender text,
  add constraint intake_request_people_gender_valid check (gender is null or gender in ('male', 'female'));

-- Stage 1 keeps the existing RPC signature, permissions, and legacy callers
-- working while persisting gender whenever the updated application supplies it.
-- Required database enforcement is intentionally deferred until Stage 2.
alter function public.create_intake_request(jsonb) rename to create_intake_request_without_gender;
revoke all on function public.create_intake_request_without_gender(jsonb) from public, anon, authenticated, service_role;

create function public.create_intake_request(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
  item jsonb;
  requester_count integer := 0;
  partner_count integer := 0;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload->'people') is distinct from 'array'
    or jsonb_array_length(payload->'people') <> 2 then
    raise exception 'Exactly two people are required';
  end if;
  for item in select value from jsonb_array_elements(payload->'people') loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'Invalid person';
    end if;
    if item ? 'gender' and item->>'gender' is not null
      and item->>'gender' not in ('male', 'female') then
      raise exception 'Invalid gender';
    end if;
    if item->>'position' = 'requester' then requester_count := requester_count + 1;
    elsif item->>'position' = 'partner' then partner_count := partner_count + 1;
    else raise exception 'Invalid person position';
    end if;
  end loop;
  if requester_count <> 1 or partner_count <> 1 then
    raise exception 'Exactly one requester and one partner are required';
  end if;

  request_id := public.create_intake_request_without_gender(payload);
  update public.intake_request_people person
  set gender = submission.person->>'gender'
  from jsonb_array_elements(payload->'people') as submission(person)
  where person.intake_request_id = request_id
    and person.person_position::text = submission.person->>'position';
  return request_id;
end;
$$;

revoke execute on function public.create_intake_request(jsonb) from public, anon, authenticated;
grant execute on function public.create_intake_request(jsonb) to service_role;

-- Auth bootstrap may create the profile before the invitation is accepted.
-- Copy the pending intake value when the invited profile actually joins its
-- Couple, leaving unrelated and legacy profiles unchanged.
create function private.copy_intake_couple_gender_to_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles profile
  set gender = person.gender
  from public.groups couple
  join public.intake_requests request on request.invited_group_id = couple.id
  join public.intake_request_people person on person.intake_request_id = request.id
  where couple.id = new.group_id
    and couple.group_type = 'couple'
    and profile.id = new.profile_id
    and lower(person.email) = lower(profile.email)
    and profile.gender is null
    and person.gender is not null;
  return new;
end;
$$;

create trigger copy_intake_couple_gender_to_profile
after insert on public.group_members
for each row execute function private.copy_intake_couple_gender_to_profile();

revoke execute on function private.copy_intake_couple_gender_to_profile() from public, anon, authenticated;

create function public.update_couple_partner_gender(
  target_couple_group_id uuid,
  target_profile_id uuid,
  target_gender text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  authorized boolean;
  is_admin boolean;
begin
  if actor is null or target_gender is null or target_gender not in ('male', 'female') then
    raise exception 'Valid gender and authenticated account are required';
  end if;
  is_admin := private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]);
  select is_admin or (
      private.current_user_has_role(array['counselor']::public.app_role[])
      and exists (
        select 1
        from public.counseling_cases counseling_case
        join public.case_assignments assignment
          on assignment.counseling_case_id = counseling_case.id
         and assignment.assignment_type = 'counselor'
         and assignment.ended_at is null
        join public.groups counselor_team
          on counselor_team.id = assignment.assigned_group_id
         and counselor_team.group_type = 'counselor_team'
         and counselor_team.active
        join public.group_members counselor_membership
          on counselor_membership.group_id = counselor_team.id
         and counselor_membership.profile_id = actor
         and counselor_membership.ended_at is null
        where counseling_case.couple_group_id = target_couple_group_id
          and counseling_case.status in ('active', 'pending_final')
          and counseling_case.closed_at is null
      )
    )
  into authorized;
  if not authorized then raise exception 'Not authorized to update this Couple'; end if;
  if not exists (
    select 1 from public.groups couple
    join public.group_members membership
      on membership.group_id = couple.id
     and membership.profile_id = target_profile_id
    where couple.id = target_couple_group_id
      and couple.group_type = 'couple'
      and (
        is_admin
        or (couple.active and membership.ended_at is null)
      )
  ) then raise exception 'Profile does not belong to this Couple'; end if;

  update public.profiles set gender = target_gender where id = target_profile_id;
  if not found then raise exception 'Profile not found'; end if;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'profile.gender_updated', 'profile', target_profile_id,
    jsonb_build_object('couple_group_id', target_couple_group_id, 'gender', target_gender));
  return true;
end;
$$;

revoke all on function public.update_couple_partner_gender(uuid, uuid, text) from public, anon;
grant execute on function public.update_couple_partner_gender(uuid, uuid, text) to authenticated;

drop function public.get_counseling_workspace_couple_identity(uuid);
create function public.get_counseling_workspace_couple_identity(target_case_id uuid)
returns table (
  counseling_case_id uuid,
  couple_group_id uuid,
  group_name text,
  profile_id uuid,
  first_name text,
  last_name text,
  photo_path text,
  gender text
)
language sql stable security definer set search_path = '' as $$
  select counseling_case.id, couple_group.id, couple_group.name, profile.id,
    profile.first_name, profile.last_name, profile.photo_path, profile.gender
  from public.counseling_cases counseling_case
  join public.groups couple_group on couple_group.id = counseling_case.couple_group_id and couple_group.group_type = 'couple'
  join public.group_members membership on membership.group_id = couple_group.id and membership.ended_at is null
  join public.profiles profile on profile.id = membership.profile_id
  where counseling_case.id = target_case_id
    and private.current_user_can_access_case(counseling_case.id)
  order by profile.first_name, profile.last_name, profile.id;
$$;
revoke all on function public.get_counseling_workspace_couple_identity(uuid) from public, anon, authenticated;
grant execute on function public.get_counseling_workspace_couple_identity(uuid) to authenticated;

drop function public.get_counseling_contact_group(uuid, uuid);
create function public.get_counseling_contact_group(target_case_id uuid, target_group_id uuid)
returns table (
  group_id uuid, group_name text, group_type text, assignment_type text,
  campus_name text, member_id uuid, first_name text, last_name text,
  email text, phone text, photo_path text, profile_status text,
  onboarding_completed_at timestamptz, roles text[], gender text, case_status text
)
language sql stable security definer set search_path = '' as $$
  with authorized_case as (
    select counseling_case.couple_group_id, counseling_case.status::text as case_status,
      case
        when private.current_user_has_role(array['couple']::public.app_role[])
          and private.current_user_can_access_case(counseling_case.id) then 'couple'
        when private.current_user_can_manage_counseling_case(counseling_case.id) then 'care_team'
      end as actor_kind
    from public.counseling_cases counseling_case
    where counseling_case.id = target_case_id
  ), permitted_group as (
    select authorized_case.* from authorized_case
    where actor_kind = 'couple' and target_group_id = (
      select assignment.assigned_group_id from public.case_assignments assignment
      where assignment.counseling_case_id = target_case_id
        and assignment.assignment_type = 'counselor' and assignment.ended_at is null
        and assignment.assigned_group_id is not null
      order by assignment.started_at desc limit 1
    )
    union all
    select authorized_case.* from authorized_case
    where actor_kind = 'care_team' and (
      couple_group_id = target_group_id or exists (
        select 1 from public.case_assignments assignment
        where assignment.counseling_case_id = target_case_id
          and assignment.assigned_group_id = target_group_id and assignment.ended_at is null
      )
    )
  )
  select contact_group.id, contact_group.name, contact_group.group_type::text,
    case when contact_group.id = permitted_group.couple_group_id then 'couple'
      else (select assignment.assignment_type::text from public.case_assignments assignment
        where assignment.counseling_case_id = target_case_id
          and assignment.assigned_group_id = contact_group.id and assignment.ended_at is null
        order by assignment.started_at desc limit 1)
    end,
    campus.name, profile.id, profile.first_name, profile.last_name, profile.email,
    profile.phone, profile.photo_path, profile.status::text, profile.onboarding_completed_at,
    coalesce((select array_agg(profile_role.role::text order by profile_role.role::text)
      from public.profile_roles profile_role where profile_role.profile_id = profile.id), array[]::text[]),
    profile.gender, permitted_group.case_status
  from permitted_group
  join public.groups contact_group on contact_group.id = target_group_id and contact_group.active
  left join public.campuses campus on campus.id = contact_group.campus_id
  join public.group_members membership on membership.group_id = contact_group.id and membership.ended_at is null
  join public.profiles profile on profile.id = membership.profile_id
  order by profile.first_name, profile.last_name, profile.id;
$$;
revoke all on function public.get_counseling_contact_group(uuid, uuid) from public, anon;
grant execute on function public.get_counseling_contact_group(uuid, uuid) to authenticated;
