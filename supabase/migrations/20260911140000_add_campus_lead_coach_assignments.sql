create table public.campus_lead_coach_assignments (
  id uuid primary key default gen_random_uuid(),
  campus_lead_group_id uuid not null references public.groups(id) on delete restrict,
  coach_group_id uuid not null references public.groups(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campus_lead_coach_assignments_distinct_groups check (campus_lead_group_id <> coach_group_id),
  constraint campus_lead_coach_assignments_dates_ordered check (ended_at is null or ended_at >= started_at)
);

create unique index campus_lead_coach_assignments_one_active_coach_idx on public.campus_lead_coach_assignments (coach_group_id) where ended_at is null;
create unique index campus_lead_coach_assignments_one_active_pair_idx on public.campus_lead_coach_assignments (campus_lead_group_id, coach_group_id) where ended_at is null;
create index campus_lead_coach_assignments_active_lead_idx on public.campus_lead_coach_assignments (campus_lead_group_id, coach_group_id) where ended_at is null;

create or replace function private.validate_campus_lead_coach_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.groups lead join public.groups coach on coach.id = new.coach_group_id where lead.id = new.campus_lead_group_id and lead.active and coach.active and lead.group_type = 'campus_lead_team' and coach.group_type = 'coach_team' and lead.campus_id = coach.campus_id) then
    raise exception 'Campus Lead and Coach teams must be active and on the same campus';
  end if;
  if (select count(*) from public.group_members member join public.profiles profile on profile.id = member.profile_id where member.group_id = new.campus_lead_group_id and member.ended_at is null and profile.status = 'active') <> 2 or (select count(*) from public.group_members member join public.profiles profile on profile.id = member.profile_id where member.group_id = new.coach_group_id and member.ended_at is null and profile.status = 'active') <> 2 then
    raise exception 'Campus Lead and Coach teams must have two active members';
  end if;
  return new;
end;
$$;

create trigger validate_campus_lead_coach_assignment_before_write before insert or update of campus_lead_group_id, coach_group_id on public.campus_lead_coach_assignments for each row execute function private.validate_campus_lead_coach_assignment();

alter table public.campus_lead_coach_assignments enable row level security;
revoke all on public.campus_lead_coach_assignments from anon, authenticated;

create or replace function public.assign_campus_lead_coach(target_campus_lead_group_id uuid, target_coach_group_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing public.campus_lead_coach_assignments%rowtype; assignment_id uuid; is_admin boolean; is_own_lead boolean;
begin
  is_admin := private.current_user_has_role(array['super_admin','admin']::public.app_role[]);
  is_own_lead := exists (select 1 from public.group_members where group_id = target_campus_lead_group_id and profile_id = actor and ended_at is null) and private.current_user_has_role(array['campus_lead']::public.app_role[]);
  if actor is null or not (is_admin or is_own_lead) then raise exception 'Not authorized to manage this Campus Lead team'; end if;
  if is_own_lead and not exists (select 1 from public.campus_lead_assignments scope join public.groups lead on lead.id = target_campus_lead_group_id where scope.profile_id = actor and scope.campus_id = lead.campus_id and scope.ended_at is null) then raise exception 'Campus Lead team is outside your campus scope'; end if;
  select * into existing from public.campus_lead_coach_assignments where coach_group_id = target_coach_group_id and ended_at is null for update;
  if found and existing.campus_lead_group_id = target_campus_lead_group_id then return existing.id; end if;
  if found and not is_admin then raise exception 'Coach is assigned to another Campus Lead team'; end if;
  if found then update public.campus_lead_coach_assignments set ended_at = now() where id = existing.id; end if;
  insert into public.campus_lead_coach_assignments (campus_lead_group_id, coach_group_id, assigned_by) values (target_campus_lead_group_id, target_coach_group_id, actor) returning id into assignment_id;
  return assignment_id;
end;
$$;

revoke all on function public.assign_campus_lead_coach(uuid, uuid) from public;
grant execute on function public.assign_campus_lead_coach(uuid, uuid) to authenticated;
