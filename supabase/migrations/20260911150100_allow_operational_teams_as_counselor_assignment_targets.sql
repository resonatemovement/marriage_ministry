create or replace function private.validate_case_assignment_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignment_type = 'campus_lead' then
    -- Legacy profile-targeted history remains readable. New writes use a Campus Lead team.
    if new.assigned_group_id is null then
      if new.assigned_profile_id is null then raise exception 'Campus Lead assignments require a target'; end if;
      return new;
    end if;
    if new.assigned_profile_id is not null or not exists (
      select 1 from public.groups
      where id = new.assigned_group_id and active and group_type = 'campus_lead_team'
    ) then raise exception 'Campus Lead assignments require an active Campus Lead team'; end if;
    return new;
  end if;

  if new.assigned_profile_id is not null or not exists (
    select 1 from public.groups
    where id = new.assigned_group_id
      and active
      and (
        (new.assignment_type = 'coach' and group_type = 'coach_team'::public.group_type)
        or (new.assignment_type = 'counselor' and group_type in ('counselor_team'::public.group_type, 'coach_team'::public.group_type, 'campus_lead_team'::public.group_type))
      )
  ) then raise exception 'Assignment group type does not match assignment type'; end if;
  return new;
end;
$$;
