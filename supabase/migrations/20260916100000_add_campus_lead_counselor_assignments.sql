create table public.campus_lead_counselor_assignments (
  id uuid primary key default gen_random_uuid(),
  campus_lead_group_id uuid not null references public.groups(id) on delete restrict,
  counselor_group_id uuid not null references public.groups(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint campus_lead_counselor_assignments_distinct_groups check (campus_lead_group_id <> counselor_group_id),
  constraint campus_lead_counselor_assignments_dates_ordered check (ended_at is null or ended_at >= started_at)
);

create unique index campus_lead_counselor_assignments_one_active_counselor_idx on public.campus_lead_counselor_assignments (counselor_group_id) where ended_at is null;
create unique index campus_lead_counselor_assignments_one_active_pair_idx on public.campus_lead_counselor_assignments (campus_lead_group_id, counselor_group_id) where ended_at is null;
create index campus_lead_counselor_assignments_active_lead_idx on public.campus_lead_counselor_assignments (campus_lead_group_id, counselor_group_id) where ended_at is null;

create or replace function private.validate_campus_lead_counselor_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.groups lead
    join public.groups counselor on counselor.id = new.counselor_group_id
    where lead.id = new.campus_lead_group_id
      and lead.active and counselor.active
      and lead.group_type = 'campus_lead_team' and counselor.group_type = 'counselor_team'
      and lead.campus_id = counselor.campus_id
  ) then raise exception 'Campus Lead and Counselor teams must be active and on the same campus'; end if;
  if exists (
    select 1 from public.groups team
    where team.id in (new.campus_lead_group_id, new.counselor_group_id)
      and (
        (select count(*) from public.group_members member join public.profiles profile on profile.id = member.profile_id where member.group_id = team.id and member.ended_at is null and profile.status = 'active' and profile.first_name is not null and profile.last_name is not null and profile.email is not null and profile.campus_id is not null and profile.phone is not null and profile.photo_path is not null) <> 2
        or exists (select 1 from public.invitations invitation where invitation.group_id = team.id and invitation.status = 'pending')
      )
  ) then raise exception 'Campus Lead and Counselor teams must be ready for operational assignment'; end if;
  return new;
end;
$$;

create trigger validate_campus_lead_counselor_assignment_before_write before insert or update of campus_lead_group_id, counselor_group_id on public.campus_lead_counselor_assignments for each row execute function private.validate_campus_lead_counselor_assignment();

alter table public.campus_lead_counselor_assignments enable row level security;
revoke all on public.campus_lead_counselor_assignments from anon, authenticated;
grant select on public.campus_lead_counselor_assignments to authenticated;
create policy campus_lead_counselor_assignments_read_admin on public.campus_lead_counselor_assignments for select to authenticated using ((select private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])));

create or replace function public.assign_campus_lead_counselor(target_campus_lead_group_id uuid, target_counselor_group_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then raise exception 'Only an Admin or Super Admin may assign Campus Lead Counselors'; end if;
  if exists (select 1 from public.campus_lead_counselor_assignments where counselor_group_id = target_counselor_group_id and ended_at is null) then raise exception 'Counselor is already assigned to a Campus Lead team'; end if;
  insert into public.campus_lead_counselor_assignments (campus_lead_group_id, counselor_group_id, assigned_by) values (target_campus_lead_group_id, target_counselor_group_id, actor) returning id into assignment_id;
  return assignment_id;
end;
$$;

create or replace function public.unassign_campus_lead_counselor(target_campus_lead_group_id uuid, target_counselor_group_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); assignment_id uuid;
begin
  if actor is null or not private.current_user_has_role(array['super_admin', 'admin']::public.app_role[]) then raise exception 'Only an Admin or Super Admin may unassign Campus Lead Counselors'; end if;
  select id into assignment_id from public.campus_lead_counselor_assignments where campus_lead_group_id = target_campus_lead_group_id and counselor_group_id = target_counselor_group_id and ended_at is null for update;
  if assignment_id is null then return false; end if;
  update public.campus_lead_counselor_assignments set ended_at = now() where id = assignment_id;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, details) values (actor, 'campus_lead_counselor.unassigned', 'campus_lead_counselor_assignment', assignment_id, jsonb_build_object('campus_lead_group_id', target_campus_lead_group_id, 'counselor_group_id', target_counselor_group_id));
  return true;
end;
$$;

revoke all on function public.assign_campus_lead_counselor(uuid, uuid) from public;
grant execute on function public.assign_campus_lead_counselor(uuid, uuid) to authenticated;
revoke execute on function public.unassign_campus_lead_counselor(uuid, uuid) from public, anon;
grant execute on function public.unassign_campus_lead_counselor(uuid, uuid) to authenticated;
