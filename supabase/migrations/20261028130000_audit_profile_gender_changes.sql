-- Centralize validation and auditing for every profile gender change. The
-- existing Admin profile-write policy remains available for other fields.
-- RPC target context is stored only for the current transaction; callers cannot
-- write or forge it through authenticated table access or session settings.
create table private.profile_gender_change_context (
  transaction_id bigint not null,
  profile_id uuid not null,
  actor_id uuid not null,
  couple_group_id uuid not null,
  primary key (transaction_id, profile_id)
);

revoke all on table private.profile_gender_change_context from public, anon, authenticated, service_role;

create function private.guard_and_audit_profile_gender_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  selected_couple_group_id uuid;
  couple_group_ids uuid[];
  audit_details jsonb;
  has_rpc_context boolean := false;
  is_admin boolean;
  is_counselor boolean;
  is_invitation_transfer boolean := false;
begin
  if new.gender is not distinct from old.gender then
    return new;
  end if;

  if new.gender is not null and new.gender not in ('male', 'female') then
    raise exception 'Invalid gender';
  end if;

  select array_agg(membership_history.group_id order by membership_history.group_id)
  into couple_group_ids
  from (
    select distinct couple.id as group_id
    from public.group_members membership
    join public.groups couple
      on couple.id = membership.group_id
     and couple.group_type = 'couple'
    where membership.profile_id = new.id
  ) membership_history;

  is_admin := actor is not null
    and private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]);
  is_counselor := actor is not null
    and private.current_user_has_role(array['counselor']::public.app_role[]);

  select context.couple_group_id
  into selected_couple_group_id
  from private.profile_gender_change_context context
  where context.transaction_id = txid_current()
    and context.profile_id = new.id
    and context.actor_id is not distinct from actor;
  has_rpc_context := found;

  if has_rpc_context then
    if not (selected_couple_group_id = any(coalesce(couple_group_ids, array[]::uuid[]))) then
      raise exception 'Gender update context does not match Couple membership';
    end if;

    if is_admin then
      null;
    elsif is_counselor and exists (
      select 1
      from public.counseling_cases counseling_case
      join public.case_assignments assignment
        on assignment.counseling_case_id = counseling_case.id
       and assignment.assignment_type = 'counselor'
       and assignment.ended_at is null
      join public.groups couple
        on couple.id = counseling_case.couple_group_id
       and couple.group_type = 'couple'
       and couple.active
      join public.group_members couple_membership
        on couple_membership.group_id = couple.id
       and couple_membership.profile_id = new.id
       and couple_membership.ended_at is null
      join public.groups counselor_team
        on counselor_team.id = assignment.assigned_group_id
       and counselor_team.group_type = 'counselor_team'
       and counselor_team.active
      join public.group_members counselor_membership
        on counselor_membership.group_id = counselor_team.id
       and counselor_membership.profile_id = actor
       and counselor_membership.ended_at is null
      where counseling_case.couple_group_id = selected_couple_group_id
        and counseling_case.status in ('active', 'pending_final')
        and counseling_case.closed_at is null
    ) then
      null;
    else
      raise exception 'Not authorized to update profile gender';
    end if;
  elsif is_admin then
    if coalesce(cardinality(couple_group_ids), 0) = 0 then
      raise exception 'Profile does not have Couple membership history';
    end if;
    if cardinality(couple_group_ids) = 1 then
      selected_couple_group_id := couple_group_ids[1];
    end if;
  elsif is_counselor then
    raise exception 'Counselor gender changes must use the authorized RPC';
  else
    -- Invitation activation copies a supplied intake gender only from the
    -- existing group_members AFTER INSERT trigger. Correlate that nested write
    -- to the exact invited Couple, profile email, and persisted intake value.
    is_invitation_transfer := pg_trigger_depth() > 1
      and old.gender is null
      and new.gender is not null
      and (
        current_setting('role', true) = 'service_role'
        or (
          actor = new.id
          and private.current_user_has_role(array['couple']::public.app_role[])
        )
      );

    if is_invitation_transfer then
      select couple.id
      into selected_couple_group_id
      from public.group_members membership
      join public.groups couple
        on couple.id = membership.group_id
       and couple.group_type = 'couple'
      join public.intake_requests request
        on request.invited_group_id = couple.id
      join public.intake_request_people person
        on person.intake_request_id = request.id
       and person.gender = new.gender
      join public.profiles profile
        on profile.id = membership.profile_id
       and lower(person.email) = lower(profile.email)
      where membership.profile_id = new.id
        and membership.ended_at is null
        and couple_group_ids is not null
        and couple.id = any(couple_group_ids)
      order by request.created_at desc, request.id
      limit 1;
    end if;

    if selected_couple_group_id is null then
      raise exception 'Not authorized to update profile gender';
    end if;
  end if;

  audit_details := jsonb_build_object(
    'couple_group_ids', coalesce(to_jsonb(couple_group_ids), '[]'::jsonb),
    'old_gender', old.gender,
    'new_gender', new.gender,
    'gender', new.gender
  );
  if selected_couple_group_id is not null then
    audit_details := audit_details || jsonb_build_object('couple_group_id', selected_couple_group_id);
  end if;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details)
  values (actor, 'profile.gender_updated', 'profile', new.id, audit_details);

  if has_rpc_context then
    delete from private.profile_gender_change_context context
    where context.transaction_id = txid_current()
      and context.profile_id = new.id
      and context.actor_id = actor;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_and_audit_profile_gender_change() from public, anon, authenticated, service_role;

create trigger guard_and_audit_profile_gender_change
before update of gender on public.profiles
for each row execute function private.guard_and_audit_profile_gender_change();

-- The trigger is the single audit writer for both direct Admin changes and
-- updates made through the existing authorized RPC.
create or replace function public.update_couple_partner_gender(
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

  insert into private.profile_gender_change_context (
    transaction_id, profile_id, actor_id, couple_group_id
  ) values (txid_current(), target_profile_id, actor, target_couple_group_id);

  update public.profiles set gender = target_gender where id = target_profile_id;
  if not found then raise exception 'Profile not found'; end if;

  delete from private.profile_gender_change_context
  where transaction_id = txid_current()
    and profile_id = target_profile_id
    and actor_id = actor;

  return true;
end;
$$;

revoke all on function public.update_couple_partner_gender(uuid, uuid, text) from public, anon;
grant execute on function public.update_couple_partner_gender(uuid, uuid, text) to authenticated;
