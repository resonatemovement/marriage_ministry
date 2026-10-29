-- Keep profiles.gender nullable for untouched legacy profiles, but require
-- every Edit Details update to explicitly submit a valid Male/Female value.
-- The existing authorized gender RPC remains the sole audit path.
create or replace function public.update_couple_partner_details(
  target_couple_group_id uuid,
  target_profile_id uuid,
  target_first_name text,
  target_last_name text,
  target_phone text,
  target_gender text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  is_admin boolean;
  normalized_phone text := btrim(coalesce(target_phone, ''));
begin
  if actor is null then
    raise exception 'Authentication is required';
  end if;
  if btrim(coalesce(target_first_name, '')) = ''
    or length(btrim(target_first_name)) > 80
    or btrim(coalesce(target_last_name, '')) = ''
    or length(btrim(target_last_name)) > 80 then
    raise exception 'First and last name are required';
  end if;
  if normalized_phone !~ '^\+1[0-9]{10}$' then
    raise exception 'Enter a valid phone number';
  end if;
  if target_gender is null or target_gender not in ('male', 'female') then
    raise exception 'Choose a valid gender';
  end if;

  is_admin := private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]);
  if not is_admin and not (
    private.current_user_has_role(array['counselor']::public.app_role[])
    and exists (
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
       and couple_membership.profile_id = target_profile_id
       and couple_membership.ended_at is null
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
  ) then
    raise exception 'Not authorized to update this Couple';
  end if;

  if not exists (
    select 1
    from public.groups couple
    join public.group_members membership
      on membership.group_id = couple.id
     and membership.profile_id = target_profile_id
    where couple.id = target_couple_group_id
      and couple.group_type = 'couple'
      and (
        is_admin
        or (couple.active and membership.ended_at is null)
      )
  ) then
    raise exception 'Profile does not belong to this Couple';
  end if;

  update public.profiles
  set first_name = btrim(target_first_name),
      last_name = btrim(target_last_name),
      phone = normalized_phone
  where id = target_profile_id;
  if not found then
    raise exception 'Profile not found';
  end if;

  -- Always delegate the selected value. An unchanged value produces no audit
  -- event in the existing trigger; a rejected gender change aborts this whole
  -- SECURITY DEFINER RPC transaction, including the names/phone update above.
  perform public.update_couple_partner_gender(
    target_couple_group_id,
    target_profile_id,
    target_gender
  );

  return true;
end;
$$;

revoke all on function public.update_couple_partner_details(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.update_couple_partner_details(uuid, uuid, text, text, text, text) to authenticated;
